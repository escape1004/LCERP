import { ipcMain } from 'electron';
import { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

let db: Database;

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

export const registerRecordHandlers = () => {
  console.log('Registering record handlers...');

  ipcMain.handle('getRecords', async (_, categoryId) => {
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

  ipcMain.handle('addRecord', async (_, record) => {
    console.log('=== Adding Record to Database ===');
    console.log('Record to add:', record);
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    // 데이터 저장 전에 빈 값 표준화
    const normalizedData = normalizeValue(record.data);
    const stringifiedData = JSON.stringify(normalizedData);
    
    console.log('Normalized data:', normalizedData);
    console.log('Stringified data:', stringifiedData);
    
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

  ipcMain.handle('updateRecord', async (_, id, data) => {
    console.log('=== Updating Record in Database ===');
    console.log('Record ID:', id);
    console.log('Data to update:', data);
    
    const now = new Date().toISOString();
    const stringifiedData = JSON.stringify(data);
    
    console.log('Stringified data:', stringifiedData);
    
    db.prepare(`
      UPDATE records 
      SET data = ?, updatedAt = ?
      WHERE id = ?
    `).run(stringifiedData, now, id);
  });

  ipcMain.handle('deleteRecord', async (_, categoryId, id) => {
    db.prepare('DELETE FROM records WHERE categoryId = ? AND id = ?').run(categoryId, id);
  });

  console.log('Record handlers registered successfully');
}; 