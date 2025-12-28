import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import Database from 'better-sqlite3';
import fs from 'fs';

const { getThumbnailHash } = require('../lib/fileHandler');
import { registerRecordHandlers } from './ipc/record';
import { registerCategoryHandlers } from './ipc/category';
import { registerBookmarkHandlers } from './ipc/bookmark';

const isDevelopment = process.env.NODE_ENV === 'development';

// 단일 인스턴스 락 적용
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;
  let db: Database.Database | null = null;

  app.on('second-instance', (event, argv, workingDirectory) => {
    // 이미 실행 중인 창을 앞으로 가져오기
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

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

    // 네비게이션 방지 (뒤로가기 등)
    win.webContents.on('will-navigate', (event, navigationUrl) => {
      const currentUrl = win.webContents.getURL();
      // 같은 도메인 내에서의 네비게이션만 허용 (HashRouter는 URL 변경 없음)
      // 외부 링크나 뒤로가기로 인한 네비게이션은 차단
      if (navigationUrl !== currentUrl && !navigationUrl.includes('#')) {
        event.preventDefault();
      }
    });

    // 새 창 열기 방지
    win.webContents.setWindowOpenHandler(() => {
      return { action: 'deny' };
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
        const records = db.prepare('SELECT * FROM records WHERE categoryId = ?').all(categoryId) as Array<{id: string, categoryId: string, data: string, createdAt: string, updatedAt: string}>;
        return records.map(record => ({
          ...record,
          data: JSON.parse(record.data)
        }));
      });
      
      // getFileSize 핸들러 등록
      console.log('=== Registering getFileSize ===');
      ipcMain.handle('getFileSize', async (_, filePath) => {
        try {
          if (!fs.existsSync(filePath)) {
            return { success: false, error: 'File not found' };
          }
          const stats = fs.statSync(filePath);
          const bytes = stats.size;
          const sizes = ['B', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(1024));
          const size = (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
          return { success: true, size };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      });
      
      // getConfig 핸들러 등록
      console.log('=== Registering getConfig ===');
      ipcMain.handle('getConfig', async () => {
        try {
          const configPath = path.join(process.cwd(), 'config.json');
          if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);
            return {
              dbPath: config.dbPath || 'local-erp.db',
              backupDir: config.backupDir || path.join(process.cwd(), 'backups'),
              backupInterval: config.backupInterval || 60
            };
          } else {
            // 기본 설정 반환
            return {
              dbPath: 'local-erp.db',
              backupDir: path.join(process.cwd(), 'backups'),
              backupInterval: 60
            };
          }
        } catch (error) {
          console.error('Error loading config:', error);
          return {
            dbPath: 'local-erp.db',
            backupDir: path.join(process.cwd(), 'backups'),
            backupInterval: 60
          };
        }
      });
      
      // deleteThumbnail 핸들러 등록
      console.log('=== Registering deleteThumbnail ===');
      ipcMain.handle('deleteThumbnail', async (_, filePath) => {
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
      });
      
      // 북마크 핸들러 등록
      registerBookmarkHandlers(db);
      
      // 카테고리/레코드 핸들러 등록
      registerCategoryHandlers(db);
      registerRecordHandlers(db);
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
}

// ... 이하 기존 app.whenReady() 등 모든 초기화 코드 ... 