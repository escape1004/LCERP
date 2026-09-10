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

export function registerBackupIpcHandlers() {


  ipcMain.handle('setBackupDir', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: getConfiguredBackupDir()
    });
    if (filePaths && filePaths.length > 0) {
      const selectedPath = path.resolve(filePaths[0]);
      try {
        fs.mkdirSync(selectedPath, { recursive: true });
        fs.accessSync(selectedPath, fs.constants.W_OK);
        appConfig.backupDir = selectedPath;
        saveAppConfig();
        startAutomaticBackup();
        return { success: true, path: selectedPath };
      } catch (error) {
        return { success: false, error: error.message || '백업 폴더를 사용할 수 없습니다.' };
      }
    }
    return { success: false, canceled: true };
  });

  ipcMain.handle('setBackupInterval', (_event, minutes) => {
    const normalizedInterval = normalizeBackupInterval(minutes);
    if (normalizedInterval === null || Number(minutes) < 1 || Number(minutes) > 10080) {
      return { success: false, error: '백업 주기는 1분에서 10,080분 사이여야 합니다.' };
    }

    appConfig.backupInterval = normalizedInterval;
    saveAppConfig();
    startAutomaticBackup();
    return { success: true, backupInterval: normalizedInterval };
  });

  ipcMain.handle('setBackupEnabled', (_event, enabled) => {
    appConfig.backupEnabled = enabled === true;
    saveAppConfig();
    startAutomaticBackup();
    return { success: true, backupEnabled: appConfig.backupEnabled };
  });

  ipcMain.handle('backupDatabase', async () => {
    try {
      const backupPath = await createDatabaseBackup();
      return { success: true, path: backupPath };
    } catch (error) {
      log('Backup failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('resetDatabase', () => {
    try {
      const configuredBackupDir = getConfiguredBackupDir();
      if (!fs.existsSync(configuredBackupDir)) {
        fs.mkdirSync(configuredBackupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(configuredBackupDir, `backup-before-reset-${timestamp}.db`);
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, backupPath);
      }

      db.exec('PRAGMA foreign_keys = OFF');
      db.exec('DROP TABLE IF EXISTS records');
      db.exec('DROP TABLE IF EXISTS categories');
      db.exec('PRAGMA foreign_keys = ON');

      initializeDatabase();
      db.exec('VACUUM');

      return { success: true, backupPath };
    } catch (error) {
      log('Reset database failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('openBackupLocation', () => {
    const configuredBackupDir = getConfiguredBackupDir();
    fs.mkdirSync(configuredBackupDir, { recursive: true });
    return shell.openPath(configuredBackupDir).then((openError) => (
      openError
        ? { success: false, error: openError }
        : { success: true }
    ));
  });
}
