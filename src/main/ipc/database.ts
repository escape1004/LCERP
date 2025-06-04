import { ipcMain, shell, app, dialog } from 'electron';
import { Database } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// 설정 파일 경로
const configPath = path.join(app.getPath('userData'), 'config.json');

// 기본 설정
let config = {
  dbPath: path.join(process.env.NODE_ENV === 'development' 
    ? path.join(__dirname, '..', '..', '..') 
    : path.join(process.resourcesPath, 'app'), 'save', 'data.db'),
  backupDir: path.join(app.getPath('userData'), 'backups'),
  backupInterval: 60 * 60 * 1000 // 1시간
};

// 설정 로드
const loadConfig = () => {
  try {
    if (fs.existsSync(configPath)) {
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config = { ...config, ...savedConfig };
    }
    console.log('Loaded config:', config);
  } catch (error) {
    console.error('Failed to load config:', error);
  }
};

// 설정 저장
const saveConfig = () => {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('Saved config:', config);
  } catch (error) {
    console.error('Failed to save config:', error);
  }
};

// 초기 설정 로드
loadConfig();

// save 디렉토리가 없으면 생성
const saveDir = path.dirname(config.dbPath);
if (!fs.existsSync(saveDir)) {
  fs.mkdirSync(saveDir, { recursive: true });
}

// 백업 디렉토리가 없으면 생성
if (!fs.existsSync(config.backupDir)) {
  fs.mkdirSync(config.backupDir, { recursive: true });
}

const db = new Database(config.dbPath);

// 백업 함수
const backupDatabase = () => {
  try {
    if (fs.existsSync(config.dbPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(config.backupDir, `backup_${timestamp}.db`);
      
      // 파일 복사
      fs.copyFileSync(config.dbPath, backupPath);
      
      // 최근 5개의 백업만 유지
      const backupFiles = fs.readdirSync(config.backupDir)
        .filter(file => file.startsWith('backup_'))
        .sort((a, b) => b.localeCompare(a));
      
      if (backupFiles.length > 5) {
        backupFiles.slice(5).forEach(file => {
          fs.unlinkSync(path.join(config.backupDir, file));
        });
      }
      
      console.log(`Database backed up to: ${backupPath}`);
    }
  } catch (error) {
    console.error('Failed to backup database:', error);
  }
};

// 백업 인터벌 설정
let backupInterval = setInterval(backupDatabase, config.backupInterval);

// 앱 시작시 최초 백업 실행
backupDatabase();

export const registerDatabaseHandlers = () => {
  console.log('Registering database handlers...'); // 디버깅용 로그

  // Database APIs
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

  ipcMain.handle('getDbPath', () => {
    console.log('getDbPath called, returning:', config.dbPath);
    return config.dbPath;
  });

  ipcMain.handle('openDbFile', async () => {
    await shell.showItemInFolder(config.dbPath);
  });

  // Backup APIs
  ipcMain.handle('backupDatabase', async () => {
    try {
      backupDatabase();
      return { success: true };
    } catch (error) {
      console.error('Backup failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('openBackupLocation', async () => {
    try {
      await shell.openPath(config.backupDir);
      return { success: true };
    } catch (error) {
      console.error('Failed to open backup location:', error);
      return { success: false, error: error.message };
    }
  });

  // Configuration APIs
  ipcMain.handle('getConfig', () => {
    console.log('getConfig called, returning:', config);
    return {
      dbPath: config.dbPath,
      backupDir: config.backupDir,
      backupInterval: config.backupInterval / (60 * 1000) // Convert to minutes
    };
  });

  ipcMain.handle('setDbPath', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'DB 파일 저장 위치 선택',
        defaultPath: path.dirname(config.dbPath)
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const newDbPath = path.join(result.filePaths[0], 'data.db');
        
        // 기존 DB 파일이 있다면 새 위치로 복사
        if (fs.existsSync(config.dbPath)) {
          fs.copyFileSync(config.dbPath, newDbPath);
        }
        
        // DB 연결 해제 후 재연결
        db.close();
        config.dbPath = newDbPath;
        saveConfig();
        
        // 새 DB 연결
        const newDb = new Database(newDbPath);
        Object.assign(db, newDb);
        
        return { success: true, path: newDbPath };
      }
      return { success: false };
    } catch (error) {
      console.error('Failed to set DB path:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('setBackupDir', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '백업 저장 위치 선택',
        defaultPath: config.backupDir
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const newBackupDir = result.filePaths[0];
        
        // 기존 백업 파일들을 새 위치로 복사
        if (fs.existsSync(config.backupDir)) {
          const backupFiles = fs.readdirSync(config.backupDir);
          backupFiles.forEach(file => {
            const srcPath = path.join(config.backupDir, file);
            const destPath = path.join(newBackupDir, file);
            fs.copyFileSync(srcPath, destPath);
          });
        }
        
        config.backupDir = newBackupDir;
        saveConfig();
        
        return { success: true, path: newBackupDir };
      }
      return { success: false };
    } catch (error) {
      console.error('Failed to set backup directory:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('setBackupInterval', async (_, minutes: number) => {
    try {
      config.backupInterval = minutes * 60 * 1000;
      clearInterval(backupInterval);
      backupInterval = setInterval(backupDatabase, config.backupInterval);
      saveConfig();
      return { success: true };
    } catch (error) {
      console.error('Failed to set backup interval:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('Database handlers registered successfully'); // 디버깅용 로그
}; 