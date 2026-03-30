import { ipcMain } from 'electron';
import { Database } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const { generateThumbnail, getThumbnailHash } = require('../../lib/fileHandler');

let db: Database;

// 썸네일 파일 삭제 함수
const deleteThumbnail = (filePath: string) => {
  try {
    const thumbnailDir = path.join(process.cwd(), 'save', 'thumbnails');
    const hash = getThumbnailHash(filePath);
    const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
    
    if (fs.existsSync(thumbnailPath)) {
      fs.unlinkSync(thumbnailPath);
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
};

// 썸네일 생성 함수
const getAutoThumbnailTimestamp = (duration: number | null): number => {
  if (duration === null || !Number.isFinite(duration)) {
    return 1;
  }

  if (duration <= 1) {
    return 0;
  }

  return duration / 2;
};

const generateThumbnailForFile = async (filePath: string, timestampSec?: number | null) => {
  try {
    // 직접 썸네일 생성 로직 구현
    let normalizedPath = filePath;
    if (!path.isAbsolute(filePath)) {
      normalizedPath = path.join(process.cwd(), 'save', filePath);
    }
    
    if (!fs.existsSync(normalizedPath)) {
      return;
    }
    
    const sharp = require('sharp');
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegStatic = require('ffmpeg-static');
    
    // ffmpeg 경로 설정
    let ffmpegPath = ffmpegStatic;
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      ffmpeg.setFfmpegPath(ffmpegPath);
    }
    
    const ext = path.extname(normalizedPath).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    const isVideo = ['.mp4', '.avi', '.mkv', '.mov'].includes(ext);
    const isArchive = ['.zip', '.7z'].includes(ext);
    
    if (!isImage && !isVideo && !isArchive) {
      return;
    }
    
    const thumbnailDir = path.join(process.cwd(), 'save', 'thumbnails');
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }
    
    const hash = getThumbnailHash(normalizedPath);
    const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
    
    if (isImage) {
      await sharp(normalizedPath)
        .resize(400, 400, { fit: 'inside' })
        .toFile(thumbnailPath);
    } else if (isVideo) {
      // 동영상 길이 확인
      const ffprobeStatic = require('ffprobe-static');
      if (ffprobeStatic && fs.existsSync(ffprobeStatic)) {
        ffmpeg.setFfprobePath(ffprobeStatic);
      }
      
      // 동영상 duration 확인
      const duration = await new Promise<number | null>((resolve) => {
        ffmpeg.ffprobe(normalizedPath, (err: any, metadata: any) => {
          if (err || !metadata?.format?.duration) {
            resolve(null);
          } else {
            resolve(metadata.format.duration);
          }
        });
      });
      
      // timestamp 결정: duration이 timestampSec보다 짧으면 0초 또는 중간 지점 사용
      let finalTimestampSec = typeof timestampSec === 'number' ? timestampSec : getAutoThumbnailTimestamp(duration);
      if (duration !== null && finalTimestampSec > duration) {
        // duration이 요청한 timestamp보다 짧으면 0초 또는 중간 지점 사용
        finalTimestampSec = getAutoThumbnailTimestamp(duration);
      }
      
      await new Promise((resolve, reject) => {
        ffmpeg(normalizedPath)
          .screenshots({
            timestamps: [finalTimestampSec],
            filename: path.basename(thumbnailPath),
            folder: thumbnailDir,
            size: '400x?'
          })
          .on('end', () => {
            resolve(null);
          })
          .on('error', (err: any) => {
            reject(err);
          });
      });
    } else if (isArchive) {
      // 스트리밍 방식으로 첫 이미지 추출
      const unzipper = require('unzipper');
      let found = false;
      await new Promise((resolve, reject) => {
        fs.createReadStream(normalizedPath)
          .pipe(unzipper.Parse())
          .on('entry', async function (entry: any) {
            const fileName = entry.path;
            if (/\.(jpg|jpeg|png|gif|webp)$/i.test(fileName) && !found) {
              found = true;
              const chunks: Buffer[] = [];
              entry.on('data', (chunk: Buffer) => chunks.push(chunk));
              entry.on('end', async () => {
                const buffer = Buffer.concat(chunks);
                try {
                  await sharp(buffer)
                    .resize(400, 400, { fit: 'inside' })
                    .toFile(thumbnailPath);
                  resolve(null);
                } catch (err) {
                  reject(err);
                }
              });
            } else {
              entry.autodrain();
            }
          })
          .on('close', () => {
            if (!found) {
              resolve(null);
            }
          })
          .on('error', (err: any) => {
            reject(err);
          });
      });
    }
  } catch (error) {
  }
};

// 레코드의 썸네일 정리
const cleanupThumbnailForRecord = (categoryId: string, recordId: string) => {
  try {
    // 레코드 데이터 가져오기
    const record = db.prepare('SELECT data FROM records WHERE categoryId = ? AND id = ?').get(categoryId, recordId) as {data: string} | undefined;
    if (!record) return false;
    
    const data = JSON.parse(record.data);
    
    // 카테고리 필드 정보 가져오기
    const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(categoryId) as {fields: string} | undefined;
    if (!category) return false;
    
    const fields = JSON.parse(category.fields);
    const fileField = fields.find((f: any) => f.type === 'file');
    
    if (fileField && data[fileField.id]) {
      const filePath = data[fileField.id];
      return deleteThumbnail(filePath);
    }
    
    return false;
  } catch (error) {
    return false;
  }
};

// 빈 값을 표준화하는 함수
const normalizeValue = (value: any): any => {
  // null, undefined는 null로 표준화
  if (value === undefined) return null;
  
  // 문자열 처리
  if (typeof value === 'string') {
    return value.trim() === '' ? null : value.trim();
  }
  
  // 배열 처리
  if (Array.isArray(value)) {
    const normalized = value
      .map(normalizeValue)
      .filter(v => v !== null);
    return normalized.length === 0 ? null : normalized;
  }
  
  // 객체 처리
  if (value !== null && typeof value === 'object') {
    const normalized = Object.fromEntries(
      Object.entries(value)
        .map(([k, v]) => [k, normalizeValue(v)])
        .filter(([_, v]) => v !== null)
    );
    return Object.keys(normalized).length === 0 ? null : normalized;
  }
  
  // 숫자는 NaN만 null로
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }
  
  // boolean은 그대로 유지
  if (typeof value === 'boolean') {
    return value;
  }
  
  return value;
};

export const registerRecordHandlers = (database: Database) => {
  db = database;

  ipcMain.handle('db:getRecords', async (_, categoryId) => {
    if (!db) throw new Error('Database not initialized');
    if (!categoryId) throw new Error('No categoryId provided');
    const records = db.prepare('SELECT * FROM records WHERE categoryId = ?').all(categoryId) as Array<{id: string, categoryId: string, data: string, createdAt: string, updatedAt: string}>;
    return records.map(record => ({
      ...record,
      data: JSON.parse(record.data, (key, value) => normalizeValue(value))
    }));
  });

  ipcMain.handle('db:addRecord', async (_, record) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    // 데이터 저장 전에 빈 값 표준화
    const normalizedData = normalizeValue(record.data);
    const stringifiedData = JSON.stringify(normalizedData);
    
    db.prepare(`
      INSERT INTO records (id, categoryId, data, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      record.categoryId,
      stringifiedData,
      now,
      now
    );

    // 파일 필드가 있으면 썸네일 자동 생성
    try {
      const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(record.categoryId) as {fields: string} | undefined;
      if (category) {
        const fields = JSON.parse(category.fields);
        const fileField = fields.find((f: any) => f.type === 'file');
        if (fileField && normalizedData[fileField.id]) {
          const filePath = normalizedData[fileField.id];
          await generateThumbnailForFile(filePath);
        }
      }
    } catch (error) {
    }

    return id;
  });

  ipcMain.handle('db:updateRecord', async (_, id, data) => {
    const now = new Date().toISOString();
    
    // 데이터 정규화
    const normalizedData = normalizeValue(data);
    const stringifiedData = JSON.stringify(normalizedData);
    
    // 파일 경로 변경 감지를 위해 업데이트 전에 이전 데이터 조회
    let prevFilePath: string | null = null;
    try {
      const record = db.prepare('SELECT categoryId FROM records WHERE id = ?').get(id) as {categoryId: string} | undefined;
      if (record) {
        const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(record.categoryId) as {fields: string} | undefined;
        if (category) {
          const fields = JSON.parse(category.fields);
          const fileField = fields.find((f: any) => f.type === 'file');
          if (fileField) {
            // 업데이트 전에 이전 파일 경로 조회
            const prevRecord = db.prepare('SELECT data FROM records WHERE id = ?').get(id) as {data: string} | undefined;
            if (prevRecord) {
              const prevData = JSON.parse(prevRecord.data);
              prevFilePath = prevData[fileField.id] || null;
            }
          }
        }
      }
    } catch (error) {
    }
    
    db.prepare(`
      UPDATE records 
      SET data = ?, updatedAt = ?
      WHERE id = ?
    `).run(stringifiedData, now, id);

    // 파일 필드가 있으면 썸네일 자동 생성 (파일 경로가 변경된 경우에만)
    try {
      const record = db.prepare('SELECT categoryId FROM records WHERE id = ?').get(id) as {categoryId: string} | undefined;
      if (record) {
        const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(record.categoryId) as {fields: string} | undefined;
        if (category) {
          const fields = JSON.parse(category.fields);
          const fileField = fields.find((f: any) => f.type === 'file');
          if (fileField && normalizedData[fileField.id]) {
            const newFilePath = normalizedData[fileField.id];
            if (newFilePath !== prevFilePath) {
              await generateThumbnailForFile(newFilePath);
            }
          }
        }
      }
    } catch (error) {
    }
  });

  ipcMain.handle('db:deleteRecord', async (_, categoryId, id) => {
    // 1. 레코드의 썸네일 정리
    const thumbnailDeleted = cleanupThumbnailForRecord(categoryId, id);
    
    // 2. 레코드 삭제
    db.prepare('DELETE FROM records WHERE categoryId = ? AND id = ?').run(categoryId, id);
    
    return {
      success: true,
      thumbnailDeleted
    };
  });

  ipcMain.handle('deleteThumbnail', async (_, filePath) => {
    return deleteThumbnail(filePath);
  });

  ipcMain.handle('generateThumbnailWithTime', async (_, filePath, timestampSec) => {
    return await generateThumbnailForFile(filePath, timestampSec);
  });
}; 
