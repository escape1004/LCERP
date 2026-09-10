import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import unzipper from 'unzipper';
import { appDataDir, log } from '../store';
import { isSameZipEntry, normalizeZipPath } from '../lib/zip-path';

export { isSameZipEntry, normalizeZipPath };

export function getArchiveVideoCachePath(archivePath, fileName) {
  const hash = crypto.createHash('sha1')
    .update(`${archivePath}|${normalizeZipPath(fileName)}`)
    .digest('hex');
  const ext = path.extname(fileName).toLowerCase() || '.mp4';
  const cacheDir = path.join(appDataDir, 'archive-video-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  return path.join(cacheDir, `${hash}${ext}`);
}

export const archiveVideoExtractPromises = new Map();
export const ARCHIVE_TEXT_MAX_BYTES = 10 * 1024 * 1024;
export const ARCHIVE_DATA_URL_MAX_BYTES = 40 * 1024 * 1024;
export let archiveIoQueue = Promise.resolve();

export function enqueueArchiveIo(task: () => any) {
  const run = archiveIoQueue.then(task, task);
  archiveIoQueue = run.then(() => undefined, () => undefined);
  return run;
}

export async function findArchiveEntry(archivePath, fileName) {
  const directory = await unzipper.Open.file(archivePath);
  return directory.files.find((candidate) => (
    candidate.type !== 'Directory'
    && !String(candidate.path || '').endsWith('/')
    && isSameZipEntry(candidate.path, fileName)
  )) || null;
}

export async function readArchiveEntryBuffer(archivePath, fileName, maxBytes) {
  const entry = await findArchiveEntry(archivePath, fileName);
  if (!entry) return null;

  const size = Number(entry.uncompressedSize) || 0;
  if (maxBytes && size > maxBytes) {
    log('Archive entry skipped because it is too large:', { fileName, size });
    return null;
  }

  return entry.buffer();
}

export async function ensureArchiveVideoExtracted(archivePath, fileName) {
  const cachePath = getArchiveVideoCachePath(archivePath, fileName);
  const inflight = archiveVideoExtractPromises.get(cachePath);
  if (inflight) return inflight;

  const extractPromise = enqueueArchiveIo(async () => {
    const directory = await unzipper.Open.file(archivePath);
    const file = directory.files.find((entry) => (
      entry.type !== 'Directory'
      && !String(entry.path || '').endsWith('/')
      && isSameZipEntry(entry.path, fileName)
    ));

    if (!file) {
      return null;
    }

    const expectedSize = Number(file.uncompressedSize) || 0;
    if (fs.existsSync(cachePath)) {
      const cachedSize = fs.statSync(cachePath).size;
      if (expectedSize <= 0 || cachedSize === expectedSize) {
        return cachePath;
      }
      fs.unlinkSync(cachePath);
    }

    await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(cachePath);
      file.stream()
        .on('error', reject)
        .pipe(writeStream)
        .on('error', reject)
        .on('finish', resolve);
    });

    return cachePath;
  });

  archiveVideoExtractPromises.set(cachePath, extractPromise);
  try {
    return await extractPromise;
  } catch (error) {
    try {
      if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
    } catch {
      // ignore cache cleanup errors
    }
    throw error;
  } finally {
    archiveVideoExtractPromises.delete(cachePath);
  }
}

export const ARCHIVE_IMAGE_RE = /\.(jpg|jpeg|png|gif|webp)$/i;
export const ARCHIVE_VIDEO_RE = /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i;

export function listArchiveFileEntries(directory) {
  return directory.files
    .filter((entry) => entry.type !== 'Directory' && !String(entry.path || '').endsWith('/'))
    .sort((a, b) => normalizeZipPath(a.path).localeCompare(normalizeZipPath(b.path), 'en'));
}
