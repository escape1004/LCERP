import { ipcMain, shell } from 'electron';
import { Database } from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

// 프로젝트 루트 디렉토리 경로 가져오기
const projectRoot = process.env.NODE_ENV === 'development' 
  ? path.join(__dirname, '..', '..', '..') 
  : path.join(process.resourcesPath, 'app');

// save 디렉토리 내에 데이터베이스 파일 생성
const dbPath = path.join(projectRoot, 'save', 'data.db');

// save 디렉토리가 없으면 생성
const fs = require('fs');
const saveDir = path.dirname(dbPath);
if (!fs.existsSync(saveDir)) {
  fs.mkdirSync(saveDir, { recursive: true });
}

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