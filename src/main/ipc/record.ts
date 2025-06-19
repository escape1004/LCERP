import { ipcMain } from 'electron';
import { Database } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { generateThumbnail, getThumbnailHash } from '../../lib/fileHandler';

let db: Database;

// 썸네일 파일 삭제 함수
const deleteThumbnail = (filePath: string) => {
  try {
    const thumbnailDir = path.join(process.cwd(), 'save', 'thumbnails');
    const hash = getThumbnailHash(filePath);
    const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
    
    if (fs.existsSync(thumbnailPath)) {
      fs.unlinkSync(thumbnailPath);
      console.log('썸네일 삭제됨:', thumbnailPath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('썸네일 삭제 실패:', error);
    return false;
  }
};

// 레코드의 썸네일 정리
const cleanupThumbnailForRecord = (categoryId: string, recordId: string) => {
  try {
    // 레코드 데이터 가져오기
    const record = db.prepare('SELECT data FROM records WHERE categoryId = ? AND id = ?').get(categoryId, recordId);
    if (!record) return false;
    
    const data = JSON.parse(record.data);
    
    // 카테고리 필드 정보 가져오기
    const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(categoryId);
    if (!category) return false;
    
    const fields = JSON.parse(category.fields);
    const fileField = fields.find((f: any) => f.type === 'file');
    
    if (fileField && data[fileField.id]) {
      const filePath = data[fileField.id];
      return deleteThumbnail(filePath);
    }
    
    return false;
  } catch (error) {
    console.error('레코드 썸네일 정리 중 오류:', error);
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
  console.log('Registering record handlers...');

  ipcMain.handle('db:getRecords', async (_, categoryId) => {
    if (!categoryId) {
      throw new Error('Category not found: ' + categoryId);
    }

    // 카테고리 존재 여부 확인
    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
    if (!category) {
      throw new Error('Category not found: ' + categoryId);
    }

    const records = db.prepare('SELECT * FROM records WHERE categoryId = ?').all(categoryId);
    
    // JSON 파싱 및 빈 값 처리
    return records.map(record => ({
      ...record,
      data: JSON.parse(record.data, (key, value) => normalizeValue(value))
    }));
  });

  ipcMain.handle('db:addRecord', async (_, record) => {
    console.log('=== Adding Record to Database ===');
    console.log('Record to add:', record);
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    // 데이터 저장 전에 빈 값 표준화
    const normalizedData = normalizeValue(record.data);
    const stringifiedData = JSON.stringify(normalizedData);
    
    // 썸네일 생성 제거 - 필요할 때만 생성하도록 변경
    
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

    return id;
  });

  ipcMain.handle('db:updateRecord', async (_, id, data) => {
    console.log('=== Updating Record in Database ===');
    console.log('Record ID:', id);
    console.log('Data to update:', data);
    
    const now = new Date().toISOString();
    const stringifiedData = JSON.stringify(data);
    
    // 썸네일 생성 제거 - 필요할 때만 생성하도록 변경
    
    db.prepare(`
      UPDATE records 
      SET data = ?, updatedAt = ?
      WHERE id = ?
    `).run(stringifiedData, now, id);
  });

  ipcMain.handle('db:deleteRecord', async (_, categoryId, id) => {
    console.log('레코드 삭제 시작:', { categoryId, id });
    
    // 1. 레코드의 썸네일 정리
    const thumbnailDeleted = cleanupThumbnailForRecord(categoryId, id);
    
    // 2. 레코드 삭제
    db.prepare('DELETE FROM records WHERE categoryId = ? AND id = ?').run(categoryId, id);
    
    console.log(`레코드 삭제 완료: ${thumbnailDeleted ? '썸네일 정리됨' : '썸네일 없음'}`);
    
    return {
      success: true,
      thumbnailDeleted
    };
  });

  console.log('Record handlers registered successfully');
}; 