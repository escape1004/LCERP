import { ipcMain } from 'electron';
import { Database } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const { getThumbnailHash, getFileType } = require('../../lib/fileHandler');

let db: Database | undefined;

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
const generateThumbnailForFile = async (filePath: string) => {
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
      
      // timestamp 결정: duration이 1초보다 짧으면 0초 또는 중간 지점 사용
      let timestampSec = 1;
      if (duration !== null && duration < 1) {
        // 1초보다 짧으면 0초 또는 중간 지점 사용
        timestampSec = Math.max(0, duration / 2);
      }
      
      await new Promise((resolve, reject) => {
        ffmpeg(normalizedPath)
          .screenshots({
            timestamps: [timestampSec],
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
    console.error('썸네일 생성 중 오류:', error);
  }
};

// 카테고리의 모든 레코드에서 썸네일 정리
const cleanupThumbnailsForCategory = (categoryId: string) => {
  try {
    const records = db.prepare('SELECT data FROM records WHERE categoryId = ?').all(categoryId) as Array<{data: string}>;
    let deletedCount = 0;
    
    records.forEach(record => {
      const data = JSON.parse(record.data);
      const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(categoryId) as {fields: string} | undefined;
      if (!category) return;
      
      const fields = JSON.parse(category.fields);
      const fileField = fields.find((f: any) => f.type === 'file');
      
      if (fileField && data[fileField.id]) {
        const filePath = data[fileField.id];
        if (deleteThumbnail(filePath)) {
          deletedCount++;
        }
      }
    });
    
    return deletedCount;
  } catch (error) {
    return 0;
  }
};

// 관계형 데이터에서 참조 정리
const cleanupRelationReferences = (categoryId: string) => {
  try {
    const allCategories = db.prepare('SELECT id, fields FROM categories').all() as Array<{id: string, fields: string}>;
    let cleanupCount = 0;
    
    allCategories.forEach(cat => {
      const fields = JSON.parse(cat.fields);
      const relationFields = fields.filter((f: any) => f.type === 'relation' && f.relationCategoryId === categoryId);
      
      if (relationFields.length > 0) {
        const records = db.prepare('SELECT id, data FROM records WHERE categoryId = ?').all(cat.id) as Array<{id: string, data: string}>;
        records.forEach(record => {
          const data = JSON.parse(record.data);
          let updated = false;
          
          relationFields.forEach((field: any) => {
            if (field.multiple && Array.isArray(data[field.id])) {
              const newValue = data[field.id].filter((id: string) => id !== categoryId);
              if (newValue.length !== data[field.id].length) {
                data[field.id] = newValue;
                updated = true;
              }
            } else if (data[field.id] === categoryId) {
              data[field.id] = null;
              updated = true;
            }
          });
          
          if (updated) {
            db.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), record.id);
            cleanupCount++;
          }
        });
      }
    });
    
    return cleanupCount;
  } catch (error) {
    return 0;
  }
};

// 빈 값을 null로 변환하는 함수
const normalizeData = (data: any): any => {
  if (typeof data === 'string') {
    return data.trim() === '' ? null : data;
  }
  if (Array.isArray(data)) {
    return data.map(normalizeData);
  }
  if (data && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, normalizeData(value)])
    );
  }
  return data;
};

export const registerCategoryHandlers = (database: Database) => {
  db = database;

  // Category handlers
  ipcMain.handle('db:getCategories', async () => {
    const categories = db.prepare('SELECT * FROM categories ORDER BY order_num').all();
    return categories;
  });

  ipcMain.handle('db:addCategory', async (_, category) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO categories (id, name, parentId, fields, order_num, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      category.name,
      category.parentId || null,
      JSON.stringify(category.fields),
      category.order_num || 0,
      now,
      now
    );

    return id;
  });

  ipcMain.handle('db:updateCategory', async (_, id, updates) => {
    const now = new Date().toISOString();
    const fields = updates.fields ? JSON.stringify(updates.fields) : undefined;
    
    const updateFields = [];
    const values = [];
    
    if (updates.name !== undefined) {
      updateFields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.parentId !== undefined) {
      updateFields.push('parentId = ?');
      values.push(updates.parentId);
    }
    if (fields !== undefined) {
      updateFields.push('fields = ?');
      values.push(fields);
    }
    if (updates.order_num !== undefined && updates.order_num !== null) {
      updateFields.push('order_num = ?');
      values.push(updates.order_num);
    }
    
    updateFields.push('updatedAt = ?');
    values.push(now);
    values.push(id);
    
    const query = `
      UPDATE categories 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `;
    
    db.prepare(query).run(...values);
  });

  ipcMain.handle('db:deleteCategory', async (_, id) => {
    
    // 1. 관계형 데이터에서 참조 정리
    const relationCleanupCount = cleanupRelationReferences(id);
    
    // 2. 하위 카테고리들의 썸네일 정리 및 삭제
    const childCategories = db.prepare('SELECT id FROM categories WHERE parentId = ?').all(id) as Array<{id: string}>;
    let totalThumbnailCount = 0;
    
    childCategories.forEach(child => {
      totalThumbnailCount += cleanupThumbnailsForCategory(child.id);
    });
    
    // 3. 현재 카테고리의 썸네일 정리
    totalThumbnailCount += cleanupThumbnailsForCategory(id);
    
    // 4. 하위 카테고리 먼저 삭제
    db.prepare('DELETE FROM categories WHERE parentId = ?').run(id);
    
    // 5. 카테고리에 속한 레코드 삭제
    db.prepare('DELETE FROM records WHERE categoryId = ?').run(id);
    
    // 6. 카테고리 삭제
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    
    return {
      success: true,
      thumbnailCleanupCount: totalThumbnailCount,
      relationCleanupCount: relationCleanupCount
    };
  });

  // Record handlers
  ipcMain.handle('db:getRecords', async (_, categoryId) => {
    if (!db) throw new Error('Database not initialized');
    if (!categoryId) throw new Error('No categoryId provided');
    const records = db.prepare('SELECT * FROM records WHERE categoryId = ?').all(categoryId) as Array<{id: string, categoryId: string, data: string, createdAt: string, updatedAt: string}>;
    return records.map(record => ({
      ...record,
      data: JSON.parse(record.data)
    }));
  });

  ipcMain.handle('addRecord', async (_, record) => {
    const { id, categoryId, data } = record;
    const now = new Date().toISOString();
    const normalizedData = normalizeData(data);
    db.prepare(`
      INSERT INTO records (id, categoryId, data, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, categoryId, JSON.stringify(normalizedData), now, now);

    // 파일 필드가 있으면 썸네일 자동 생성
    try {
      const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(categoryId) as {fields: string} | undefined;
      if (category) {
        const fields = JSON.parse(category.fields);
        const fileField = fields.find((f: any) => f.type === 'file');
        if (fileField && normalizedData[fileField.id]) {
          const filePath = normalizedData[fileField.id];
          
          await generateThumbnailForFile(filePath);
        }
      }
    } catch (error) {
      // 썸네일 생성 실패는 레코드 등록을 막지 않음
    }

    return id;
  });

  ipcMain.handle('updateRecord', async (_, id, data) => {
    const now = new Date().toISOString();
    const normalizedData = normalizeData(data);
    db.prepare(`
      UPDATE records
      SET data = ?, updatedAt = ?
      WHERE id = ?
    `).run(JSON.stringify(normalizedData), now, id);

    // 파일 필드가 있으면 썸네일 자동 생성
    try {
      const record = db.prepare('SELECT categoryId FROM records WHERE id = ?').get(id) as {categoryId: string} | undefined;
      if (record) {
        const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(record.categoryId) as {fields: string} | undefined;
        if (category) {
          const fields = JSON.parse(category.fields);
          const fileField = fields.find((f: any) => f.type === 'file');
          if (fileField && normalizedData[fileField.id]) {
            const filePath = normalizedData[fileField.id];
            
            await generateThumbnailForFile(filePath);
          }
        }
      }
    } catch (error) {
      // 썸네일 생성 실패는 레코드 업데이트를 막지 않음
    }
  });

  ipcMain.handle('deleteRecord', async (_, categoryId, id) => {
    try {
      
      // 1. 레코드 정보 가져오기 (삭제 전)
      const record = db.prepare('SELECT data FROM records WHERE categoryId = ? AND id = ?').get(categoryId, id) as {data: string} | undefined;
      if (!record) {
        throw new Error('Record not found');
      }
      
      // 2. 레코드의 썸네일 정리
      let thumbnailDeleted = false;
      try {
        const data = JSON.parse(record.data);
        
        // 카테고리 필드 정보 가져오기
        const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(categoryId) as {fields: string} | undefined;
        if (category) {
          const fields = JSON.parse(category.fields);
          const fileField = fields.find((f: any) => f.type === 'file');
          
          if (fileField && data[fileField.id]) {
            const filePath = data[fileField.id];
            thumbnailDeleted = deleteThumbnail(filePath);
          }
        }
      } catch (error) {
      }
      
      // 3. 레코드 삭제
      db.prepare('DELETE FROM records WHERE categoryId = ? AND id = ?').run(categoryId, id);
      
      return {
        success: true,
        thumbnailDeleted
      };
    } catch (error) {
      throw error;
    }
  });

  // File system handlers
  ipcMain.handle('openFileDialog', async () => {
    const { dialog } = await import('electron');
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: '파일 선택'
    });
    return result;
  });

  ipcMain.handle('openDirectoryDialog', async () => {
    const { dialog } = await import('electron');
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '폴더 선택'
    });
    return result;
  });

  ipcMain.handle('checkFileExists', async (_, filePath) => {
    try {
      const thumbnailDir = path.join(process.cwd(), 'save', 'thumbnails');
      const hash = getThumbnailHash(filePath);
      const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
      return fs.existsSync(thumbnailPath);
    } catch (e) {
      return false;
    }
  });

  ipcMain.handle('generateThumbnail', async (_, filePath) => {
    try {
      const { generateThumbnail } = await import('../../lib/fileHandler');
      const thumbnailPath = await generateThumbnail(filePath);
      return thumbnailPath;
    } catch (error) {
      return null;
    }
  });

  ipcMain.handle('getFileDataUrl', async (_, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      let mimeType = 'application/octet-stream';
      
      // MIME 타입 결정
      if (['.jpg', '.jpeg'].includes(ext)) {
        mimeType = 'image/jpeg';
      } else if (ext === '.png') {
        mimeType = 'image/png';
      } else if (ext === '.gif') {
        mimeType = 'image/gif';
      } else if (ext === '.webp') {
        mimeType = 'image/webp';
      } else if (['.mp4', '.avi', '.mkv', '.mov'].includes(ext)) {
        mimeType = `video/${ext.slice(1)}`;
      }
      
      const dataUrl = `data:${mimeType};base64,${data.toString('base64')}`;
      return dataUrl;
    } catch (e) {
      return null;
    }
  });

  // Archive handlers
  ipcMain.handle('getArchiveFiles', async (_, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        return [];
      }
      
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.7z') {
        return [];
      }
      
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      
      const files = entries.map(entry => ({
        name: entry.entryName,
        size: entry.header.size,
        isDirectory: entry.isDirectory,
        comment: entry.comment || ''
      }));
      
      return files;
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle('getArchiveFileDataUrl', async (_, filePath, fileName) => {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.7z') {
        return null;
      }
      
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(filePath);
      const entry = zip.getEntry(fileName);
      
      if (!entry || entry.isDirectory) {
        return null;
      }
      
      const buffer = zip.readFile(entry);
      const fileExt = path.extname(fileName).toLowerCase();
      let mimeType = 'application/octet-stream';
      
      // MIME 타입 결정
      if (['.jpg', '.jpeg'].includes(fileExt)) {
        mimeType = 'image/jpeg';
      } else if (fileExt === '.png') {
        mimeType = 'image/png';
      } else if (fileExt === '.gif') {
        mimeType = 'image/gif';
      } else if (fileExt === '.webp') {
        mimeType = 'image/webp';
      } else if (fileExt === '.txt') {
        mimeType = 'text/plain';
      } else if (['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(fileExt)) {
        mimeType = `video/${fileExt.slice(1)}`;
      }
      
      const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
      return dataUrl;
    } catch (e) {
      return null;
    }
  });

  // 압축파일 내 텍스트 파일 내용을 읽는 핸들러
  ipcMain.handle('getArchiveFileText', async (_, filePath, fileName) => {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.7z') {
        return null;
      }
      
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(filePath);
      const entry = zip.getEntry(fileName);
      
      if (!entry || entry.isDirectory) {
        return null;
      }
      
      const buffer = zip.readFile(entry);
      const fileExt = path.extname(fileName).toLowerCase();
      
      // 텍스트 파일만 처리
      if (fileExt === '.txt') {
        const text = buffer.toString('utf8');
        return text;
      } else {
        return null;
      }
    } catch (e) {
      return null;
    }
  });

  // Thumbnail handlers
  ipcMain.handle('getThumbnailDataUrl', async (_, filePath) => {
    try {
      const thumbnailDir = path.join(process.cwd(), 'save', 'thumbnails');
      const hash = getThumbnailHash(filePath);
      const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);

      if (!fs.existsSync(thumbnailPath)) {
        return null;
      }

      const data = fs.readFileSync(thumbnailPath);
      const dataUrl = `data:image/jpeg;base64,${data.toString('base64')}`;
      return dataUrl;
    } catch (error) {
      return null;
    }
  });

  // Shell handlers
  ipcMain.handle('openExternal', async (_, url) => {
    try {
      const { shell } = await import('electron');
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // File type handler
  ipcMain.handle('db:getFileType', async (_, filePath) => {
    try {
      return getFileType(filePath);
    } catch (e) {
      return 'other';
    }
  });
}; 
