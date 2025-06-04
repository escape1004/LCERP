const { app, BrowserWindow, ipcMain, protocol, dialog, shell } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');
const crypto = require('crypto');

// 로그 파일 설정
const logPath = path.join(app.getPath('userData'), 'app.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

// 데이터베이스 및 백업 경로 설정
const isDev = process.env.VITE_DEV_SERVER_URL;
const projectRoot = isDev ? path.resolve(__dirname, '..') : process.resourcesPath;
const dbPath = path.join(projectRoot, 'save', 'erp.db');
const backupDir = path.join(app.getPath('userData'), 'backups');

// save 폴더가 없으면 생성
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

// 백업 폴더가 없으면 생성
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// 로깅 함수
function log(message, data = '') {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message} ${data ? JSON.stringify(data) : ''}\n`;
  console.log(logMessage);
  logStream.write(logMessage);
}

// 프로토콜 등록 함수
function registerProtocol() {
  protocol.registerFileProtocol('app', (request, callback) => {
    const url = request.url.replace('app://', '');
    try {
      return callback(decodeURIComponent(path.normalize(url)));
    } catch (error) {
      console.error(error);
    }
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    }
  });

  // CSP 설정
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' data:;",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval';",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
          "img-src 'self' data: https:;",
          "font-src 'self' data: https://fonts.gstatic.com;",
          "connect-src 'self' ws: wss:;"
        ].join(' ')
      }
    });
  });

  // 개발 모드에서는 Vite 개발 서버 URL을 사용
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // 프로덕션 모드에서는 빌드된 파일을 로드
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html')).catch(e => {
      console.error('Failed to load index.html:', e);
      app.quit();
    });
  }

  // 디버깅을 위한 추가 이벤트 리스너
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', {
      errorCode,
      errorDescription,
      resourcePath: path.join(__dirname, '..', 'dist', 'index.html'),
      exists: fs.existsSync(path.join(__dirname, '..', 'dist', 'index.html'))
    });
  });

  // 창 상태 변경 이벤트 처리
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-change', { maximized: true });
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-change', { maximized: false });
  });

  // 창 제어 이벤트 처리
  ipcMain.on('window-control', (_, command) => {
    switch (command) {
      case 'minimize':
        mainWindow.minimize();
        break;
      case 'maximize':
        mainWindow.maximize();
        break;
      case 'restore':
        mainWindow.restore();
        break;
      case 'close':
        mainWindow.close();
        break;
    }
  });
}

// 데이터베이스 연결 설정
log('Database path:', JSON.stringify(dbPath));

const db = new Database(dbPath, {
  verbose: log
});

// SQLite 설정
db.exec('PRAGMA encoding = "UTF-8"');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');

// 데이터베이스 연결 확인
log('Database connection established');
log('Database pragma settings:', {
  encoding: db.prepare('PRAGMA encoding').get().encoding,
  foreign_keys: db.prepare('PRAGMA foreign_keys').get().foreign_keys,
  journal_mode: db.prepare('PRAGMA journal_mode').get().journal_mode
});

// 데이터베이스 테이블 생성
function initializeDatabase() {
  log('Initializing database...');
  try {
    // 카테고리 테이블
    log('Creating categories table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE,
        parentId TEXT,
        fields TEXT NOT NULL,
        order_num INTEGER,
        createdAt TEXT,
        updatedAt TEXT,
        FOREIGN KEY (parentId) REFERENCES categories(id)
      )
    `);
    log('Categories table created successfully');

    // 레코드 테이블
    log('Creating records table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        categoryId TEXT NOT NULL,
        data TEXT NOT NULL,
        createdAt TEXT,
        updatedAt TEXT,
        FOREIGN KEY (categoryId) REFERENCES categories(id)
      )
    `);
    log('Records table created successfully');

    // 테이블 확인
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    log('Available tables:', tables);
  } catch (error) {
    log('Error initializing database:', error);
    throw error;
  }
}

app.whenReady().then(() => {
  registerProtocol();  // 프로토콜 등록
  initializeDatabase();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    db.close();
    app.quit();
  }
});

// IPC 핸들러 설정
ipcMain.handle('db:getCategories', () => {
  log('Getting categories...');
  const stmt = db.prepare('SELECT * FROM categories ORDER BY order_num');
  const categories = stmt.all();
  log('Categories found:', { count: categories.length });
  return categories.map(cat => ({
    ...cat,
    fields: JSON.parse(cat.fields)
  }));
});

// DB 뷰어를 위한 핸들러 추가
ipcMain.handle('db:getTables', () => {
  log('Getting database tables...');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  return tables;
});

ipcMain.handle('db:getTableData', (event, tableName) => {
  log('Getting data for table:', tableName);
  try {
    // SQL injection 방지를 위한 테이블 이름 검증
    const validTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    if (!validTables.some(t => t.name === tableName)) {
      throw new Error('Invalid table name');
    }
    
    const stmt = db.prepare(`SELECT * FROM ${tableName} LIMIT 1000`);
    const rows = stmt.all();
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    
    return {
      columns,
      rows,
      total: rows.length
    };
  } catch (error) {
    log('Error getting table data:', error);
    throw error;
  }
});

// DB 파일 경로 가져오기
ipcMain.handle('db:getPath', () => {
  return dbPath;
});

// DB 파일 열기
ipcMain.handle('db:openFile', () => {
  shell.showItemInFolder(dbPath);
});

// URL 열기 핸들러 추가
ipcMain.handle('shell:openExternal', async (_, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    log('Error opening URL:', error);
    return { success: false, error: error.message };
  }
});

function generateUUID() {
  return crypto.randomUUID();
}

ipcMain.handle('db:addCategory', async (_, category) => {
  console.log('IPC: Received addCategory request:', category);
  const id = generateUUID();
  const now = new Date().toISOString();
  
  try {
    console.log('IPC: Inserting category into database');
    db.prepare(`
      INSERT INTO categories (id, name, parentId, fields, order_num, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      category.name,
      category.parentId || null,
      JSON.stringify(category.fields),
      category.order_num || 0,
      now,
      now
    );
    console.log('IPC: Category inserted successfully:', id);
    return id;
  } catch (error) {
    console.error('IPC: Error adding category:', error);
    throw error;
  }
});

ipcMain.handle('db:updateCategory', (_, id, updates) => {
  const stmt = db.prepare(`
    UPDATE categories
    SET name = ?, parentId = ?, fields = ?, order_num = ?, updatedAt = ?
    WHERE id = ?
  `);
  stmt.run(
    updates.name,
    updates.parentId || null,
    JSON.stringify(updates.fields),
    updates.order,
    new Date().toISOString(),
    id
  );
});

ipcMain.handle('db:deleteCategory', (_, id) => {
  const stmt = db.prepare('DELETE FROM categories WHERE id = ?');
  stmt.run(id);
});

// 레코드 조회 핸들러
ipcMain.handle('db:getRecords', (_, categoryId) => {
  try {
    log('Getting records for category:', { categoryId });
    
    // 카테고리 존재 여부 확인
    const categoryExists = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
    if (!categoryExists) {
      log('Category not found when getting records:', { categoryId });
      throw new Error(`Category not found: ${categoryId}`);
    }

    // 레코드 조회 쿼리 준비
    const stmt = db.prepare('SELECT * FROM records WHERE categoryId = ? ORDER BY createdAt DESC');
    log('Executing records query for category:', { categoryId });
    
    // 레코드 조회 실행
    const records = stmt.all(categoryId);
    log('Raw records found:', { 
      count: records.length,
      categoryId: categoryId,
      firstRecord: records[0] ? {
        id: records[0].id,
        data: records[0].data,
        dataLength: records[0].data ? records[0].data.length : 0
      } : null
    });

    // 레코드 데이터 파싱
    const parsedRecords = records.map(record => {
      try {
        const parsedData = JSON.parse(record.data);
        log('Successfully parsed record data:', {
          recordId: record.id,
          dataKeys: Object.keys(parsedData),
          rawData: record.data,
          parsedData
        });
        return {
          id: record.id,
          categoryId: record.categoryId,
          data: parsedData,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt
        };
      } catch (parseError) {
        log('Error parsing record data:', {
          recordId: record.id,
          error: parseError.message,
          rawData: record.data
        });
        throw new Error(`Failed to parse record data for record ${record.id}: ${parseError.message}`);
      }
    });

    log('Successfully processed records:', {
      count: parsedRecords.length,
      categoryId: categoryId,
      records: parsedRecords
    });

    return parsedRecords;
  } catch (error) {
    log('Error in getRecords:', {
      message: error.message,
      categoryId: categoryId,
      stack: error.stack
    });
    throw error;
  }
});

// 중복 체크 함수
function checkDuplicateFields(categoryId, data, existingRecordId = null) {
  log('Checking duplicate fields:', { categoryId, data, existingRecordId });
  
  // 카테고리 필드 정보 가져오기
  const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(categoryId);
  if (!category) {
    throw new Error(`Category not found: ${categoryId}`);
  }

  const fields = JSON.parse(category.fields);
  const uniqueFields = fields.filter(field => field.unique);

  // 중복 체크가 필요한 필드가 없으면 통과
  if (uniqueFields.length === 0) {
    return true;
  }

  // 각 unique 필드에 대해 중복 검사
  for (const field of uniqueFields) {
    const fieldValue = data[field.id];
    if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
      continue; // 빈 값은 중복 체크 제외
    }

    // 중복 검사 쿼리 준비
    let query = `
      SELECT id FROM records 
      WHERE categoryId = ? 
      AND json_extract(data, '$.${field.id}') = ?
    `;
    let params = [categoryId, String(fieldValue)];

    // 수정 시에는 자기 자신 제외
    if (existingRecordId) {
      query += ' AND id != ?';
      params.push(existingRecordId);
    }

    const duplicate = db.prepare(query).get(...params);
    if (duplicate) {
      throw new Error(`중복된 값이 존재합니다: ${field.name}`);
    }
  }

  return true;
}

// 레코드 추가 핸들러 수정
ipcMain.handle('db:addRecord', async (_, record) => {
  try {
    log('Adding record - Raw Input:', {
      id: record.id,
      categoryId: record.categoryId,
      data: record.data
    });
    
    // 입력 유효성 검사
    if (!record || typeof record !== 'object') {
      throw new Error('Record must be an object');
    }

    if (!record.id || !record.categoryId || !record.data) {
      throw new Error('Missing required fields');
    }

    // 중복 체크
    await checkDuplicateFields(record.categoryId, record.data);

    const stmt = db.prepare(`
      INSERT INTO records (id, categoryId, data, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const now = new Date().toISOString();
    const result = stmt.run(
      record.id,
      record.categoryId,
      JSON.stringify(record.data),
      now,
      now
    );

    log('Record added successfully:', { id: record.id });
    return record.id;
  } catch (error) {
    log('Error in addRecord:', error);
    throw error;
  }
});

// 레코드 수정 핸들러 수정
ipcMain.handle('db:updateRecord', async (_, id, data) => {
  try {
    // 레코드 정보 가져오기
    const record = db.prepare('SELECT categoryId FROM records WHERE id = ?').get(id);
    if (!record) {
      throw new Error('Record not found');
    }

    // 중복 체크 (자기 자신 제외)
    await checkDuplicateFields(record.categoryId, data, id);

    const stmt = db.prepare(`
      UPDATE records
      SET data = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(JSON.stringify(data), new Date().toISOString(), id);
    
    log('Record updated successfully:', { id });
  } catch (error) {
    log('Error in updateRecord:', error);
    throw error;
  }
});

ipcMain.handle('db:deleteRecord', (_, id) => {
  const stmt = db.prepare('DELETE FROM records WHERE id = ?');
  stmt.run(id);
});

// 설정 관련 IPC 핸들러
ipcMain.handle('getConfig', () => {
  const config = {
    dbPath: dbPath,
    backupDir: backupDir,
    backupInterval: 60 // 기본값: 60분
  };
  return config;
});

ipcMain.handle('setDbPath', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Database', extensions: ['db'] }]
  });
  if (filePaths && filePaths.length > 0) {
    return { success: true, path: filePaths[0] };
  }
  return { success: false };
});

ipcMain.handle('setBackupDir', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (filePaths && filePaths.length > 0) {
    return { success: true, path: filePaths[0] };
  }
  return { success: false };
});

ipcMain.handle('setBackupInterval', (event, minutes) => {
  // TODO: 백업 주기 설정 로직 구현
  return { success: true };
});

// 백업 관련 IPC 핸들러
ipcMain.handle('backupDatabase', () => {
  try {
    const backupDir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${timestamp}.db`);
    
    fs.copyFileSync(dbPath, backupPath);
    return { success: true, path: backupPath };
  } catch (error) {
    log('Backup failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('openBackupLocation', () => {
  const backupDir = path.join(app.getPath('userData'), 'backups');
  shell.openPath(backupDir);
  return { success: true };
}); 