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

export function registerIpcHandlers() {
  ipcMain.handle('openExternal', async (_, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      log('Error opening external URL:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:getCategories', async () => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      const categories = db.prepare('SELECT * FROM categories WHERE profileId = ? ORDER BY order_num').all(profileId);
      // fields를 배열로 변환
      return categories.map(cat => ({
        ...cat,
        order: cat.order_num ?? 0,
        itemType: cat.itemType === 'separator' ? 'separator' : 'category',
        memo: typeof cat.memo === 'string' ? cat.memo : '',
        fields: JSON.parse(cat.fields)
      }));
    } catch (error) {
      log('Error getting categories:', error);
      throw error;
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

  ipcMain.handle('db:addCategory', async (_, category) => {
    const profileId = getCurrentProfileIdOrThrow();
    const id = generateUUID();
    const now = new Date().toISOString();

    try {
      db.prepare(`
        INSERT INTO categories (id, profileId, name, parentId, fields, order_num, itemType, memo, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        profileId,
        category.name,
        category.itemType === 'separator' ? null : (category.parentId || null),
        JSON.stringify(category.itemType === 'separator' ? [] : (category.fields || [])),
        category.order_num ?? category.order ?? 0,
        category.itemType === 'separator' ? 'separator' : 'category',
        category.itemType === 'separator' ? '' : (typeof category.memo === 'string' ? category.memo : ''),
        now,
        now
      );
      return id;
    } catch (error) {
      log('Error adding category:', error);
      throw error;
    }
  });

  async function handleUpdateRecord(_, id, data) {
    try {
      log('=== handleUpdateRecord 시작 ===', { id, dataKeys: Object.keys(data) });

      const profileId = getCurrentProfileIdOrThrow();
      const record = db.prepare('SELECT categoryId, duration, thumbnailTimestamp FROM records WHERE id = ? AND profileId = ?').get(id, profileId);
      if (!record) {
        throw new Error('Record not found');
      }

      const dataToSave = { ...data };
      const requestedThumbnailTimestamp = Number(dataToSave.__thumbnailTimestamp);
      delete dataToSave.__thumbnailTimestamp;

      await checkDuplicateFields(record.categoryId, dataToSave, id, profileId);

      // 기존 duration 값 유지
      let duration = record.duration;
      let thumbnailTimestamp = Number.isFinite(requestedThumbnailTimestamp)
        ? Math.max(0, requestedThumbnailTimestamp)
        : record.thumbnailTimestamp;

      // duration이 없거나 파일 경로가 변경된 경우에만 새로 계산
      const fileField = Object.values(dataToSave).find(v => typeof v === 'string' && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(v));
      if (fileField && (!duration || duration === null)) {
        try {
          // ffmpeg/ffprobe 경로를 여러 후보에서 찾기
          const ffmpegCandidates = [
            path.join(process.resourcesPath, 'ffmpeg-static', 'ffmpeg.exe'),
            path.join(electronDistDir, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
            path.join(electronDistDir, '..', 'node_modules', '.bin', 'ffmpeg.exe')
          ];
          const ffprobeCandidates = [
            getUnpackedFfprobePath(),
            path.join(electronDistDir, '..', 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'),
            path.join(electronDistDir, '..', 'node_modules', '.bin', 'ffprobe.exe')
          ];
          const ffmpegPath = ffmpegCandidates.find(fs.existsSync);
          const ffprobePath = ffprobeCandidates.find(fs.existsSync);
          log('[addRecord] 동영상 duration 계산 시도', { fileField, ffmpegPath, ffprobePath });
          if (!ffmpegPath || !ffprobePath) {
            log('[addRecord] ffmpeg/ffprobe 경로를 찾을 수 없음, duration=null', { ffmpegPath, ffprobePath });
            duration = null;
          } else {
            ffmpeg.setFfmpegPath(ffmpegPath);
            ffmpeg.setFfprobePath(ffprobePath);
            duration = await new Promise((resolve: (value: any) => void) => {
              ffmpeg.ffprobe(fileField as string, (err, metadata) => {
                if (err) {
                  log('[addRecord] ffprobe 에러', { fileField, err: err.message, stack: err.stack });
                  return resolve(null);
                }
                if (!metadata || !metadata.format || !metadata.format.duration) {
                  log('[addRecord] ffprobe 결과에 duration 없음', { fileField, metadata });
                  return resolve(null);
                }
                resolve(Math.floor(metadata.format.duration));
              });
            });
          }
        } catch (e) {
          log('[addRecord] duration 계산 중 예외', { fileField, error: e.message, stack: e.stack });
          duration = null;
        }
      }

      // 파일 경로 변경 감지를 위해 업데이트 전에 이전 데이터 조회
      let prevFilePath = null;
      try {
        log('=== 파일 경로 변경 감지 시작 ===');
        const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(record.categoryId, profileId);
        if (category) {
          const fields = JSON.parse(category.fields);
          log('=== 카테고리 필드 ===', { fields: fields.map(f => ({ id: f.id, type: f.type, name: f.name })) });

          const fileField = fields.find(f => f.type === 'file');
          if (fileField) {
            log('=== 파일 필드 발견 ===', { fileFieldId: fileField.id, fileFieldName: fileField.name });

            // 업데이트 전에 이전 파일 경로 조회
            const prevRecord = db.prepare('SELECT data FROM records WHERE id = ? AND profileId = ?').get(id, profileId);
            if (prevRecord) {
              const prevData = JSON.parse(prevRecord.data);
              prevFilePath = prevData[fileField.id] || null;
              log('=== 이전 파일 경로 조회 완료 ===', { prevFilePath });
            } else {
              log('=== 이전 레코드 데이터 없음 ===');
            }
          } else {
            log('=== 파일 필드 없음 ===');
          }
        } else {
          log('=== 카테고리 없음 ===');
        }
      } catch (error) {
        log('이전 파일 경로 조회 중 오류:', error);
      }

      log('=== DB 업데이트 시작 ===');
      const stmt = db.prepare(`
        UPDATE records
        SET data = ?, updatedAt = ?, duration = ?, thumbnailTimestamp = ?
        WHERE id = ? AND profileId = ?
      `);

      stmt.run(
        JSON.stringify(dataToSave),
        new Date().toISOString(),
        duration,
        thumbnailTimestamp,
        id,
        profileId
      );
      log('=== DB 업데이트 완료 ===');

      // 파일 필드가 있으면 썸네일 자동 생성
      try {
        log('=== 썸네일 생성 로직 시작 ===');
        const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(record.categoryId, profileId);
        if (category) {
          const fields = JSON.parse(category.fields);
          const fileField = fields.find(f => f.type === 'file');
          if (fileField && dataToSave[fileField.id]) {
            const newFilePath = dataToSave[fileField.id];
            log('=== 새 파일 경로 ===', { newFilePath });
            log('=== 파일 경로 변경 여부 ===', {
              prevFilePath,
              newFilePath,
              isChanged: newFilePath !== prevFilePath,
              prevType: typeof prevFilePath,
              newType: typeof newFilePath
            });

            if (newFilePath !== prevFilePath) {
              log('=== 썸네일 생성 시작 (파일 경로 변경됨) ===', { newFilePath });

              // 파일 경로가 변경되었으므로 기존 북마크 삭제
              try {
                const recordData = db.prepare('SELECT data FROM records WHERE id = ? AND profileId = ?').get(id, profileId);
                if (recordData) {
                  const data = JSON.parse(recordData.data);
                  if (data.bookmarks && data.bookmarks.length > 0) {
                    data.bookmarks = [];
                    db.prepare("UPDATE records SET data = ?, updatedAt = ? WHERE id = ? AND profileId = ?")
                      .run(JSON.stringify(data), new Date().toISOString(), id, profileId);
                    log('=== 파일 변경으로 인해 북마크 삭제 완료 ===', { recordId: id, deletedCount: data.bookmarks.length });
                  } else {
                    log('=== 파일 변경됨, 북마크 없음 ===', { recordId: id });
                  }
                }
              } catch (error) {
                log('북마크 삭제 중 오류:', error);
                // 북마크 삭제 실패는 레코드 업데이트를 막지 않음
              }

              // 썸네일 생성
              const thumbnailResult = await generateThumbnail(newFilePath, { recordId: id, categoryId: record.categoryId, profileId });
              if (thumbnailResult) {
                log('=== 썸네일 생성 완료 ===', { thumbnailResult });

                // 새 레코드의 경우 썸네일 경로를 DB에 저장
                thumbnailTimestamp = getThumbnailTimestampForFile(newFilePath, duration);
                db.prepare('UPDATE records SET thumbnailPath = ?, thumbnailTimestamp = ? WHERE id = ? AND profileId = ?').run(thumbnailResult, thumbnailTimestamp, id, profileId);
                log('[updateRecord] thumbnail path saved', { recordId: id, thumbnailPath: thumbnailResult, thumbnailTimestamp });
              } else {
                log('=== 썸네일 생성 실패 ===');
              }
            } else {
              log('=== 파일 경로 동일, 썸네일 재생성 생략 ===');
            }
          } else {
            log('=== 파일 필드가 없거나 파일 경로가 비어있음 ===', {
              hasFileField: !!fileField,
              fileFieldId: fileField?.id,
              hasFilePath: fileField ? !!dataToSave[fileField.id] : false,
              filePath: fileField ? dataToSave[fileField.id] : null
            });
          }
        } else {
          log('=== 카테고리를 찾을 수 없음 ===');
        }
      } catch (error) {
        log('썸네일 생성 중 오류:', error);
        // 썸네일 생성 실패는 레코드 업데이트를 막지 않음
      }

      log('=== handleUpdateRecord 완료 ===');
      return { success: true };
    } catch (error) {
      log('Error in updateRecord:', error);
      throw error;
    }
  }
  ipcMain.handle('updateRecord', handleUpdateRecord);
  ipcMain.handle('db:updateRecord', handleUpdateRecord);

  ipcMain.handle('db:deleteCategory', async (_, id) => {
    const profileId = getCurrentProfileIdOrThrow();
    ensureCategoryBelongsToCurrentProfile(id);
    const subtreeIds = getCategorySubtreeIds(id, profileId);
    const relationCleanupCount = subtreeIds.reduce((count, categoryId) => count + cleanupRelationReferences(categoryId), 0);
    const categoryDirs = getStructuredThumbnailDirsForCategoryIds(subtreeIds, profileId);
    let totalThumbnailCount = 0;

    subtreeIds.forEach(categoryId => {
      totalThumbnailCount += cleanupThumbnailsForCategory(categoryId);
    });

    db.prepare(`DELETE FROM records WHERE profileId = ? AND categoryId IN (${getSqlPlaceholders(subtreeIds.length)})`).run(profileId, ...subtreeIds);
    db.prepare(`DELETE FROM categories WHERE profileId = ? AND id IN (${getSqlPlaceholders(subtreeIds.length)})`).run(profileId, ...subtreeIds);
    categoryDirs
      .sort((a: string, b: string) => b.length - a.length)
      .forEach(dirPath => removeEmptyThumbnailDirsUpward(dirPath));

    return {
      success: true,
      thumbnailCleanupCount: totalThumbnailCount,
      relationCleanupCount: relationCleanupCount
    };
  });

  ipcMain.handle('db:getRecords', async (_, categoryId) => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      if (!categoryId) throw new Error('Category ID is required');
      ensureCategoryBelongsToCurrentProfile(categoryId);
      const records = db.prepare('SELECT id, categoryId, data, createdAt, updatedAt, duration, thumbnailPath, thumbnailTimestamp FROM records WHERE categoryId = ? AND profileId = ? ORDER BY createdAt DESC').all(categoryId, profileId);
      return records.map(record => ({
        ...record,
        data: JSON.parse(record.data)
      }));
    } catch (error) {
      log('Error getting records:', error);
      throw error;
    }
  });

  ipcMain.handle('db:addRecord', async (_, record) => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      if (!record || typeof record !== 'object') {
        throw new Error('Record must be an object');
      }
      if (!record.categoryId || !record.data) {
        throw new Error('Missing required fields');
      }
      ensureCategoryBelongsToCurrentProfile(record.categoryId);
      await checkDuplicateFields(record.categoryId, record.data, null, profileId);
      const recordId = record.id || crypto.randomUUID();
      const stmt = db.prepare(`
        INSERT INTO records (id, profileId, categoryId, data, createdAt, updatedAt, duration, thumbnailTimestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      // duration 계산
      let duration = null;
      const fileField = Object.values(record.data).find(v => typeof v === 'string' && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(v));
      if (fileField) {
        try {
          // ffmpeg/ffprobe 경로를 여러 후보에서 찾기
          const ffmpegCandidates = [
            path.join(process.resourcesPath, 'ffmpeg-static', 'ffmpeg.exe'),
            path.join(electronDistDir, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
            path.join(electronDistDir, '..', 'node_modules', '.bin', 'ffmpeg.exe')
          ];
          const ffprobeCandidates = [
            getUnpackedFfprobePath(),
            path.join(electronDistDir, '..', 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'),
            path.join(electronDistDir, '..', 'node_modules', '.bin', 'ffprobe.exe')
          ];
          const ffmpegPath = ffmpegCandidates.find(fs.existsSync);
          const ffprobePath = ffprobeCandidates.find(fs.existsSync);
          log('[addRecord] 동영상 duration 계산 시도', { fileField, ffmpegPath, ffprobePath });
          if (!ffmpegPath || !ffprobePath) {
            log('[addRecord] ffmpeg/ffprobe 경로를 찾을 수 없음, duration=null', { ffmpegPath, ffprobePath });
            duration = null;
          } else {
            ffmpeg.setFfmpegPath(ffmpegPath);
            ffmpeg.setFfprobePath(ffprobePath);
            duration = await new Promise((resolve: (value: any) => void) => {
              ffmpeg.ffprobe(fileField as string, (err, metadata) => {
                if (err) {
                  log('[addRecord] ffprobe 에러', { fileField, err: err.message, stack: err.stack });
                  return resolve(null);
                }
                if (!metadata || !metadata.format || !metadata.format.duration) {
                  log('[addRecord] ffprobe 결과에 duration 없음', { fileField, metadata });
                  return resolve(null);
                }
                resolve(Math.floor(metadata.format.duration));
              });
            });
          }
        } catch (e) {
          log('[addRecord] duration 계산 중 예외', { fileField, error: e.message, stack: e.stack });
          duration = null;
        }
      }
      try {
        stmt.run(
          recordId,
          profileId,
          record.categoryId,
          JSON.stringify(record.data),
          record.createdAt || now,
          record.updatedAt || now,
          duration,
          null
        );
      } catch (e) {
        log('[addRecord] DB insert 예외', { recordId, error: e.message, stack: e.stack });
        throw e;
      }
      // 파일 필드가 있으면 썸네일 자동 생성
      try {
        const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(record.categoryId, profileId);
        if (category) {
          const fields = JSON.parse(category.fields);
          const fileFieldObj = fields.find(f => f.type === 'file');
          if (fileFieldObj && record.data[fileFieldObj.id]) {
            const filePath = record.data[fileFieldObj.id];
            log('[addRecord] 썸네일 생성 시작', { filePath });
            try {
              const thumbnailResult = await generateThumbnail(filePath, { recordId, categoryId: record.categoryId, profileId });
              if (thumbnailResult) {
                log('[addRecord] 썸네일 생성 완료', { thumbnailResult });

                // 새 레코드의 경우 썸네일 경로를 DB에 저장
                const thumbnailTimestamp = getThumbnailTimestampForFile(filePath, duration);
                db.prepare('UPDATE records SET thumbnailPath = ?, thumbnailTimestamp = ? WHERE id = ? AND profileId = ?').run(thumbnailResult, thumbnailTimestamp, recordId, profileId);
                log('[addRecord] thumbnail path saved', { recordId, thumbnailPath: thumbnailResult, thumbnailTimestamp });
              } else {
                log('[addRecord] 썸네일 생성 실패(결과 null)', { filePath });
              }
            } catch (thumbErr) {
              log('[addRecord] 썸네일 생성 중 예외', { filePath, error: thumbErr.message, stack: thumbErr.stack });
            }
          }
        }
      } catch (error) {
        log('썸네일 생성 블록 예외', { error: error.message, stack: error.stack });
      }
      return recordId;
    } catch (error) {
      log('[addRecord] 최상위 예외', { error: error.message, stack: error.stack });
      throw error;
    }
  });

  ipcMain.handle('db:deleteRecord', async (_, id) => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      const record = db.prepare('SELECT categoryId, data, thumbnailPath FROM records WHERE id = ? AND profileId = ?').get(id, profileId);
      if (!record) {
        throw new Error('Record not found');
      }

      // 썸네일 삭제
      try {
        const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(record.categoryId, profileId);
        if (category) {
          const fields = JSON.parse(category.fields);
          const fileField = fields.find(f => f.type === 'file');
          if (fileField) {
            const data = JSON.parse(record.data);
            if (data[fileField.id]) {
              const filePath = data[fileField.id];
              log('레코드 삭제 시 썸네일 삭제 시작:', filePath);

              const thumbnailDeleted = deleteThumbnail(filePath, { recordId: id, categoryId: record.categoryId, profileId, thumbnailPath: record.thumbnailPath });
              if (thumbnailDeleted) {
                log('썸네일 삭제 완료:', filePath);
              }
            }
          }
        }
      } catch (error) {
        log('썸네일 삭제 중 오류:', error);
        // 썸네일 삭제 실패는 레코드 삭제를 막지 않음
      }

      db.prepare('DELETE FROM records WHERE id = ? AND profileId = ?').run(id, profileId);
      return { success: true };
    } catch (error) {
      log('Error in deleteRecord:', error);
      throw error;
    }
  });

  ipcMain.handle('getConfig', () => {
    return {
      dbPath: dbPath,
      backupDir: getConfiguredBackupDir(),
      backupInterval: getConfiguredBackupInterval(),
      backupEnabled: appConfig.backupEnabled !== false,
      rememberWindowBounds: appConfig.rememberWindowBounds,
      muteAudioWhenBackgrounded: appConfig.muteAudioWhenBackgrounded === true,
      zoomPercent: getConfiguredZoomPercent(),
      hasAppPassword: Boolean(appConfig.passwordHash),
      passwordLockMaxAttempts: getConfiguredPasswordLockMaxAttempts(),
      passwordLockDurationMinutes: getConfiguredPasswordLockDurationMinutes(),
      passwordLockUntil: getPasswordLockUntil(),
      idleLockMinutes: getConfiguredIdleLockMinutes(),
      videoSeekSeconds: appConfig.videoSeekSeconds || 5,
      videoAutoPlay: appConfig.videoAutoPlay !== false,
      listThumbnailFit: appConfig.listThumbnailFit === 'contain' ? 'contain' : 'cover',
      videoHoverPreviewEnabled: appConfig.videoHoverPreviewEnabled !== false,
      thumbnailPreviewScale: getConfiguredThumbnailPreviewScale(),
      defaultGalleryZoom: getConfiguredDefaultGalleryZoom(),
      dateParseFormats: normalizeDateParseFormats(appConfig.dateParseFormats),
      hasOpenAiApiKey: Boolean(String(appConfig.openAiApiKey || '').trim()),
      translationTargetLanguage: getConfiguredTranslationTargetLanguage(),
      translationModel: getConfiguredTranslationModel()
    };
  });

  ipcMain.handle('profiles:getAll', () => {
    log('profiles:getAll');
    return db.prepare('SELECT * FROM profiles ORDER BY createdAt ASC').all();
  });

  ipcMain.handle('profiles:getCurrent', () => {
    return ensureCurrentProfileExists();
  });

  ipcMain.handle('profiles:select', (_event, profileId) => {
    log('profiles:select', { profileId });
    const profile = getProfileById(profileId);
    if (!profile) {
      log('profiles:select:not-found', { profileId });
      return { success: false, error: 'Profile not found.' };
    }

    setCurrentProfileId(profile.id);
    log('profiles:select:success', { profileId: profile.id });
    return { success: true, profile };
  });

  ipcMain.handle('profiles:clearCurrent', () => {
    setCurrentProfileId(null);
    return { success: true };
  });

  ipcMain.handle('profiles:create', (_event, payload = {}) => {
    try {
      log('profiles:create', payload);
      const profile = createProfile(payload.name, payload.avatarColor);
      log('profiles:create:success', { profileId: profile.id, name: profile.name });
      return { success: true, profile };
    } catch (error) {
      log('profiles:create:error', { message: error.message, stack: error.stack });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('profiles:update', (_event, profileId, updates = {}) => {
    const profile = getProfileById(profileId);
    if (!profile) {
      return { success: false, error: 'Profile not found.' };
    }

    const name = String(updates.name ?? profile.name).trim();
    if (!name) {
      return { success: false, error: 'Profile name is required.' };
    }

    const avatarColor = updates.avatarColor || profile.avatarColor || DEFAULT_PROFILE_COLOR;
    const categoryIds = db.prepare('SELECT id FROM categories WHERE profileId = ?').all(profileId).map(row => row.id);
    const thumbnailEntries = collectThumbnailMigrationEntries(categoryIds, profileId);
    const previousCategoryDirs = getStructuredThumbnailDirsForCategoryIds(categoryIds, profileId);
    const previousProfileDir = path.join(getThumbnailRootDir(), sanitizeThumbnailPathSegment(profile.name || profileId, 'profile'));
    db.prepare(`
      UPDATE profiles
      SET name = ?, avatarColor = ?, updatedAt = ?
      WHERE id = ?
    `).run(name, avatarColor, new Date().toISOString(), profileId);

    migrateStructuredThumbnailEntries(thumbnailEntries);
    previousCategoryDirs
      .sort((a: string, b: string) => b.length - a.length)
      .forEach(dirPath => removeEmptyThumbnailDirsUpward(dirPath));
    removeEmptyThumbnailDirsUpward(previousProfileDir);

    return { success: true, profile: getProfileById(profileId) };
  });

  ipcMain.handle('profiles:delete', (_event, profileId) => {
    const profile = getProfileById(profileId);
    if (!profile) {
      return { success: false, error: 'Profile not found.' };
    }

    const profileCount = db.prepare('SELECT COUNT(*) as count FROM profiles').get();
    if ((profileCount?.count || 0) <= 1) {
      return { success: false, error: 'At least one profile must remain.' };
    }

    const categoryIds = db.prepare('SELECT id FROM categories WHERE profileId = ?').all(profileId).map(row => row.id);
    const categoryDirs = getStructuredThumbnailDirsForCategoryIds(categoryIds, profileId);
    const profileDir = path.join(getThumbnailRootDir(), sanitizeThumbnailPathSegment(profile.name || profileId, 'profile'));
    categoryIds.forEach(categoryId => {
      cleanupThumbnailsForCategory(categoryId);
    });

    db.prepare('DELETE FROM records WHERE profileId = ?').run(profileId);
    db.prepare('DELETE FROM categories WHERE profileId = ?').run(profileId);
    db.prepare('DELETE FROM profiles WHERE id = ?').run(profileId);
    categoryDirs
      .sort((a: string, b: string) => b.length - a.length)
      .forEach(dirPath => removeEmptyThumbnailDirsUpward(dirPath));
    removeEmptyThumbnailDirsUpward(profileDir);

    if (currentProfileId === profileId) {
      setCurrentProfileId(null);
    }

    return { success: true };
  });

  ipcMain.handle('setDbPath', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Database', extensions: ['db'] }]
    });
    if (filePaths && filePaths.length > 0) {
      return { success: true, path: filePaths[0] };
    }
    return { success: false };
  });

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

  ipcMain.handle('setAppPassword', async (_event, password) => {
    if (!password || String(password).trim().length < 4) {
      return { success: false, error: 'Password must be at least 4 characters.' };
    }

    try {
      appConfig.passwordHash = await createPasswordHash(password);
      resetPasswordLockState();
      saveAppConfig();
      return { success: true };
    } catch (error) {
      log('비밀번호 해시 생성 실패:', error);
      return { success: false, error: '비밀번호를 안전하게 저장하지 못했습니다.' };
    }
  });

  ipcMain.handle('clearAppPassword', () => {
    appConfig.passwordHash = null;
    resetPasswordLockState();
    saveAppConfig();
    return { success: true };
  });

  ipcMain.handle('verifyAppPassword', async (_event, password) => {
    if (!appConfig.passwordHash) {
      return { success: true };
    }

    const lockUntil = getPasswordLockUntil();
    if (lockUntil) {
      return {
        success: false,
        locked: true,
        lockUntil,
        remainingMs: lockUntil - Date.now(),
        error: 'Too many password attempts.'
      };
    }

    if (appConfig.passwordLockUntil) {
      resetPasswordLockState();
      saveAppConfig();
    }

    let verification;
    try {
      verification = await verifyStoredPassword(password, appConfig.passwordHash);
    } catch (error) {
      log('비밀번호 검증 실패:', error);
      return { success: false, error: '비밀번호를 확인하지 못했습니다.' };
    }

    if (verification.valid) {
      if (verification.needsUpgrade) {
        try {
          appConfig.passwordHash = await createPasswordHash(password);
        } catch (error) {
          log('기존 비밀번호 해시 마이그레이션 실패:', error);
        }
      }

      if (verification.needsUpgrade || appConfig.passwordFailedAttempts || appConfig.passwordLockUntil) {
        resetPasswordLockState();
        saveAppConfig();
      }
      return { success: true };
    }

    const failedAttempts = Math.max(0, Number(appConfig.passwordFailedAttempts) || 0) + 1;
    const maxAttempts = getConfiguredPasswordLockMaxAttempts();
    if (failedAttempts >= maxAttempts) {
      const nextLockUntil = Date.now() + getConfiguredPasswordLockDurationMinutes() * 60 * 1000;
      appConfig.passwordFailedAttempts = 0;
      appConfig.passwordLockUntil = nextLockUntil;
      saveAppConfig();
      return {
        success: false,
        locked: true,
        lockUntil: nextLockUntil,
        remainingMs: nextLockUntil - Date.now(),
        error: 'Too many password attempts.'
      };
    }

    appConfig.passwordFailedAttempts = failedAttempts;
    saveAppConfig();
    return {
      success: false,
      remainingAttempts: maxAttempts - failedAttempts,
      error: 'Invalid password.'
    };
  });

  ipcMain.handle('setIdleLockMinutes', (_event, minutes) => {
    const normalizedMinutes = normalizeIdleLockMinutes(minutes);
    if (normalizedMinutes === null) {
      return { success: false, error: 'Invalid idle lock minutes.' };
    }

    appConfig.idleLockMinutes = normalizedMinutes;
    saveAppConfig();
    return { success: true, idleLockMinutes: normalizedMinutes };
  });

  ipcMain.handle('setPasswordLockSettings', (_event, maxAttempts, durationMinutes) => {
    const normalizedMaxAttempts = normalizePasswordLockMaxAttempts(maxAttempts);
    const normalizedDurationMinutes = normalizePasswordLockDurationMinutes(durationMinutes);
    if (normalizedMaxAttempts === null || normalizedDurationMinutes === null) {
      return { success: false, error: 'Invalid password lock settings.' };
    }

    appConfig.passwordLockMaxAttempts = normalizedMaxAttempts;
    appConfig.passwordLockDurationMinutes = normalizedDurationMinutes;
    saveAppConfig();
    return {
      success: true,
      passwordLockMaxAttempts: normalizedMaxAttempts,
      passwordLockDurationMinutes: normalizedDurationMinutes
    };
  });

  ipcMain.handle('setVideoSeekSeconds', (_event, seconds) => {
    const normalized = Number(seconds);
    if (!Number.isFinite(normalized) || normalized < 1) {
      return { success: false, error: 'Seconds must be at least 1.' };
    }

    appConfig.videoSeekSeconds = Math.floor(normalized);
    saveAppConfig();
    return { success: true };
  });

  ipcMain.handle('setZoomPercent', (_event, percent) => {
    const normalized = normalizeZoomPercent(percent);
    if (normalized === null) {
      return { success: false, error: 'Zoom percent must be a number.' };
    }

    appConfig.zoomPercent = normalized;
    saveAppConfig();

    for (const browserWindow of BrowserWindow.getAllWindows()) {
      applyWindowZoom(browserWindow);
    }

    return { success: true };
  });

  ipcMain.handle('setThumbnailPreviewScale', (_event, scale) => {
    const normalized = normalizeThumbnailPreviewScale(scale);
    if (normalized === null) {
      return { success: false, error: 'Thumbnail preview scale must be a number.' };
    }

    appConfig.thumbnailPreviewScale = normalized;
    saveAppConfig();
    return { success: true, thumbnailPreviewScale: normalized };
  });

  ipcMain.handle('setVideoAutoPlay', (_event, enabled) => {
    appConfig.videoAutoPlay = enabled !== false;
    saveAppConfig();
    return { success: true };
  });

  ipcMain.handle('setListThumbnailFit', (_event, fit) => {
    if (fit !== 'cover' && fit !== 'contain') {
      return { success: false, error: 'Thumbnail fit must be cover or contain.' };
    }

    appConfig.listThumbnailFit = fit;
    saveAppConfig();
    return { success: true };
  });

  ipcMain.handle('setVideoHoverPreviewEnabled', (_event, enabled) => {
    appConfig.videoHoverPreviewEnabled = enabled === true;
    saveAppConfig();
    return { success: true, videoHoverPreviewEnabled: appConfig.videoHoverPreviewEnabled };
  });

  ipcMain.handle('setDefaultGalleryZoom', (_event, scale) => {
    const normalized = normalizeDefaultGalleryZoom(scale);
    if (normalized === null) {
      return { success: false, error: 'Gallery zoom must be a number.' };
    }

    appConfig.defaultGalleryZoom = normalized;
    saveAppConfig();
    return { success: true, defaultGalleryZoom: normalized };
  });

  ipcMain.handle('setDateParseFormats', (_event, formats) => {
    appConfig.dateParseFormats = normalizeDateParseFormats(formats);
    saveAppConfig();
    return { success: true, dateParseFormats: appConfig.dateParseFormats ?? [] };
  });

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

  ipcMain.handle('backupDatabase', async () => {
    try {
      const backupPath = await createDatabaseBackup();
      return { success: true, path: backupPath };
    } catch (error) {
      log('Backup failed:', error);
      return { success: false, error: error.message };
    }
  });

  function getCategorySubtree(rootId, allCategories) {
    const childrenMap = new Map();
    for (const cat of allCategories) {
      const parentKey = cat.parentId || null;
      if (!childrenMap.has(parentKey)) {
        childrenMap.set(parentKey, []);
      }
      childrenMap.get(parentKey).push(cat);
    }
    // preserve order within parent
    for (const [key, list] of childrenMap.entries()) {
      list.sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
    }

    const result = [];
    const stack = [rootId];
    const visited = new Set();
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      const node = allCategories.find(c => c.id === current);
      if (!node) continue;
      result.push(node);
      const children = childrenMap.get(current) || [];
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i].id);
      }
    }
    return result;
  }

  ipcMain.handle('category:export', async (_, categoryId) => {
    try {
      const categories = db.prepare('SELECT id, name, parentId, fields, order_num, itemType, memo, createdAt, updatedAt FROM categories').all();
      const subtree = getCategorySubtree(categoryId, categories);
      if (subtree.length === 0) {
        return { success: false, error: 'Category not found' };
      }

      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        rootCategoryId: categoryId,
        categories: subtree.map(cat => ({
          id: cat.id,
          name: cat.name,
          parentId: cat.parentId,
          fields: JSON.parse(cat.fields),
          order_num: cat.order_num ?? 0,
          itemType: cat.itemType === 'separator' ? 'separator' : 'category',
          memo: typeof cat.memo === 'string' ? cat.memo : '',
          createdAt: cat.createdAt,
          updatedAt: cat.updatedAt
        }))
      };

      const { filePath, canceled } = await dialog.showSaveDialog({
        title: '카테고리 추출 저장',
        defaultPath: `category-${categoryId}.json`,
        filters: [{ name: 'Category Export', extensions: ['json'] }]
      });
      if (canceled || !filePath) return { success: false };

      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
      return { success: true, path: filePath };
    } catch (error) {
      log('Error exporting category:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('category:import', async () => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: '카테고리 붙여넣기',
        filters: [{ name: 'Category Export', extensions: ['json'] }],
        properties: ['openFile']
      });
      if (canceled || !filePaths || filePaths.length === 0) return { success: false };

      const raw = fs.readFileSync(filePaths[0], 'utf-8');
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.categories)) {
        return { success: false, error: 'Invalid category export file' };
      }

      const now = new Date().toISOString();
      const oldToNew = new Map();
      const categories = data.categories;
      const categoryMap = new Map(categories.map(c => [c.id, c]));
      const childrenMap = new Map();
      for (const cat of categories) {
        const parentKey = categoryMap.has(cat.parentId) ? cat.parentId : null;
        if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
        childrenMap.get(parentKey).push(cat);
      }
      for (const [key, list] of childrenMap.entries()) {
        list.sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
      }

      const getNextOrder = (() => {
        const cache = new Map();
        return (parentId) => {
          const key = parentId || null;
          if (!cache.has(key)) {
            const row = parentId
              ? db.prepare('SELECT MAX(order_num) as maxOrder FROM categories WHERE parentId = ? AND profileId = ?').get(parentId, profileId)
              : db.prepare('SELECT MAX(order_num) as maxOrder FROM categories WHERE parentId IS NULL AND profileId = ?').get(profileId);
            cache.set(key, Number.isFinite(row?.maxOrder) ? row.maxOrder + 1 : 0);
          }
          const next = cache.get(key);
          cache.set(key, next + 1);
          return next;
        };
      })();

      const insertStmt = db.prepare(`
        INSERT INTO categories (id, profileId, name, parentId, fields, order_num, itemType, memo, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const dfsInsert = (parentId) => {
        const children = childrenMap.get(parentId || null) || [];
        for (const child of children) {
          const newId = generateUUID();
          oldToNew.set(child.id, newId);
          const isSeparator = child.itemType === 'separator';
          const newParentId = isSeparator ? null : (parentId ? oldToNew.get(parentId) : null);
          const orderNum = getNextOrder(newParentId || null);
          insertStmt.run(
            newId,
            profileId,
            child.name,
            newParentId,
            JSON.stringify(isSeparator ? [] : (child.fields || [])),
            orderNum,
            isSeparator ? 'separator' : 'category',
            isSeparator ? '' : (typeof child.memo === 'string' ? child.memo : ''),
            now,
            now
          );
          dfsInsert(child.id);
        }
      };

      dfsInsert(null);

      return { success: true, importedCount: oldToNew.size };
    } catch (error) {
      log('Error importing category:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('category:exportRecords', async (_, categoryId, format = 'csv') => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      if (!categoryId) {
        throw new Error('Category ID is required');
      }

      ensureCategoryBelongsToCurrentProfile(categoryId);
      const category = getCategoryOrThrow(categoryId, profileId);
      const subtreeCategories = getCategoryExportSubtree(categoryId, profileId);
      const categoryRecords = subtreeCategories.map((subtreeCategory) => ({
        category: subtreeCategory,
        records: getCategoryRecordsForProfile(subtreeCategory.id, profileId)
      }));
      const hasDescendants = subtreeCategories.length > 1;
      const normalizedFormat = format === 'xlsx' ? 'xlsx' : 'csv';
      const extension = normalizedFormat === 'xlsx' ? 'xlsx' : (hasDescendants ? 'zip' : 'csv');
      const safeCategoryName = sanitizeFileName(category.name);

      const { canceled, filePath } = await dialog.showSaveDialog({
        title: normalizedFormat === 'xlsx' ? 'Excel 내보내기' : 'CSV 내보내기',
        defaultPath: `${safeCategoryName}.${extension}`,
        filters: [
          {
            name: normalizedFormat === 'xlsx'
              ? 'Excel Workbook'
              : (hasDescendants ? 'ZIP Archive' : 'CSV File'),
            extensions: [extension]
          }
        ]
      });

      if (canceled || !filePath) {
        return { success: false, canceled: true };
      }

      if (normalizedFormat === 'xlsx') {
        if (hasDescendants) {
          const workbook = XLSX.utils.book_new();
          const usedSheetNames = new Set();
          const sheetDimensions = [];

          categoryRecords.forEach(({ category: exportCategory, records: exportRecords }) => {
            const preferredSheetName = exportCategory.exportPathNames.join(' - ');
            const sheetName = ensureUniqueSheetName(preferredSheetName, usedSheetNames);
            sheetDimensions.push(appendCategoryRecordsWorksheet(workbook, sheetName, exportCategory, exportRecords));
          });

          const workbookBuffer = XLSX.write(workbook, {
            type: 'buffer',
            bookType: 'xlsx',
            compression: true
          });
          const styledBuffer = applyDiscordExcelStyling(workbookBuffer, { sheetDimensions });
          fs.writeFileSync(filePath, styledBuffer);
        } else {
          exportCategoryRecordsToExcel(filePath, category, categoryRecords[0]?.records || []);
        }
      } else {
        if (hasDescendants) {
          const zip = new AdmZip();
          categoryRecords.forEach(({ category: exportCategory, records: exportRecords }) => {
            const entryPath = `${exportCategory.exportPathNames.map((segment) => sanitizeFileName(segment)).join('/')}.csv`;
            zip.addFile(entryPath, Buffer.from(buildCategoryRecordsCsvContent(exportCategory, exportRecords), 'utf8'));
          });
          zip.writeZip(filePath);
        } else {
          await exportCategoryRecordsToCsv(filePath, category, categoryRecords[0]?.records || []);
        }
      }

      return {
        success: true,
        path: filePath,
        recordCount: categoryRecords.reduce((sum, entry) => sum + entry.records.length, 0),
        format: normalizedFormat
      };
    } catch (error) {
      log('Error exporting category records:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('category:importRecords', async (_, categoryId, format = 'csv') => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      if (!categoryId) {
        throw new Error('Category ID is required');
      }

      ensureCategoryBelongsToCurrentProfile(categoryId);
      const category = getCategoryOrThrow(categoryId, profileId);
      const normalizedFormat = format === 'xlsx' ? 'xlsx' : 'csv';
      const extensions = normalizedFormat === 'xlsx' ? ['xlsx', 'xls'] : ['csv'];

      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: normalizedFormat === 'xlsx' ? 'Excel 가져오기' : 'CSV 가져오기',
        properties: ['openFile'],
        filters: [
          {
            name: normalizedFormat === 'xlsx' ? 'Excel Workbook' : 'CSV File',
            extensions
          }
        ]
      });

      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const rows = readImportRowsFromFile(filePaths[0]);
      const result = importCategoryRecordsFromRows(categoryId, category.fields, rows, profileId);

      return {
        success: true,
        path: filePaths[0],
        format: normalizedFormat,
        ...result
      };
    } catch (error) {
      log('Error importing category records:', error);
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

  ipcMain.handle('db:checkDuplicate', async (_, categoryId, fieldId, value, recordId = null) => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(categoryId, profileId);
      if (!category) {
        throw new Error(`Category not found: ${categoryId}`);
      }

      const fields = JSON.parse(category.fields);
      const field = fields.find(f => f.id === fieldId);

      if (!field || !field.unique) {
        return { isDuplicate: false };
      }

      if (value === undefined || value === null || value === '') {
        return { isDuplicate: false };
      }

      let query = `
        SELECT id FROM records
        WHERE categoryId = ?
        AND profileId = ?
        AND json_extract(data, '$.${fieldId}') = ?
      `;
      let params = [categoryId, profileId, String(value)];

      if (recordId) {
        query += ' AND id != ?';
        params.push(recordId);
      }

      const duplicate = db.prepare(query).get(...params);
      return { isDuplicate: !!duplicate };
    } catch (error) {
      log('Error in checkDuplicate:', error);
      throw error;
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

  ipcMain.handle('dashboard:getWarnings', async (_, previewLimit = 8) => {
    try {
      return getDashboardWarnings(previewLimit);
    } catch (error) {
      log('Error getting dashboard warnings:', error);
      return {
        totalCount: 0,
        counts: {
          missingFiles: 0,
          brokenRelations: 0
        },
        items: []
      };
    }
  });

  ipcMain.handle('record:incrementViewCount', (_event, categoryId, recordId) => {
    const profileId = getCurrentProfileIdOrThrow();
    const category = getCategoryOrThrow(categoryId, profileId);
    const fileField = category.fields.find((field) => field.type === 'file' && !field.thumbnailOnly);
    if (!fileField) {
      return { success: false, error: 'This category does not have a trackable file field.' };
    }

    const record = db.prepare(`
      SELECT data
      FROM records
      WHERE id = ? AND categoryId = ? AND profileId = ?
    `).get(recordId, categoryId, profileId);
    if (!record) {
      return { success: false, error: 'Record not found.' };
    }

    const recordData = JSON.parse(record.data);
    if (!recordData[fileField.id]) {
      return { success: false, error: 'Record does not have an attached file.' };
    }

    db.prepare(`
      INSERT INTO record_view_counts (profileId, recordId, categoryId, viewCount, updatedAt)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(profileId, recordId) DO UPDATE SET
        viewCount = record_view_counts.viewCount + 1,
        categoryId = excluded.categoryId,
        updatedAt = excluded.updatedAt
    `).run(profileId, recordId, categoryId, new Date().toISOString());

    return { success: true };
  });

  ipcMain.handle('dashboard:getRecordViewCounts', () => {
    const profileId = getCurrentProfileIdOrThrow();
    return db.prepare(`
      SELECT recordId, categoryId, viewCount
      FROM record_view_counts
      WHERE profileId = ?
    `).all(profileId);
  });

  ipcMain.handle('getThumbnailDataUrl', async (_, filePath, context: any = {}) => {
    try {
      let normalizedPath = filePath;

      if (!path.isAbsolute(filePath)) {
        // appDataDir 사용
        normalizedPath = path.join(appDataDir, filePath);
      }

      let thumbnailPath = getThumbnailPathForContext(normalizedPath, context).thumbnailPath;
      if (!fs.existsSync(thumbnailPath)) {
        const migratedPath = copyLegacyThumbnailToStructuredPath(normalizedPath, context);
        thumbnailPath = migratedPath || thumbnailPath;
      }

      if (!fs.existsSync(thumbnailPath)) {
        log('썸네일 파일이 존재하지 않음:', thumbnailPath);
        return null;
      }

      const buffer = fs.readFileSync(thumbnailPath);
      const base64 = buffer.toString('base64');
      return `data:image/jpeg;base64,${base64}`;
    } catch (e) {
      log('Error getting thumbnail data URL:', e);
      return null;
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

  function decodeSubtitleBuffer(buffer) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      return new TextDecoder('euc-kr').decode(buffer);
    }
  }

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

  // getArchiveFiles 핸들러
  ipcMain.handle('getArchiveFiles', async (_, filePath) => {
    try {
      if (!fs.existsSync(filePath)) return [];
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.7z') return [];

      // 대용량 파일을 위해 unzipper 스트리밍 방식 사용
      const entries = [];
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
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
      if (!archivePath || !fileName || !fs.existsSync(archivePath)) {
        return { success: false, error: '압축파일 또는 내부 파일을 찾을 수 없습니다.' };
      }

      const archiveExtension = path.extname(archivePath).toLowerCase();
      if (archiveExtension === '.7z') {
        return { success: false, error: '7z 압축파일은 현재 지원되지 않습니다.' };
      }

      const directory = await unzipper.Open.file(archivePath);
      const entry = directory.files.find((candidate) => (
        candidate.type !== 'Directory'
        && !String(candidate.path || '').endsWith('/')
        && isSameZipEntry(candidate.path, fileName)
      ));

      if (!entry) {
        return { success: false, error: '압축파일 내부에서 파일을 찾을 수 없습니다.' };
      }

      const normalizedFileName = normalizeZipPath(fileName);
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
      const archiveStat = fs.statSync(archivePath);
      const cacheKey = crypto.createHash('sha1')
        .update(`${path.resolve(archivePath)}|${archiveStat.mtimeMs}|${normalizedFileName}`)
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
      if (!fs.existsSync(filePath)) return null;
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.7z') return null;
      const requestedFileExt = path.extname(fileName).toLowerCase();
      const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(requestedFileExt);
      if (isVideo) return null;

      const buffer = await enqueueArchiveIo(() => (
        readArchiveEntryBuffer(filePath, fileName, ARCHIVE_DATA_URL_MAX_BYTES)
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
      if (!fs.existsSync(filePath)) return null;
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.7z') return null;

      const fileExt = path.extname(fileName).toLowerCase();
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
      if (!fs.existsSync(filePath)) {
        log('[압축 파일 존재하지 않음]', filePath);
        return null;
      }

      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.7z') {
        log('[7z 파일은 현재 지원되지 않습니다]', filePath);
        return null;
      }

      const fileExt = path.extname(fileName).toLowerCase();
      if (!['.txt', '.srt', '.vtt', '.ass'].includes(fileExt)) {
        log('[텍스트 파일이 아님]', fileName);
        return null;
      }

      const buffer = await enqueueArchiveIo(() => (
        readArchiveEntryBuffer(filePath, fileName, ARCHIVE_TEXT_MAX_BYTES)
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

  ipcMain.handle('db:updateCategory', (event, id, updates) => {
    const profileId = getCurrentProfileIdOrThrow();
    const existingCategory = ensureCategoryBelongsToCurrentProfile(id);
    const subtreeIds = getCategorySubtreeIds(id, profileId);
    const nextItemType = updates.itemType === 'separator' || existingCategory.itemType === 'separator'
      ? 'separator'
      : (updates.itemType || existingCategory.itemType || 'category');
    const nextParentId = nextItemType === 'separator' ? null : (updates.parentId || null);

    if (nextParentId) {
      if (nextParentId === id || subtreeIds.includes(nextParentId)) {
        throw new Error('자기 자신 또는 자신의 하위 카테고리를 상위 카테고리로 지정할 수 없습니다.');
      }

      const parentCategory = db.prepare(`
        SELECT id, parentId, itemType
        FROM categories
        WHERE id = ? AND profileId = ?
      `).get(nextParentId, profileId);
      if (!parentCategory || parentCategory.itemType === 'separator') {
        throw new Error('선택한 상위 카테고리를 찾을 수 없습니다.');
      }
      if (parentCategory.parentId) {
        throw new Error('최상위 카테고리만 상위 카테고리로 지정할 수 있습니다.');
      }
    }

    const thumbnailEntries = collectThumbnailMigrationEntries(subtreeIds, profileId);
    const previousCategoryDirs = getStructuredThumbnailDirsForCategoryIds(subtreeIds, profileId);
    const previousParentId = existingCategory.parentId || null;
    const parentChanged = previousParentId !== nextParentId;
    const hasExplicitOrder = updates.order_num !== undefined || updates.order !== undefined;
    let nextOrder = updates.order_num ?? updates.order ?? existingCategory.order_num ?? 0;

    if (parentChanged && !hasExplicitOrder) {
      const maxOrderRow = nextParentId
        ? db.prepare(`
            SELECT COALESCE(MAX(order_num), -1) AS maxOrder
            FROM categories
            WHERE profileId = ? AND parentId = ? AND id != ?
          `).get(profileId, nextParentId, id)
        : db.prepare(`
            SELECT COALESCE(MAX(order_num), -1) AS maxOrder
            FROM categories
            WHERE profileId = ? AND parentId IS NULL AND id != ?
          `).get(profileId, id);
      const maxOrder = Number(maxOrderRow?.maxOrder);
      nextOrder = (Number.isFinite(maxOrder) ? maxOrder : -1) + 1;
    }

    const nextFields = nextItemType === 'separator' ? [] : (updates.fields ?? JSON.parse(existingCategory.fields || '[]'));
    const nextMemo = nextItemType === 'separator'
      ? ''
      : (updates.memo !== undefined ? String(updates.memo ?? '') : (existingCategory.memo || ''));
    const stmt = db.prepare(`
      UPDATE categories
      SET name = ?, parentId = ?, fields = ?, order_num = ?, itemType = ?, memo = ?, updatedAt = ?
      WHERE id = ? AND profileId = ?
    `);
    stmt.run(
      updates.name,
      nextParentId,
      JSON.stringify(nextFields),
      nextOrder,
      nextItemType,
      nextMemo,
      new Date().toISOString(),
      id,
      profileId
    );
    migrateStructuredThumbnailEntries(thumbnailEntries);
    previousCategoryDirs
      .sort((a: string, b: string) => b.length - a.length)
      .forEach(dirPath => removeEmptyThumbnailDirsUpward(dirPath));
    return { success: true };
  });

  ipcMain.handle('db:moveCategoryToProfile', (_event, categoryId, targetProfileId) => {
    try {
      const sourceProfileId = getCurrentProfileIdOrThrow();
      const category = ensureCategoryBelongsToCurrentProfile(categoryId);

      if (category.parentId) {
        return { success: false, error: 'Only root categories can be moved.' };
      }

      const targetProfile = getProfileById(targetProfileId);
      if (!targetProfile) {
        return { success: false, error: 'Target profile not found.' };
      }

      if (targetProfileId === sourceProfileId) {
        return { success: false, error: 'Category is already in that profile.' };
      }

      const subtreeIds = getCategorySubtreeIds(categoryId, sourceProfileId);
      const targetRootOrder = db.prepare(`
        SELECT COALESCE(MAX(order_num), -1) + 1 AS nextOrder
        FROM categories
        WHERE profileId = ? AND parentId IS NULL
      `).get(targetProfileId)?.nextOrder ?? 0;

      const updateCategoryProfileStmt = db.prepare(`
        UPDATE categories
        SET profileId = ?, updatedAt = ?
        WHERE id = ?
      `);
      const updateRecordProfileStmt = db.prepare(`
        UPDATE records
        SET profileId = ?, updatedAt = ?
        WHERE categoryId = ? AND profileId = ?
      `);
      const updateRootOrderStmt = db.prepare(`
        UPDATE categories
        SET order_num = ?, updatedAt = ?
        WHERE id = ?
      `);

      const moveCategoryTree = db.transaction(() => {
        const now = new Date().toISOString();

        subtreeIds.forEach(subtreeCategoryId => {
          updateCategoryProfileStmt.run(targetProfileId, now, subtreeCategoryId);
          updateRecordProfileStmt.run(targetProfileId, now, subtreeCategoryId, sourceProfileId);
        });

        updateRootOrderStmt.run(targetRootOrder, now, categoryId);
      });

      moveCategoryTree();
      return { success: true };
    } catch (error) {
      log('Error moving category to profile:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('getVideoServerPort', () => {
    return globalThis.videoServerPort;
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

  // 썸네일 삭제 IPC 핸들러 등록
  ipcMain.handle('deleteThumbnail', async (_, filePath, context: any = {}) => {
    return deleteThumbnail(filePath, context);
  });

  const generateVideoThumbnailWithTime = async (filePath, timestampSec, context: any = {}) => {
    try {
      let normalizedPath = filePath;
      if (!path.isAbsolute(filePath)) {
        normalizedPath = path.join(appDataDir, filePath);
      }
      if (!fs.existsSync(normalizedPath)) {
        return null;
      }

      // ffmpeg/ffprobe 경로를 여러 후보에서 찾기
      const ffmpegCandidates = [
        path.join(process.resourcesPath, 'ffmpeg-static', 'ffmpeg.exe'),
        path.join(electronDistDir, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
        path.join(electronDistDir, '..', 'node_modules', '.bin', 'ffmpeg.exe')
      ];
      const ffprobeCandidates = [
        getUnpackedFfprobePath(),
        path.join(electronDistDir, '..', 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'),
        path.join(electronDistDir, '..', 'node_modules', '.bin', 'ffprobe.exe')
      ];
      const ffmpegPath = ffmpegCandidates.find(fs.existsSync);
      const ffprobePath = ffprobeCandidates.find(fs.existsSync);
      if (!ffmpegPath || !ffprobePath || !fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
        log('ffmpeg/ffprobe 경로를 찾을 수 없음', { ffmpegPath, ffprobePath });
        return null;
      }
      ffmpeg.setFfmpegPath(ffmpegPath);
      ffmpeg.setFfprobePath(ffprobePath);

      const ext = path.extname(normalizedPath).toLowerCase();
      const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(ext);
      if (!isVideo) return null;
      const { thumbnailDir, thumbnailPath } = ensureThumbnailDirForContext(normalizedPath, context);
      // duration 구하기
      const duration = await new Promise((resolve) => {
        ffmpeg.ffprobe(normalizedPath, (err, metadata) => {
          if (err || !metadata || !metadata.format || !metadata.format.duration) return resolve(null);
          resolve(Math.floor(metadata.format.duration));
        });
      });
      const embeddedCoverPath = await extractEmbeddedVideoCover(normalizedPath, thumbnailPath);
      if (embeddedCoverPath) {
        return embeddedCoverPath;
      }
      let ts = Number(timestampSec);
      if (!Number.isFinite(ts)) {
        ts = getAutoThumbnailTimestamp(duration);
      }
      if (duration && ts > Number(duration)) {
        ts = getAutoThumbnailTimestamp(duration);
      }
      await new Promise<void>((resolve, reject) => {
        ffmpeg(normalizedPath)
          .screenshots({
            timestamps: [ts],
            filename: path.basename(thumbnailPath),
            folder: thumbnailDir,
            size: '400x?'
          })
          .on('end', () => resolve())
          .on('error', (err) => reject(err));
      });
      return thumbnailPath;
    } catch (e) {
      return null;
    }
  };

  ipcMain.handle('generateThumbnailWithTime', async (_, filePath, timestampSec, context: any = {}) => {
    return await generateVideoThumbnailWithTime(filePath, timestampSec, context);
  });

  // 이미지/압축파일용 썸네일 재생성 함수
  const regenerateImageOrArchiveThumbnail = async (filePath, context: any = {}) => {
    try {

      let normalizedPath = filePath;
      if (!path.isAbsolute(filePath)) {
        normalizedPath = path.join(appDataDir, filePath);
      }

      if (!fs.existsSync(normalizedPath)) {
        log('파일이 존재하지 않음:', normalizedPath);
        return null;
      }

      const ext = path.extname(normalizedPath).toLowerCase();
      const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
      const isArchive = ['.zip', '.7z'].includes(ext);

      if (!isImage && !isArchive) {
        log('지원하지 않는 파일 형식:', ext);
        return null;
      }

      const { thumbnailDir, thumbnailPath } = ensureThumbnailDirForContext(normalizedPath, context);

      log('썸네일 재생성 시작:', { filePath: normalizedPath, thumbnailPath, fileType: isImage ? 'image' : 'archive' });

      if (isImage) {
        // 이미지 썸네일 재생성
        await sharp(normalizedPath)
          .resize(400, 400, { fit: 'inside' })
          .toFile(thumbnailPath);
        log('이미지 썸네일 재생성 완료:', thumbnailPath);
      } else if (isArchive) {
        const archiveThumbnail = await generateThumbnailFromArchive(normalizedPath, thumbnailPath, thumbnailDir);
        if (!archiveThumbnail) return null;
      }

      return thumbnailPath;
    } catch (e) {
      log('썸네일 재생성 에러:', e);
      return null;
    }
  };

  // 사용자가 직접 선택한 이미지 파일로 썸네일을 교체하는 함수
  const setCustomThumbnailFromImage = async (targetFilePath, imagePath, context: any = {}) => {
    let temporaryThumbnailPath = null;
    try {

      if (!imagePath) {
        log('커스텀 썸네일 이미지 경로가 비어 있습니다.');
        return null;
      }

      if (!fs.existsSync(imagePath)) {
        log('커스텀 썸네일 이미지 파일이 존재하지 않습니다:', imagePath);
        return null;
      }

      let normalizedTargetPath = targetFilePath;
      if (!path.isAbsolute(targetFilePath)) {
        normalizedTargetPath = path.join(appDataDir, targetFilePath);
      }

      const ext = path.extname(imagePath).toLowerCase();
      const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
      if (!isImage) {
        log('커스텀 썸네일로 지원하지 않는 이미지 형식:', ext);
        return null;
      }

      const { thumbnailPath } = ensureThumbnailDirForContext(normalizedTargetPath, context);
      temporaryThumbnailPath = `${thumbnailPath}.custom-tmp-${process.pid}-${Date.now()}.jpg`;

      log('커스텀 썸네일 생성 시작:', { targetFilePath: normalizedTargetPath, imagePath, thumbnailPath });

      const sourceImageBuffer = await fs.promises.readFile(imagePath);
      await sharp(sourceImageBuffer)
        .resize(400, 400, { fit: 'inside' })
        .jpeg({ quality: 90 })
        .toFile(temporaryThumbnailPath);

      const targetExt = path.extname(normalizedTargetPath).toLowerCase();
      const isVideoTarget = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v'].includes(targetExt);
      if (isVideoTarget) {
        const metadataSupported = ['.mp4', '.m4v', '.mov', '.mkv'].includes(targetExt);
        if (metadataSupported) {
          const persisted = await persistCustomThumbnailToVideoMetadata(normalizedTargetPath, temporaryThumbnailPath);
          if (!persisted) {
            log('커스텀 썸네일 메타데이터 저장 실패:', normalizedTargetPath);
            return null;
          }
        }
      }

      fs.copyFileSync(temporaryThumbnailPath, thumbnailPath);
      if (context?.recordId) {
        db.prepare('UPDATE records SET thumbnailPath = ? WHERE id = ?').run(thumbnailPath, context.recordId);
      }

      log('커스텀 썸네일 생성 완료:', thumbnailPath);
      return thumbnailPath;
    } catch (e) {
      log('커스텀 썸네일 생성 에러:', e);
      return null;
    } finally {
      if (temporaryThumbnailPath) {
        await removeFileWithRetry(temporaryThumbnailPath).catch((cleanupError) => {
          log('커스텀 썸네일 임시 이미지 정리 실패:', {
            temporaryThumbnailPath,
            error: cleanupError.message
          });
        });
      }
    }
  };

  ipcMain.handle('regenerateThumbnail', async (_, filePath, context: any = {}) => {
    return await regenerateImageOrArchiveThumbnail(filePath, context);
  });

  // 사용자가 선택한 이미지로 썸네일을 직접 등록
  ipcMain.handle('setCustomThumbnail', async (_, filePath, imagePath, context: any = {}) => {
    return await setCustomThumbnailFromImage(filePath, imagePath, context);
  });

  ipcMain.handle('removeCustomThumbnail', async (_, filePath, context: any = {}) => {
    const removed = await removeEmbeddedVideoCover(filePath);
    const stillHasEmbeddedCover = removed ? await hasEmbeddedVideoCover(filePath) : true;
    if (removed && !stillHasEmbeddedCover) {
      deleteThumbnail(filePath, context);
      return true;
    }
    return false;
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

  ipcMain.handle('generateThumbnail', async (_, filePath, context: any = {}) => {
    return await generateThumbnail(filePath, context);
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

  ipcMain.handle('getThumbnailDataUrlHybrid', async (_, record, filePath) => {
    try {
      if (!filePath) return null;
      let normalizedPath = filePath;
      if (!path.isAbsolute(filePath)) {
        normalizedPath = path.join(appDataDir, filePath);
      }

      const thumbnailContext = getThumbnailContextForRecordLike(record);
      let thumbnailPath = null;

      if (record && record.thumbnailPath && fs.existsSync(record.thumbnailPath)) {
        const expectedPath = getThumbnailPathForContext(normalizedPath, thumbnailContext).thumbnailPath;
        if (record.thumbnailPath !== expectedPath) {
          ensureThumbnailDirForContext(normalizedPath, thumbnailContext);
          if (!fs.existsSync(expectedPath)) {
            fs.copyFileSync(record.thumbnailPath, expectedPath);
          }
          thumbnailPath = expectedPath;
          if (record?.id) {
            db.prepare('UPDATE records SET thumbnailPath = ? WHERE id = ?').run(thumbnailPath, record.id);
          }
        } else {
          thumbnailPath = record.thumbnailPath;
        }
      } else {
        thumbnailPath = getThumbnailPathForContext(normalizedPath, thumbnailContext).thumbnailPath;
        if (!fs.existsSync(thumbnailPath)) {
          const migratedPath = copyLegacyThumbnailToStructuredPath(normalizedPath, thumbnailContext);
          if (migratedPath) {
            thumbnailPath = migratedPath;
            if (record?.id) {
              db.prepare('UPDATE records SET thumbnailPath = ? WHERE id = ?').run(thumbnailPath, record.id);
            }
          }
        }
      }

      if (!thumbnailPath || !fs.existsSync(thumbnailPath)) {
        if (!fs.existsSync(normalizedPath)) {
          log('원본 파일이 존재하지 않음:', normalizedPath);
          return null;
        }

        const ext = path.extname(normalizedPath).toLowerCase();
        const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(ext);
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
        const isArchive = ['.zip', '.7z'].includes(ext);

        if (isVideo) {
          const tsRaw = record?.thumbnailTimestamp ?? record?.data?.__thumbnailTimestamp;
          const timestampSec = Number.isFinite(Number(tsRaw)) ? Number(tsRaw) : null;
          thumbnailPath = await generateVideoThumbnailWithTime(normalizedPath, timestampSec, thumbnailContext);
        } else if (isImage || isArchive) {
          thumbnailPath = await regenerateImageOrArchiveThumbnail(normalizedPath, thumbnailContext);
        }

        if (thumbnailPath && record?.id) {
          try {
            const thumbnailTimestamp = isVideo
              ? (Number.isFinite(Number(record?.thumbnailTimestamp ?? record?.data?.__thumbnailTimestamp))
                ? Math.max(0, Number(record?.thumbnailTimestamp ?? record?.data?.__thumbnailTimestamp))
                : getThumbnailTimestampForFile(normalizedPath, null))
              : null;
            db.prepare('UPDATE records SET thumbnailPath = ?, thumbnailTimestamp = COALESCE(?, thumbnailTimestamp) WHERE id = ?').run(thumbnailPath, thumbnailTimestamp, record.id);
          } catch (e) {
            log('썸네일 경로 업데이트 실패:', e);
          }
        }
      }

      if (!thumbnailPath || !fs.existsSync(thumbnailPath)) {
        log('하이브리드 썸네일 파일이 존재하지 않음:', thumbnailPath);
        return null;
      }

      const buffer = fs.readFileSync(thumbnailPath);
      const base64 = buffer.toString('base64');
      return `data:image/jpeg;base64,${base64}`;
    } catch (e) {
      log('Error getting hybrid thumbnail data URL:', e);
      return null;
    }
  });

  // 썸네일 경로 마이그레이션 핸들러
  ipcMain.handle('migrateThumbnailPaths', async () => {
    try {
      log('=== 썸네일 경로 마이그레이션 시작 ===');

      // 모든 카테고리 조회
      const categories = db.prepare('SELECT id, fields, profileId FROM categories').all();
      let totalProcessed = 0;
      let totalUpdated = 0;

      for (const category of categories) {
        const fields = JSON.parse(category.fields);
        const fileField = fields.find(f => f.type === 'file');

        if (!fileField) continue;

        // 해당 카테고리의 모든 레코드 조회
        const records = db.prepare('SELECT id, data, thumbnailPath, categoryId, profileId FROM records WHERE categoryId = ?').all(category.id);

        for (const record of records) {
          totalProcessed++;
          const data = JSON.parse(record.data);
          const filePath = data[fileField.id];

          if (!filePath || filePath === '' || filePath === '-') continue;

          try {
            // 해시 기반 썸네일 경로 생성
            const normalizedPath = path.isAbsolute(filePath) ? filePath : path.join(appDataDir, filePath);
            const context = { recordId: record.id, categoryId: record.categoryId, profileId: record.profileId || category.profileId };
            const thumbnailPath = getThumbnailPathForContext(normalizedPath, context).thumbnailPath;

            if (record.thumbnailPath && record.thumbnailPath === thumbnailPath && fs.existsSync(thumbnailPath)) {
              continue;
            }

            if (record.thumbnailPath && fs.existsSync(record.thumbnailPath) && record.thumbnailPath !== thumbnailPath) {
              ensureThumbnailDirForContext(normalizedPath, context);
              if (!fs.existsSync(thumbnailPath)) {
                fs.copyFileSync(record.thumbnailPath, thumbnailPath);
              }
            }

            if (!fs.existsSync(thumbnailPath)) {
              copyLegacyThumbnailToStructuredPath(normalizedPath, context);
            }

            // 썸네일 파일이 실제로 존재하는지 확인
            if (fs.existsSync(thumbnailPath)) {
              // DB에 썸네일 경로 저장
              db.prepare('UPDATE records SET thumbnailPath = ? WHERE id = ?').run(thumbnailPath, record.id);
              totalUpdated++;
              log(`썸네일 경로 업데이트: ${record.id} -> ${thumbnailPath}`);
            }
          } catch (error) {
            log(`썸네일 경로 업데이트 실패: ${record.id}`, error);
          }
        }
      }

      log('=== 썸네일 경로 마이그레이션 완료 ===', { totalProcessed, totalUpdated });
      return { success: true, totalProcessed, totalUpdated };
    } catch (error) {
      log('썸네일 경로 마이그레이션 중 오류:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cleanupOrphanThumbnails', () => {
    const thumbnailRoot = path.resolve(getThumbnailRootDir());
    const normalizePath = (filePath) => {
      const resolvedPath = path.resolve(filePath);
      return process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
    };
    const normalizedThumbnailRoot = normalizePath(thumbnailRoot);
    const isInsideThumbnailRoot = (filePath) => {
      const relative = path.relative(normalizedThumbnailRoot, normalizePath(filePath));
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    };

    try {
      log('=== 미참조 썸네일 정리 시작 ===');
      if (!fs.existsSync(thumbnailRoot)) {
        return {
          success: true,
          scannedFiles: 0,
          deletedFiles: 0,
          preservedFiles: 0,
          skippedRecentFiles: 0,
          skippedSymbolicLinks: 0,
          reclaimedBytes: 0,
          errors: []
        };
      }

      const referencedPaths = new Set();
      const addReferencedPath = (filePath) => {
        if (!filePath || typeof filePath !== 'string') return;
        const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(appDataDir, filePath);
        if (isInsideThumbnailRoot(resolvedPath)) {
          referencedPaths.add(normalizePath(resolvedPath));
        }
      };

      const profiles: any[] = db.prepare('SELECT id, name FROM profiles').all();
      const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
      const categories: any[] = db.prepare('SELECT id, name, parentId, profileId, fields FROM categories').all();
      const categoryById = new Map(categories.map((category) => [category.id, category]));
      const fileFieldIdByCategoryId = new Map();
      const categorySegmentsById = new Map();

      categories.forEach((category) => {
        const fields = JSON.parse(category.fields || '[]');
        const fileField = fields.find((field) => field.type === 'file');
        if (fileField?.id) {
          fileFieldIdByCategoryId.set(category.id, fileField.id);
        }
      });

      const getCachedCategorySegments = (categoryId) => {
        if (categorySegmentsById.has(categoryId)) {
          return categorySegmentsById.get(categoryId);
        }

        const segments = [];
        const seen = new Set();
        let current = categoryById.get(categoryId);
        while (current && !seen.has(current.id)) {
          seen.add(current.id);
          segments.unshift(sanitizeThumbnailPathSegment(current.name, current.id));
          current = current.parentId ? categoryById.get(current.parentId) : null;
        }

        const resolvedSegments = segments.length > 0 ? segments : ['uncategorized'];
        categorySegmentsById.set(categoryId, resolvedSegments);
        return resolvedSegments;
      };

      const records = db.prepare(`
        SELECT id, categoryId, profileId, data, thumbnailPath
        FROM records
      `).all();

      records.forEach((record) => {
        addReferencedPath(record.thumbnailPath);

        const fileFieldId = fileFieldIdByCategoryId.get(record.categoryId);
        if (!fileFieldId) return;

        const data = JSON.parse(record.data || '{}');
        const filePath = data[fileFieldId];
        if (!filePath || typeof filePath !== 'string' || filePath === '-') return;

        const normalizedSourcePath = path.isAbsolute(filePath) ? filePath : path.join(appDataDir, filePath);
        const category = categoryById.get(record.categoryId);
        const profileId = record.profileId || category?.profileId;
        const profile = profileById.get(profileId);
        const profileSegment = sanitizeThumbnailPathSegment(profile?.name || profileId, 'profile');
        const categorySegments = getCachedCategorySegments(record.categoryId);
        const expectedPath = path.join(
          thumbnailRoot,
          profileSegment,
          ...categorySegments,
          `thumb_${getThumbnailHash(normalizedSourcePath)}.jpg`
        );

        addReferencedPath(expectedPath);
        addReferencedPath(getLegacyThumbnailPath(normalizedSourcePath));
      });

      const result = {
        success: true,
        scannedFiles: 0,
        deletedFiles: 0,
        preservedFiles: 0,
        skippedRecentFiles: 0,
        skippedSymbolicLinks: 0,
        reclaimedBytes: 0,
        errors: []
      };
      const recentFileCutoff = Date.now() - (5 * 60 * 1000);

      const cleanDirectory = (directoryPath) => {
        const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
        entries.forEach((entry) => {
          const entryPath = path.join(directoryPath, entry.name);
          try {
            if (entry.isSymbolicLink()) {
              result.skippedSymbolicLinks++;
              return;
            }
            if (entry.isDirectory()) {
              cleanDirectory(entryPath);
              if (fs.readdirSync(entryPath).length === 0) {
                fs.rmdirSync(entryPath);
              }
              return;
            }
            if (!entry.isFile()) return;

            result.scannedFiles++;
            if (referencedPaths.has(normalizePath(entryPath))) {
              result.preservedFiles++;
              return;
            }

            const stats = fs.statSync(entryPath);
            if (stats.mtimeMs >= recentFileCutoff) {
              result.skippedRecentFiles++;
              return;
            }

            fs.unlinkSync(entryPath);
            result.deletedFiles++;
            result.reclaimedBytes += stats.size;
          } catch (error) {
            if (result.errors.length < 20) {
              result.errors.push({ path: entryPath, error: error.message });
            }
          }
        });
      };

      cleanDirectory(thumbnailRoot);
      log('=== 미참조 썸네일 정리 완료 ===', result);
      return result;
    } catch (error) {
      log('미참조 썸네일 정리 실패:', error);
      return {
        success: false,
        scannedFiles: 0,
        deletedFiles: 0,
        preservedFiles: 0,
        skippedRecentFiles: 0,
        skippedSymbolicLinks: 0,
        reclaimedBytes: 0,
        errors: [],
        error: error.message
      };
    }
  });

  // 썸네일 동기화 점검/정리 핸들러
  ipcMain.handle('checkThumbnailSync', async () => {
    try {
      log('=== 썸네일 동기화 점검 시작 ===');

      const results = {
        totalRecords: 0,
        dbOnly: [], // DB에만 있고 파일이 없는 경우
        fileOnly: [], // 파일만 있고 DB에 없는 경우
        bothExist: 0, // 둘 다 있는 경우
        neitherExist: 0 // 둘 다 없는 경우
      };

      // 모든 카테고리 조회
      const categories = db.prepare('SELECT id, fields, profileId FROM categories').all();

      for (const category of categories) {
        const fields = JSON.parse(category.fields);
        const fileField = fields.find(f => f.type === 'file');

        if (!fileField) continue;

        // 해당 카테고리의 모든 레코드 조회
        const records = db.prepare('SELECT id, data, thumbnailPath, categoryId, profileId FROM records WHERE categoryId = ?').all(category.id);

        for (const record of records) {
          results.totalRecords++;
          const data = JSON.parse(record.data);
          const filePath = data[fileField.id];

          if (!filePath || filePath === '' || filePath === '-') {
            results.neitherExist++;
            continue;
          }

          // 해시 기반 썸네일 경로
          const normalizedPath = path.isAbsolute(filePath) ? filePath : path.join(appDataDir, filePath);
          const context = { recordId: record.id, categoryId: record.categoryId, profileId: record.profileId || category.profileId };
          const hashPath = getThumbnailPathForContext(normalizedPath, context).thumbnailPath;
          const legacyPath = getLegacyThumbnailPath(normalizedPath);

          const dbExists = record.thumbnailPath && fs.existsSync(record.thumbnailPath);
          const hashExists = fs.existsSync(hashPath) || fs.existsSync(legacyPath);

          if (dbExists && hashExists) {
            results.bothExist++;
          } else if (dbExists && !hashExists) {
            results.dbOnly.push({
              recordId: record.id,
              dbPath: record.thumbnailPath,
              filePath: filePath
            });
          } else if (!dbExists && hashExists) {
            results.fileOnly.push({
              recordId: record.id,
              hashPath: hashPath,
              filePath: filePath
            });
          } else {
            results.neitherExist++;
          }
        }
      }

      log('=== 썸네일 동기화 점검 완료 ===');
      log(`총 레코드: ${results.totalRecords}`);
      log(`DB에만 존재: ${results.dbOnly.length}`);
      log(`파일에만 존재: ${results.fileOnly.length}`);
      log(`둘 다 존재: ${results.bothExist}`);
      log(`둘 다 없음: ${results.neitherExist}`);

      return results;
    } catch (error) {
      log('Error checking thumbnail sync:', error);
      throw error;
    }
  });

  // 썸네일 동기화 정리 핸들러
  ipcMain.handle('cleanupThumbnailSync', async (event, options = {}) => {
    try {
      log('=== 썸네일 동기화 정리 시작 ===');

      const {
        removeDbOnly = true, // DB에만 있고 파일이 없으면 DB에서 제거
        addFileOnly = true,  // 파일만 있고 DB에 없으면 DB에 추가
        dryRun = false       // 실제 변경하지 않고 시뮬레이션만
      } = options;

      const results = {
        removedFromDb: 0,
        addedToDb: 0,
        errors: []
      };

      // 모든 카테고리 조회
      const categories = db.prepare('SELECT id, fields, profileId FROM categories').all();

      for (const category of categories) {
        const fields = JSON.parse(category.fields);
        const fileField = fields.find(f => f.type === 'file');

        if (!fileField) continue;

        // 해당 카테고리의 모든 레코드 조회
        const records = db.prepare('SELECT id, data, thumbnailPath, categoryId, profileId FROM records WHERE categoryId = ?').all(category.id);

        for (const record of records) {
          const data = JSON.parse(record.data);
          const filePath = data[fileField.id];

          if (!filePath || filePath === '' || filePath === '-') continue;

          // 해시 기반 썸네일 경로
          const normalizedPath = path.isAbsolute(filePath) ? filePath : path.join(appDataDir, filePath);
          const context = { recordId: record.id, categoryId: record.categoryId, profileId: record.profileId || category.profileId };
          const hashPath = getThumbnailPathForContext(normalizedPath, context).thumbnailPath;
          const legacyPath = getLegacyThumbnailPath(normalizedPath);

          const dbExists = record.thumbnailPath && fs.existsSync(record.thumbnailPath);
          let hashExists = fs.existsSync(hashPath);
          if (!hashExists && fs.existsSync(legacyPath)) {
            hashExists = !!copyLegacyThumbnailToStructuredPath(normalizedPath, context);
          }

          try {
            if (removeDbOnly && dbExists && !hashExists) {
              // DB에만 있고 파일이 없으면 DB에서 제거
              if (!dryRun) {
                db.prepare('UPDATE records SET thumbnailPath = NULL WHERE id = ?').run(record.id);
              }
              results.removedFromDb++;
              log(`DB에서 썸네일 경로 제거: ${record.id}`);
            } else if (addFileOnly && !dbExists && hashExists) {
              // 파일만 있고 DB에 없으면 DB에 추가
              if (!dryRun) {
                db.prepare('UPDATE records SET thumbnailPath = ? WHERE id = ?').run(hashPath, record.id);
              }
              results.addedToDb++;
              log(`DB에 썸네일 경로 추가: ${record.id} -> ${hashPath}`);
            }
          } catch (error) {
            results.errors.push({
              recordId: record.id,
              error: error.message
            });
            log(`정리 중 오류: ${record.id}`, error);
          }
        }
      }

      log('=== 썸네일 동기화 정리 완료 ===');
      log(`DB에서 제거: ${results.removedFromDb}`);
      log(`DB에 추가: ${results.addedToDb}`);
      log(`오류: ${results.errors.length}`);

      return results;
    } catch (error) {
      log('Error cleaning up thumbnail sync:', error);
      throw error;
    }
  });
}
