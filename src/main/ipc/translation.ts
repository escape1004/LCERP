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

export function registerTranslationHandlers() {


  ipcMain.handle('setTranslationTargetLanguage', (_event, language) => {
    appConfig.translationTargetLanguage = normalizeTranslationTargetLanguage(language);
    saveAppConfig();
    return {
      success: true,
      translationTargetLanguage: appConfig.translationTargetLanguage
    };
  });

  ipcMain.handle('setTranslationModel', (_event, model) => {
    const normalizedModel = normalizeTranslationModel(model);
    if (normalizedModel !== model) {
      return { success: false, error: '지원하지 않는 번역 모델입니다.' };
    }

    appConfig.translationModel = normalizedModel;
    saveAppConfig();
    return { success: true, translationModel: normalizedModel };
  });

  ipcMain.handle('setOpenAiApiKey', (_event, apiKey) => {
    const normalizedApiKey = String(apiKey || '').trim();
    if (!normalizedApiKey) {
      return { success: false, error: 'OpenAI API 키를 입력해주세요.' };
    }

    appConfig.openAiApiKey = normalizedApiKey;
    saveAppConfig();
    return { success: true, hasOpenAiApiKey: true };
  });

  ipcMain.handle('clearOpenAiApiKey', () => {
    appConfig.openAiApiKey = '';
    saveAppConfig();
    return { success: true, hasOpenAiApiKey: false };
  });

  ipcMain.handle('translateText', async (_event, payload = {}) => {
    try {
      const model = getConfiguredTranslationModel();
      const translatedText = await translateTextWithOpenAi(
        payload.text,
        payload.targetLanguage || getConfiguredTranslationTargetLanguage(),
        model
      );
      return { success: true, translatedText, model };
    } catch (error) {
      return {
        success: false,
        error: error.message || '자동 번역에 실패했습니다.',
        errorCode: error.code,
        errorType: error.type,
        status: error.status,
      };
    }
  });
}
