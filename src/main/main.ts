import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import Database from 'better-sqlite3';
import fs from 'fs';
import { getThumbnailHash } from '../lib/fileHandler';
import { registerRecordHandlers } from './ipc/record';
import { registerCategoryHandlers } from './ipc/category';

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
        order_num INTEGER DEFAULT 0,
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

app.whenReady().then(() => {
  initializeDatabase();
  console.log('=== Database initialized ===');
  if (db) {
    console.log('=== Registering handlers directly in main.ts ===');
    
    // 핸들러들을 main.ts에서 직접 등록
    const { getFileType } = require('../lib/fileHandler');
    
    // db:getFileType 핸들러 등록
    console.log('=== Registering db:getFileType ===');
    ipcMain.handle('db:getFileType', async (_, filePath) => {
      try {
        console.log('=== db:getFileType called with:', filePath);
        return getFileType(filePath);
      } catch (e) {
        console.error('=== db:getFileType error:', e);
        return 'other';
      }
    });
    
    // db:getCategories 핸들러 등록
    console.log('=== Registering db:getCategories ===');
    ipcMain.handle('db:getCategories', async () => {
      console.log('Getting categories...');
      const categories = db.prepare('SELECT * FROM categories ORDER BY order_num').all();
      console.log('Categories found:', { count: categories.length });
      return categories;
    });
    
    // db:getRecords 핸들러 등록
    console.log('=== Registering db:getRecords ===');
    ipcMain.handle('db:getRecords', async (_, categoryId) => {
      if (!db) throw new Error('Database not initialized');
      if (!categoryId) throw new Error('No categoryId provided');
      const records = db.prepare('SELECT * FROM records WHERE categoryId = ?').all(categoryId);
      return records.map(record => ({
        ...record,
        data: JSON.parse(record.data)
      }));
    });
    
    console.log('=== All handlers registered successfully ===');
    
    // 카테고리/레코드 핸들러 등록
    registerCategoryHandlers(db);
    registerRecordHandlers(db);
  } else {
    console.error('=== Database is null, cannot register handlers ===');
  }
  
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