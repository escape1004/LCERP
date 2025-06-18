import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import { registerCategoryHandlers } from './ipc/category';
import { registerRecordHandlers } from './ipc/record';
import { registerDatabaseHandlers } from './ipc/database';
import Database from 'better-sqlite3';
import fs from 'fs';

const isDevelopment = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let db: Database.Database | null = null;

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../dist/preload.js')
    }
  });

  if (isDevelopment) {
    win.loadURL('http://localhost:5174');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  return win;
};

const initializeDatabase = () => {
  try {
    db = new Database('local-erp.db');
    
    // 카테고리 테이블 생성
    db.prepare(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parentId TEXT,
        fields TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parentId) REFERENCES categories (id)
      )
    `).run();

    // 레코드 테이블 생성
    db.prepare(`
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        categoryId TEXT NOT NULL,
        data TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (categoryId) REFERENCES categories (id)
      )
    `).run();

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }
};

const registerShellHandlers = () => {
  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
};

app.whenReady().then(() => {
  initializeDatabase();
  registerCategoryHandlers();
  registerRecordHandlers();
  registerDatabaseHandlers();
  registerShellHandlers();
  
  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (db) {
      db.close();
    }
    app.quit();
  }
});

// IPC 핸들러 등록
ipcMain.handle('openExternal', async (_, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('getCategories', async () => {
  return db.prepare('SELECT * FROM categories').all();
});

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

ipcMain.handle('getRecords', async (_, categoryId) => {
  const records = db.prepare('SELECT * FROM records WHERE categoryId = ?').all(categoryId);
  return records.map(record => ({
    ...record,
    data: JSON.parse(record.data)
  }));
});

ipcMain.handle('addCategory', async (_, category) => {
  const { id, name, parentId, fields } = category;
  db.prepare(`
    INSERT INTO categories (id, name, parentId, fields)
    VALUES (?, ?, ?, ?)
  `).run(id, name, parentId, JSON.stringify(fields));
  return id;
});

ipcMain.handle('updateCategory', async (_, id, category) => {
  const { name, parentId, fields } = category;
  db.prepare(`
    UPDATE categories
    SET name = ?, parentId = ?, fields = ?
    WHERE id = ?
  `).run(name, parentId, JSON.stringify(fields), id);
});

ipcMain.handle('deleteCategory', async (_, id) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
});

ipcMain.handle('addRecord', async (_, record) => {
  const { id, categoryId, data } = record;
  const now = new Date().toISOString();
  const normalizedData = normalizeData(data);
  db.prepare(`
    INSERT INTO records (id, categoryId, data, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, categoryId, JSON.stringify(normalizedData), now, now);
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
});

ipcMain.handle('deleteRecord', async (_, categoryId, id) => {
  db.prepare('DELETE FROM records WHERE categoryId = ? AND id = ?').run(categoryId, id);
});

ipcMain.handle('openFileDialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: '파일 선택'
  });
  return result;
});

ipcMain.handle('checkFileExists', async (_, filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch (e) {
    return false;
  }
});

console.log("=== Electron __dirname ===", __dirname);
console.log("=== preload path ===", path.join(__dirname, '../dist/preload.js')); 