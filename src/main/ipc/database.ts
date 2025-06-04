import { ipcMain, shell, app } from 'electron';
import { Database } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// 프로젝트 루트 디렉토리 경로 가져오기
const projectRoot = process.env.NODE_ENV === 'development' 
  ? path.join(__dirname, '..', '..', '..') 
  : path.join(process.resourcesPath, 'app');

// save 디렉토리 내에 데이터베이스 파일 생성
const dbPath = path.join(projectRoot, 'save', 'data.db');

// AppData 백업 경로 설정
const backupDir = path.join(app.getPath('userData'), 'backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// save 디렉토리가 없으면 생성
const saveDir = path.dirname(dbPath);
if (!fs.existsSync(saveDir)) {
  fs.mkdirSync(saveDir, { recursive: true });
}

const db = new Database(dbPath);

// 백업 함수
const backupDatabase = () => {
  try {
    if (fs.existsSync(dbPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `backup_${timestamp}.db`);
      
      // 파일 복사
      fs.copyFileSync(dbPath, backupPath);
      
      // 최근 5개의 백업만 유지
      const backupFiles = fs.readdirSync(backupDir)
        .filter(file => file.startsWith('backup_'))
        .sort((a, b) => b.localeCompare(a)); // 최신 파일순으로 정렬
      
      // 5개 이상이면 오래된 파일 삭제
      if (backupFiles.length > 5) {
        backupFiles.slice(5).forEach(file => {
          fs.unlinkSync(path.join(backupDir, file));
        });
      }
      
      console.log(`Database backed up to: ${backupPath}`);
    }
  } catch (error) {
    console.error('Failed to backup database:', error);
  }
};

// 1시간마다 백업 실행
setInterval(backupDatabase, 60 * 60 * 1000);

// 앱 시작시 최초 백업 실행
backupDatabase();

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

  // 수동 백업 핸들러 추가
  ipcMain.handle('backupDatabase', async () => {
    backupDatabase();
    return { success: true };
  });

  // 백업 경로 열기 핸들러 추가
  ipcMain.handle('openBackupLocation', async () => {
    await shell.openPath(backupDir);
    return { success: true };
  });
}; 