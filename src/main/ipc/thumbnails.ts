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

export function registerThumbnailHandlers() {


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

  ipcMain.handle('generateThumbnail', async (_, filePath, context: any = {}) => {
    return await generateThumbnail(filePath, context);
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
