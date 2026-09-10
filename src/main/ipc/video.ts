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

export function registerVideoHandlers() {
  ipcMain.handle('getVideoSubtitles', async (_, videoPath) => {
    try {
      if (!videoPath || !fs.existsSync(videoPath)) return [];

      const parsedVideoPath = path.parse(videoPath);
      const normalizedVideoBase = parsedVideoPath.name.toLocaleLowerCase();
      const subtitlePattern = /\.(srt|vtt|ass)$/i;

      return fs.readdirSync(parsedVideoPath.dir, { withFileTypes: true })
        .filter(entry => {
          if (!entry.isFile() || !subtitlePattern.test(entry.name)) return false;
          const subtitleBase = path.parse(entry.name).name.toLocaleLowerCase();
          return subtitleBase === normalizedVideoBase || subtitleBase.startsWith(`${normalizedVideoBase}.`);
        })
        .map(entry => {
          const subtitlePath = path.join(parsedVideoPath.dir, entry.name);
          if (fs.statSync(subtitlePath).size > 10 * 1024 * 1024) return null;
          return {
            id: subtitlePath,
            name: entry.name,
            content: decodeSubtitleBuffer(fs.readFileSync(subtitlePath)),
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const aExact = path.parse(a.name).name.toLocaleLowerCase() === normalizedVideoBase;
          const bExact = path.parse(b.name).name.toLocaleLowerCase() === normalizedVideoBase;
          if (aExact !== bExact) return aExact ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    } catch (error) {
      log('Error loading video subtitles:', error);
      return [];
    }
  });

  // getVideoBlobUrl 핸들러 (대용량 동영상 Blob 방식)
  ipcMain.handle('getVideoBlobUrl', async (_, filePath) => {
    try {
      if (!fs.existsSync(filePath)) return null;
      const ext = path.extname(filePath).toLowerCase();
      const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(ext);
      if (!isVideo) return null;
      const stats = fs.statSync(filePath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      // 50MB 이상만 Blob 방식으로 처리
      if (fileSizeInMB > 50) {
        const data = fs.readFileSync(filePath);
        // base64 인코딩
        return {
          base64: data.toString('base64'),
          mimeType: `video/${ext.slice(1)}`
        };
      }
      return null;
    } catch (e) {
      log('Error in getVideoBlobUrl:', e);
      return null;
    }
  });

  ipcMain.handle('getVideoServerPort', () => {
    return globalThis.videoServerPort;
  });

  ipcMain.handle('getVideoDuration', async (_, filePath) => {
    try {
      let normalizedPath = filePath;
      if (!path.isAbsolute(filePath)) {
        normalizedPath = path.join(appDataDir, filePath);
      }
      if (!fs.existsSync(normalizedPath)) {
        return null;
      }

      // ffmpeg/ffprobe 경로를 resources 폴더의 경로로만 강제 지정
      const ffmpegPath = path.join(process.resourcesPath, 'ffmpeg-static', 'ffmpeg.exe');
      const ffprobePath = getUnpackedFfprobePath();
      if (!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
        log('ffmpeg/ffprobe 경로를 찾을 수 없음', { ffmpegPath, ffprobePath });
        return null;
      }
      ffmpeg.setFfmpegPath(ffmpegPath);
      ffmpeg.setFfprobePath(ffprobePath);

      return await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(normalizedPath, (err, metadata) => {
          if (err) {
            console.error('ffprobe error:', err);
            return resolve(null);
          }
          if (metadata && metadata.format && metadata.format.duration) {
            const duration = Math.floor(metadata.format.duration);
            resolve(duration);
          } else {
            resolve(null);
          }
        });
      });
    } catch (e) {
      console.error('Failed to get video duration:', e);
      return null;
    }
  });

  ipcMain.handle('getVideoCodecInfo', async (_, filePath) => {
    try {
      const { ffprobePath } = getFfmpegToolPaths();
      let normalizedPath = filePath;
      if (!path.isAbsolute(filePath)) {
        normalizedPath = path.join(appDataDir, filePath);
      }
      if (!ffprobePath || !fs.existsSync(ffprobePath)) {
        log('getVideoCodecInfo: ffprobe 경로를 찾을 수 없음', { filePath: normalizedPath, ffprobePath });
        return { error: 'ffprobe not found' };
      }
      if (!fs.existsSync(normalizedPath)) {
        return { error: 'File not found' };
      }
      ffmpeg.setFfprobePath(ffprobePath);
      return await new Promise((resolve) => {
        ffmpeg.ffprobe(normalizedPath, (err, metadata) => {
          if (err) return resolve({ error: err.message });
          if (!metadata || !metadata.streams) return resolve({ error: 'No metadata' });
          const video = metadata.streams.find(s => s.codec_type === 'video');
          const audio = metadata.streams.find(s => s.codec_type === 'audio');
          const hasEmbeddedCover = metadata.streams.some((s) => s?.disposition?.attached_pic === 1);
          resolve({
            video: video ? { codec: video.codec_name, profile: video.profile, pix_fmt: video.pix_fmt } : null,
            audio: audio ? { codec: audio.codec_name, sample_rate: audio.sample_rate, channels: audio.channels } : null,
            hasEmbeddedCover,
          });
        });
      });
    } catch (e) {
      return { error: e.message };
    }
  });
}
