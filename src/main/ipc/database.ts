import { ipcMain, shell } from 'electron';
import { Database } from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

const dbPath = path.join(app.getPath('userData'), 'data.db');
const db = new Database(dbPath);

export const registerDatabaseHandlers = () => {
  ipcMain.handle('getTables', async () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
    `).all();
    return tables;
  });

  ipcMain.handle('getTableData', async (_, tableName: string) => {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
    return {
      columns: columns.map(col => col.name),
      rows,
    };
  });

  ipcMain.handle('getDbPath', async () => {
    return dbPath;
  });

  ipcMain.handle('openDbFile', async () => {
    await shell.showItemInFolder(dbPath);
  });

  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}; 