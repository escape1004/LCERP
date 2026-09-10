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

export function registerFileHandlers() {
  ipcMain.handle('openExternal', async (_, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      log('Error opening external URL:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:getTables', () => {
    return db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  });

  ipcMain.handle('db:getTableData', (event, tableName, options = {}) => {
    const validTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    if (!validTables.some(t => t.name === tableName)) {
      throw new Error('Invalid table name');
    }

    const requestedPage = Number(options.page);
    const requestedPageSize = Number(options.pageSize);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = Number.isInteger(requestedPageSize)
      ? Math.min(500, Math.max(10, requestedPageSize))
      : 100;
    const offset = (page - 1) * pageSize;
    const quotedTableName = `"${tableName.replace(/"/g, '""')}"`;

    const total = db.prepare(`SELECT COUNT(*) AS count FROM ${quotedTableName}`).get().count;
    const rows = db.prepare(`SELECT * FROM ${quotedTableName} LIMIT ? OFFSET ?`).all(pageSize, offset);
    const columnNames = db.prepare(`PRAGMA table_info(${quotedTableName})`).all().map(column => column.name);
    const columns = columnNames.map(name => ({ name, hidden: false }));
    return { columns, rows, total, page, pageSize };
  });

  ipcMain.handle('db:getPath', () => dbPath);

  ipcMain.handle('db:openFile', () => {
    shell.showItemInFolder(dbPath);
  });

  ipcMain.handle('shell:openExternal', async (_, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      log('Error opening URL:', error);
      return { success: false, error: error.message };
    }
  });

  function getDialogDefaultPath(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') return undefined;

    const trimmedPath = inputPath.trim();
    if (!trimmedPath) return undefined;

    const candidates = path.isAbsolute(trimmedPath)
      ? [trimmedPath]
      : [
          path.join(app.getAppPath(), trimmedPath),
          path.join(appDataDir, trimmedPath)
        ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const stat = fs.statSync(candidate);
        return stat.isDirectory() ? candidate : path.dirname(candidate);
      }

      const parentDir = path.dirname(candidate);
      if (parentDir && fs.existsSync(parentDir)) {
        return parentDir;
      }
    }

    return undefined;
  }

  ipcMain.handle('openFileDialog', async (_, defaultPath) => {
    const dialogOptions: any = {
      properties: ['openFile'],
      title: '파일 선택'
    };
    const resolvedDefaultPath = getDialogDefaultPath(defaultPath);
    if (resolvedDefaultPath) {
      dialogOptions.defaultPath = resolvedDefaultPath;
    }

    return await dialog.showOpenDialog({
      ...dialogOptions
    });
  });

  ipcMain.handle('openDirectoryDialog', async () => {
    return await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '폴더 선택'
    });
  });

  // 이미지 전용 파일 선택 다이얼로그
  ipcMain.handle('openImageFileDialog', async (_, defaultPath) => {
    const dialogOptions: any = {
      properties: ['openFile'],
      title: '이미지 파일 선택',
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }
      ]
    };
    const resolvedDefaultPath = getDialogDefaultPath(defaultPath);
    if (resolvedDefaultPath) {
      dialogOptions.defaultPath = resolvedDefaultPath;
    }

    return await dialog.showOpenDialog({
      ...dialogOptions
    });
  });

  ipcMain.handle('openFile', async (_, filePath) => {
    if (!filePath) {
      return { success: false, error: '파일 경로 없음' };
    }
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('checkFileExists', async (_, filePath) => {
    try {
      return fs.existsSync(filePath);
    } catch (e) {
      return false;
    }
  });

  ipcMain.handle('openDbFile', () => {
    shell.showItemInFolder(dbPath);
  });

  ipcMain.handle('getAppRoot', () => {
    return app.getAppPath();
  });

  ipcMain.handle('db:getFileType', async (_, filePath) => {
    return getFileTypeFromPath(filePath);
  });

  ipcMain.handle('getFileDataUrl', async (_, filePath) => {
    try {
      if (!fs.existsSync(filePath)) return null;

      const ext = path.extname(filePath).toLowerCase();
      const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(ext);

      // 동영상 파일이고 크기가 50MB 이상인 경우 스트리밍 방식 사용
      if (isVideo) {
        const stats = fs.statSync(filePath);
        const fileSizeInMB = stats.size / (1024 * 1024);

        if (fileSizeInMB > 50) {
          log('Large video detected, using streaming mode:', { filePath, sizeMB: fileSizeInMB });
          return 'stream'; // 스트리밍 방식 사용을 나타내는 특별한 값
        }
      }

      // 일반 파일 처리
      const data = fs.readFileSync(filePath);
      let mimeType = 'application/octet-stream';
      if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (isVideo) {
        const videoMimeTypes = {
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
          '.ogg': 'video/ogg',
          '.avi': 'video/x-msvideo',
          '.mkv': 'video/x-matroska',
          '.mov': 'video/quicktime',
          '.wmv': 'video/x-ms-wmv',
          '.flv': 'video/x-flv',
          '.m4v': 'video/x-m4v',
          '.3gp': 'video/3gpp',
          '.ts': 'video/mp2t'
        };
        mimeType = videoMimeTypes[ext] || 'video/mp4';
      }
      return `data:${mimeType};base64,${data.toString('base64')}`;
    } catch (e) {
      log('Error in getFileDataUrl:', e);
      return null;
    }
  });

  ipcMain.handle('getFileSize', async (_, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }
      const stats = fs.statSync(filePath);
      const bytes = stats.size;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      const size = (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
      return { success: true, size };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
