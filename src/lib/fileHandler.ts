import { shell } from 'electron';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import AdmZip from 'adm-zip';
import * as path from 'path';
import * as fs from 'fs';
import crypto from 'crypto';
const ffmpegStatic = require('ffmpeg-static');

// Configure ffmpeg path
if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

interface FileInfo {
  path: string;
  type: 'image' | 'video' | 'archive' | 'other';
  thumbnailPath?: string;
}

// Allowed file extensions
const ALLOWED_EXTENSIONS = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  video: ['.mp4', '.avi', '.mkv', '.mov'],
  archive: ['.zip', '.7z']
};

// Validate file path safety
function isValidFilePath(filePath: string): boolean {
  try {
    // Ensure the path exists
    if (!fs.existsSync(filePath)) {
      return false;
    }

    // Reject symbolic links
    const stats = fs.lstatSync(filePath);
    if (stats.isSymbolicLink()) {
      return false;
    }

    // Check extension
    const ext = path.extname(filePath).toLowerCase();
    const allowedExts = [
      ...ALLOWED_EXTENSIONS.image,
      ...ALLOWED_EXTENSIONS.video,
      ...ALLOWED_EXTENSIONS.archive
    ];
    
    return allowedExts.includes(ext);
  } catch (error) {
    return false;
  }
}

export function getThumbnailHash(filePath: string): string {
  // Normalize path for stable hashing
  const normalizedPath = filePath.trim().replace(/\\/g, '/').toLowerCase();
  return crypto.createHash('sha1').update(normalizedPath).digest('hex');
}

function getAutoThumbnailTimestamp(duration: number | null): number {
  if (duration === null || !Number.isFinite(duration)) {
    return 1;
  }

  if (duration <= 1) {
    return 0;
  }

  return duration / 2;
}

export async function generateThumbnail(filePath: string, timestampSec?: number | null): Promise<string | null> {
  // Validate file path
  if (!isValidFilePath(filePath)) {
    throw new Error('Invalid or unauthorized file path');
  }

  if (!ffmpegStatic || !fs.existsSync(ffmpegStatic)) {
    throw new Error('ffmpeg-static binary path could not be found. Check the ffmpeg-static install and node_modules/ffmpeg-static path.');
  }

  const fileType = getFileType(filePath);
  const thumbnailDir = path.join('save', 'thumbnails');
  
  if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir, { recursive: true });
  }

  const hash = getThumbnailHash(filePath);
  const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);

  try {
    switch (fileType) {
      case 'image':
        await sharp(filePath)
          .resize(400, 400, { fit: 'inside' })
          .toFile(thumbnailPath);
        return thumbnailPath;

      case 'video':
        // Read video duration
        const ffprobeStatic = require('ffprobe-static');
        if (ffprobeStatic && fs.existsSync(ffprobeStatic)) {
          ffmpeg.setFfprobePath(ffprobeStatic);
        }
        
        // Inspect duration with ffprobe
        const duration = await new Promise<number | null>((resolve) => {
          ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
            if (err || !metadata?.format?.duration) {
              resolve(null);
            } else {
              resolve(metadata.format.duration);
            }
          });
        });
        
        let finalTimestampSec = typeof timestampSec === 'number' ? timestampSec : getAutoThumbnailTimestamp(duration);
        if (duration !== null && finalTimestampSec > duration) {
          finalTimestampSec = getAutoThumbnailTimestamp(duration);
        }
        
        return new Promise((resolve, reject) => {
          ffmpeg(filePath)
            .screenshots({
              timestamps: [finalTimestampSec],
              filename: path.basename(thumbnailPath),
              folder: thumbnailDir,
              size: '400x?'
            })
            .on('end', () => resolve(thumbnailPath))
            .on('error', (err) => {
              reject(err);
            });
        });

      case 'archive':
        const zip = new AdmZip(filePath);
        const zipEntries = zip.getEntries();
        const imageEntry = zipEntries.find(entry => 
          /\.(jpg|jpeg|png|gif)$/i.test(entry.entryName)
        );

        if (imageEntry) {
          const buffer = zip.readFile(imageEntry);
          if (buffer) {
            await sharp(buffer)
              .resize(400, 400, { fit: 'inside' })
              .toFile(thumbnailPath);
            return thumbnailPath;
          } else {
            return null;
          }
        }
        return null;

      default:
        return null;
    }
  } catch (error) {
    return null;
  }
}

export function getFileType(filePath: string): FileInfo['type'] {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ALLOWED_EXTENSIONS.image.includes(ext)) {
    return 'image';
  }
  if (ALLOWED_EXTENSIONS.video.includes(ext)) {
    return 'video';
  }
  if (ALLOWED_EXTENSIONS.archive.includes(ext)) {
    return 'archive';
  }
  return 'other';
}

export async function openFile(filePath: string): Promise<void> {
  // Validate file path
  if (!isValidFilePath(filePath)) {
    throw new Error('Invalid or unauthorized file path');
  }

  try {
    await shell.openPath(filePath);
  } catch (error) {
    throw error;
  }
}
