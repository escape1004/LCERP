import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import { registerCategoryHandlers } from './ipc/category';
import { registerRecordHandlers } from './ipc/record';
import { registerDatabaseHandlers } from './ipc/database';
import Database from 'better-sqlite3';
import fs from 'fs';
import { generateThumbnail } from '../lib/fileHandler';

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

// 썸네일 파일 삭제 함수
const deleteThumbnail = (filePath: string) => {
  try {
    const thumbnailDir = path.join(process.cwd(), 'thumbnails');
    const thumbnailPath = path.join(thumbnailDir, `thumb_${path.basename(filePath)}.jpg`);
    
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

ipcMain.handle('deleteRecord', async (_, categoryId, id) => {
  try {
    console.log('레코드 삭제 시작:', { categoryId, id });
    
    // 1. 레코드 정보 가져오기 (삭제 전)
    const record = db.prepare('SELECT data FROM records WHERE categoryId = ? AND id = ?').get(categoryId, id);
    if (!record) {
      throw new Error('Record not found');
    }
    
    // 2. 레코드의 썸네일 정리
    let thumbnailDeleted = false;
    try {
      const data = JSON.parse(record.data);
      
      // 카테고리 필드 정보 가져오기
      const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(categoryId);
      if (category) {
        const fields = JSON.parse(category.fields);
        const fileField = fields.find(f => f.type === 'file');
        
        if (fileField && data[fileField.id]) {
          const filePath = data[fileField.id];
          thumbnailDeleted = deleteThumbnail(filePath);
        }
      }
    } catch (error) {
      console.error('썸네일 정리 중 오류:', error);
    }
    
    // 3. 레코드 삭제
    db.prepare('DELETE FROM records WHERE categoryId = ? AND id = ?').run(categoryId, id);
    
    console.log(`레코드 삭제 완료: ${thumbnailDeleted ? '썸네일 정리됨' : '썸네일 없음'}`);
    
    return {
      success: true,
      thumbnailDeleted
    };
  } catch (error) {
    console.error('레코드 삭제 중 오류:', error);
    throw error;
  }
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

ipcMain.handle('generateThumbnail', async (_, filePath) => {
  try {
    const thumbnailPath = await generateThumbnail(filePath);
    return { success: !!thumbnailPath, thumbnailPath };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('getThumbnailDataUrl', async (_, filePath) => {
  const path = require('path');
  const fs = require('fs');
  const thumbnailDir = path.join(process.cwd(), 'thumbnails');
  const thumbnailPath = path.join(thumbnailDir, `thumb_${path.basename(filePath)}.jpg`);
  if (!fs.existsSync(thumbnailPath)) {
    return { success: false, error: '썸네일 없음' };
  }
  const data = fs.readFileSync(thumbnailPath);
  const dataUrl = `data:image/jpeg;base64,${data.toString('base64')}`;
  return { success: true, dataUrl };
});

console.log("=== Electron __dirname ===", __dirname);
console.log("=== preload path ===", path.join(__dirname, '../dist/preload.js')); 