import { ipcMain } from 'electron';
import { Database } from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

const dbPath = path.join(app.getPath('userData'), 'data.db');
const db = new Database(dbPath);

export const registerRecordHandlers = () => {
  ipcMain.handle('getRecords', async (_, categoryId) => {
    return db.prepare('SELECT * FROM records WHERE categoryId = ?').all(categoryId);
  });

  ipcMain.handle('addRecord', async (_, record) => {
    const { id, categoryId, ...data } = record;
    const jsonData = JSON.stringify(data);
    
    const result = db.prepare(
      'INSERT INTO records (id, categoryId, data) VALUES (?, ?, ?)'
    ).run(id, categoryId, jsonData);
    
    return result.lastInsertRowid;
  });

  ipcMain.handle('updateRecord', async (_, id, data) => {
    const jsonData = JSON.stringify(data);
    db.prepare('UPDATE records SET data = ? WHERE id = ?').run(jsonData, id);
  });

  ipcMain.handle('deleteRecord', async (_, categoryId, id) => {
    db.prepare('DELETE FROM records WHERE categoryId = ? AND id = ?').run(categoryId, id);
  });
}; 