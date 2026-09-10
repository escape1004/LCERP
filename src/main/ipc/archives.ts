import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import url from 'url';
import unzipper from 'unzipper';
import XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import {
  logPath,
  logStream,
  isDev,
  isPreview,
  projectRoot,
  appDataDir,
  dbPath,
  backupDir,
  configPath,
  DEFAULT_TRANSLATION_MODEL,
  SUPPORTED_TRANSLATION_MODELS,
  defaultConfig,
  appConfig,
  currentProfileId,
  setCurrentProfileId,
  DEFAULT_PROFILE_COLOR,
  DEFAULT_DATE_PARSE_FORMATS,
  loadAppConfig,
  saveAppConfig,
  normalizeZoomPercent,
  getConfiguredZoomPercent,
  normalizeThumbnailPreviewScale,
  getConfiguredThumbnailPreviewScale,
  normalizeDefaultGalleryZoom,
  getConfiguredDefaultGalleryZoom,
  normalizeTranslationTargetLanguage,
  getConfiguredTranslationTargetLanguage,
  normalizeTranslationModel,
  getConfiguredTranslationModel,
  normalizeBackupInterval,
  getConfiguredBackupInterval,
  getConfiguredBackupDir,
  normalizePasswordLockMaxAttempts,
  normalizePasswordLockDurationMinutes,
  getConfiguredPasswordLockMaxAttempts,
  getConfiguredPasswordLockDurationMinutes,
  normalizeIdleLockMinutes,
  getConfiguredIdleLockMinutes,
  getPasswordLockUntil,
  resetPasswordLockState,
  getTranslationLanguageLabel,
  normalizeDateParseFormats,
  normalizeDateParseFormat,
  getDateParseFormats,
  getStoredDateOutputFormat,
  extractResponseText,
  translateTextWithOpenAi,
  normalizeImportedDateValue,
  applyWindowZoom,
  PASSWORD_SCRYPT_PREFIX,
  PASSWORD_SCRYPT_KEY_LENGTH,
  PASSWORD_SCRYPT_OPTIONS,
  hashLegacyPassword,
  derivePasswordKey,
  createPasswordHash,
  timingSafeBufferEqual,
  verifyStoredPassword,
  getCurrentProfileIdOrThrow,
  getProfileById,
  ensureCurrentProfileExists,
  getScopedCategory,
  getScopedRecord,
  ensureCategoryBelongsToCurrentProfile,
  getCategorySubtreeIds,
  getSqlPlaceholders,
  ensureRecordBelongsToCurrentProfile,
  createProfile,
  ensureDefaultProfile,
  log,
  db
} from '../store';
import { initializeDatabase } from '../database';
import { getFileTypeFromPath, getThumbnailHash } from '../lib/files';
import { decodeSubtitleBuffer } from '../lib/subtitles';
import { electronDistDir, getFfmpegToolPaths, getUnpackedFfprobePath } from '../ffmpeg-paths';
import {
  MAX_AUTOMATIC_BACKUPS,
  automaticBackupTimer,
  automaticBackupInProgress,
  createBackupTimestamp,
  cleanupOldAutomaticBackups,
  createDatabaseBackup,
  runAutomaticBackup,
  startAutomaticBackup,
  stopAutomaticBackup
} from '../backup';
import {
  normalizeZipPath,
  isSameZipEntry,
  getArchiveVideoCachePath,
  archiveVideoExtractPromises,
  ARCHIVE_TEXT_MAX_BYTES,
  ARCHIVE_DATA_URL_MAX_BYTES,
  archiveIoQueue,
  enqueueArchiveIo,
  findArchiveEntry,
  readArchiveEntryBuffer,
  ensureArchiveVideoExtracted,
  ARCHIVE_IMAGE_RE,
  ARCHIVE_VIDEO_RE,
  listArchiveFileEntries
} from '../media/archives';
import {
  generateUUID,
  sanitizeThumbnailPathSegment,
  getThumbnailRootDir,
  getLegacyThumbnailPath,
  getThumbnailCategorySegments,
  resolveThumbnailContext,
  getStructuredThumbnailDir,
  getThumbnailPathForContext,
  ensureThumbnailDirForContext,
  getThumbnailContextForRecordLike,
  copyLegacyThumbnailToStructuredPath,
  ensureDirectoryExists,
  removeEmptyThumbnailDirsUpward,
  relocateThumbnailFile,
  collectThumbnailMigrationEntries,
  getStructuredThumbnailDirsForCategoryIds,
  migrateStructuredThumbnailEntries,
  deleteThumbnail,
  getAutoThumbnailTimestamp,
  getThumbnailTimestampForFile,
  writeVideoFileThumbnail,
  generateThumbnailFromArchive,
  generateThumbnail,
  cleanupThumbnailsForCategory,
  cleanupRelationReferences
} from '../media/thumbnails';
import {
  hasEmbeddedVideoCover,
  extractEmbeddedVideoCover,
  persistCustomThumbnailToVideoMetadata,
  removeEmbeddedVideoCover
} from '../media/video-cover';
import {
  renameFileWithRetry,
  removeFileWithRetry
} from '../fs-retry';
import {
  checkDuplicateFields,
  IMPORT_EXPORT_BATCH_SIZE,
  sanitizeFileName,
  sanitizeExcelSheetName,
  ensureUniqueSheetName,
  getCategoryOrThrow,
  getCategoryRecordsForProfile,
  getCategoryExportSubtree,
  getDashboardWarnings,
  getRelationKeyField,
  buildRelationResolvers,
  getRelationExportValue,
  getExcelHeaderLabel,
  getExportHeaders,
  getExportRowValues,
  getExcelColumnWidth,
  buildDiscordStyleSheetXml,
  applyDiscordExcelStyling,
  serializeExportValue,
  escapeCsvCell,
  buildCategoryRecordsCsvContent,
  appendCategoryRecordsWorksheet,
  parseBooleanImportValue,
  parseArrayImportValue,
  parsePercentageImportPart,
  normalizePercentageImportValue,
  parseImportedFieldValue,
  resolveImportedRelationValue,
  createDefaultRecordData,
  getHeaderFieldMap,
  getUniqueFieldValueSets,
  insertImportedRecordsBatch,
  exportCategoryRecordsToCsv,
  exportCategoryRecordsToExcel,
  readImportRowsFromFile,
  importCategoryRecordsFromRows
} from '../import-export';
import { resolveUserFilePath, sanitizeArchiveEntryName } from '../lib/security';

export function registerArchiveHandlers() {
  const requireFilePath = (filePath) => resolveUserFilePath(filePath, appDataDir);

  // getArchiveFiles 핸들러
  ipcMain.handle('getArchiveFiles', async (_, filePath) => {
    try {
      const resolvedPath = requireFilePath(filePath);
      if (!resolvedPath || !fs.existsSync(resolvedPath)) return [];
      const ext = path.extname(resolvedPath).toLowerCase();
      if (ext === '.7z') return [];

      // 대용량 파일을 위해 unzipper 스트리밍 방식 사용
      const entries = [];
      await new Promise((resolve, reject) => {
        fs.createReadStream(resolvedPath)
          .pipe(unzipper.Parse())
          .on('entry', function (entry) {
            entries.push({
              name: normalizeZipPath(entry.path),
              size: entry.vars.uncompressedSize,
              isDirectory: entry.type === 'Directory',
              comment: ''
            });
            entry.autodrain();
          })
          .on('close', resolve)
          .on('error', reject);
      });

      return entries;
    } catch (e) {
      log('Error in getArchiveFiles:', e);
      return [];
    }
  });

  ipcMain.handle('openArchiveFile', async (_, archivePath, fileName) => {
    try {
      const resolvedArchivePath = requireFilePath(archivePath);
      const safeFileName = sanitizeArchiveEntryName(fileName);
      if (!resolvedArchivePath || !safeFileName || !fs.existsSync(resolvedArchivePath)) {
        return { success: false, error: '압축파일 또는 내부 파일을 찾을 수 없습니다.' };
      }

      const archiveExtension = path.extname(resolvedArchivePath).toLowerCase();
      if (archiveExtension === '.7z') {
        return { success: false, error: '7z 압축파일은 현재 지원되지 않습니다.' };
      }

      const directory = await unzipper.Open.file(resolvedArchivePath);
      const entry = directory.files.find((candidate) => (
        candidate.type !== 'Directory'
        && !String(candidate.path || '').endsWith('/')
        && isSameZipEntry(candidate.path, safeFileName)
      ));

      if (!entry) {
        return { success: false, error: '압축파일 내부에서 파일을 찾을 수 없습니다.' };
      }

      const normalizedFileName = normalizeZipPath(safeFileName);
      const originalBaseName = path.posix.basename(normalizedFileName) || 'archive-file';
      const rawExtension = path.extname(originalBaseName);
      const safeExtension = /^\.[a-z0-9]{1,10}$/i.test(rawExtension) ? rawExtension : '';
      const sanitizedBaseName = originalBaseName
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/[. ]+$/g, '')
        .slice(0, 180);
      const fallbackFileName = `archive-file${safeExtension}`;
      const extractedFileName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(sanitizedBaseName)
        ? `_${sanitizedBaseName}`
        : (sanitizedBaseName || fallbackFileName);
      const archiveStat = fs.statSync(resolvedArchivePath);
      const cacheKey = crypto.createHash('sha1')
        .update(`${path.resolve(resolvedArchivePath)}|${archiveStat.mtimeMs}|${normalizedFileName}`)
        .digest('hex');
      const cacheDirectory = path.join(app.getPath('temp'), 'local-erp-archive-files', cacheKey);
      const extractedPath = path.join(cacheDirectory, extractedFileName);
      fs.mkdirSync(cacheDirectory, { recursive: true });

      const expectedSize = Number(entry.uncompressedSize) || 0;
      const cachedFileIsValid = fs.existsSync(extractedPath)
        && (expectedSize <= 0 || fs.statSync(extractedPath).size === expectedSize);

      if (!cachedFileIsValid) {
        if (fs.existsSync(extractedPath)) fs.unlinkSync(extractedPath);
        await new Promise((resolve, reject) => {
          entry.stream()
            .on('error', reject)
            .pipe(fs.createWriteStream(extractedPath))
            .on('error', reject)
            .on('finish', resolve);
        });
      }

      const openError = await shell.openPath(extractedPath);
      if (openError) {
        return { success: false, error: openError };
      }
      return { success: true };
    } catch (error) {
      log('Error opening archive file:', error);
      return { success: false, error: error.message || '압축파일 내부 파일을 실행하지 못했습니다.' };
    }
  });

  // getArchiveFileDataUrl 핸들러
  ipcMain.handle('getArchiveFileDataUrl', async (_, filePath, fileName) => {
    try {
      const resolvedPath = requireFilePath(filePath);
      const safeFileName = sanitizeArchiveEntryName(fileName);
      if (!resolvedPath || !safeFileName || !fs.existsSync(resolvedPath)) return null;
      const ext = path.extname(resolvedPath).toLowerCase();
      if (ext === '.7z') return null;
      const requestedFileExt = path.extname(safeFileName).toLowerCase();
      const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(requestedFileExt);
      if (isVideo) return null;

      const buffer = await enqueueArchiveIo(() => (
        readArchiveEntryBuffer(resolvedPath, safeFileName, ARCHIVE_DATA_URL_MAX_BYTES)
      ));
      if (!buffer) return null;

      let mimeType = 'application/octet-stream';
      if (['.jpg', '.jpeg'].includes(requestedFileExt)) mimeType = 'image/jpeg';
      else if (requestedFileExt === '.png') mimeType = 'image/png';
      else if (requestedFileExt === '.gif') mimeType = 'image/gif';
      else if (requestedFileExt === '.webp') mimeType = 'image/webp';
      else if (requestedFileExt === '.txt') mimeType = 'text/plain';
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch (e) {
      log('Error in getArchiveFileDataUrl:', e);
      return null;
    }
  });

  // 압축 동영상은 크기와 무관하게 스트리밍한다.
  ipcMain.handle('getArchiveFileStreamInfo', async (_, filePath, fileName) => {
    try {
      const resolvedPath = requireFilePath(filePath);
      const safeFileName = sanitizeArchiveEntryName(fileName);
      if (!resolvedPath || !safeFileName || !fs.existsSync(resolvedPath)) return null;
      const ext = path.extname(resolvedPath).toLowerCase();
      if (ext === '.7z') return null;

      const fileExt = path.extname(safeFileName).toLowerCase();
      const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(fileExt);

      if (!isVideo) return null;

      return 'stream';
    } catch (e) {
      log('Error in getArchiveFileStreamInfo:', e);
      return null;
    }
  });

  // getArchiveFileText 핸들러
  ipcMain.handle('getArchiveFileText', async (_, filePath, fileName) => {
    try {
      const resolvedPath = requireFilePath(filePath);
      const safeFileName = sanitizeArchiveEntryName(fileName);
      if (!resolvedPath || !safeFileName || !fs.existsSync(resolvedPath)) {
        return null;
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      if (ext === '.7z') {
        return null;
      }

      const fileExt = path.extname(safeFileName).toLowerCase();
      if (!['.txt', '.srt', '.vtt', '.ass'].includes(fileExt)) {
        log('[텍스트 파일이 아님]', fileName);
        return null;
      }

      const buffer = await enqueueArchiveIo(() => (
        readArchiveEntryBuffer(resolvedPath, safeFileName, ARCHIVE_TEXT_MAX_BYTES)
      ));
      if (!buffer) return null;

      const text = fileExt === '.txt'
        ? buffer.toString('utf8')
        : decodeSubtitleBuffer(buffer);
      log('[압축 파일 텍스트 읽기]', fileName);
      return text;
    } catch (e) {
      log('[압축 파일 텍스트 읽기 에러]', e);
      return null;
    }
  });
}
