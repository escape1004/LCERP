import { ipcMain } from 'electron';
import { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

let db: Database;

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
    return records;
  });

  ipcMain.handle('addRecord', async (_, record) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO records (id, categoryId, data, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      record.categoryId,
      JSON.stringify(record.data),
      now,
      now
    );

    return id;
  });

  ipcMain.handle('updateRecord', async (_, id, data) => {
    const now = new Date().toISOString();
    
    db.prepare(`
      UPDATE records 
      SET data = ?, updatedAt = ?
      WHERE id = ?
    `).run(JSON.stringify(data), now, id);
  });

  ipcMain.handle('deleteRecord', async (_, categoryId, id) => {
    db.prepare('DELETE FROM records WHERE categoryId = ? AND id = ?').run(categoryId, id);
  });

  console.log('Record handlers registered successfully');
}; 