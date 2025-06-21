const { app, BrowserWindow, ipcMain, protocol, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const fs = require('fs');
const crypto = require('crypto');
const { generateThumbnail } = require('../dist/lib/fileHandler');
const unzipper = require('unzipper');

// 로그 파일 설정
const logPath = path.join(app.getPath('userData'), 'app.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

// 데이터베이스 및 백업 경로 설정
const isDev = process.env.VITE_DEV_SERVER_URL;
const isPreview = process.env.ELECTRON === 'true' || process.env.npm_lifecycle_event === 'electron:preview';

// 개발 환경에서는 프로젝트 루트의 save 폴더 사용, 빌드된 앱에서는 Local 경로 사용 (용량 제한 없음)
const projectRoot = isDev ? path.resolve(__dirname, '..') : path.join(os.homedir(), 'AppData', 'Local');
const appDataDir = path.join(projectRoot, isDev ? 'save' : 'Local ERP');
const dbPath = path.join(appDataDir, 'erp.db');
const backupDir = path.join(path.join(os.homedir(), 'AppData', 'Local'), 'backups');

// save 폴더가 없으면 생성
if (!fs.existsSync(appDataDir)) {
  fs.mkdirSync(appDataDir, { recursive: true });
}

// 백업 폴더가 없으면 생성
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// 로깅 함수
function log(message, data = '') {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message} ${data ? JSON.stringify(data) : ''}\n`;
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

const iconPath = (isDev || isPreview)
  ? path.join(__dirname, '..', 'resources', 'icon.ico')
  : path.join(process.resourcesPath, 'resources', 'icon.ico');

// 썸네일 해시 생성 함수
function getThumbnailHash(filePath) {
  const normalizedPath = filePath.trim().replace(/\\/g, '/').toLowerCase();
  return crypto.createHash('sha1').update(normalizedPath).digest('hex');
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'dist', 'preload.js'),
      sandbox: false
    },
    icon: iconPath
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
const db = new Database(dbPath, { verbose: log });

// SQLite 설정
db.exec('PRAGMA encoding = "UTF-8"');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');

// 데이터베이스 테이블 생성
function initializeDatabase() {
  try {
    // 카테고리 테이블
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

    // 레코드 테이블
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
  } catch (error) {
    log('Error initializing database:', error);
    throw error;
  }
}

app.whenReady().then(() => {
  registerProtocol();
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

// 유틸리티 함수들
function generateUUID() {
  return crypto.randomUUID();
}

// 썸네일 파일 삭제 함수
const deleteThumbnail = (filePath) => {
  try {
    // appDataDir 사용
    const thumbnailDir = path.join(appDataDir, 'thumbnails');
    const hash = getThumbnailHash(filePath);
    const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
    
    if (fs.existsSync(thumbnailPath)) {
      fs.unlinkSync(thumbnailPath);
      return true;
    }
    return false;
  } catch (error) {
    log('썸네일 삭제 실패:', error);
    return false;
  }
};

// 카테고리의 모든 레코드에서 썸네일 정리
const cleanupThumbnailsForCategory = (categoryId) => {
  try {
    const records = db.prepare('SELECT data FROM records WHERE categoryId = ?').all(categoryId);
    let deletedCount = 0;
    
    records.forEach(record => {
      const data = JSON.parse(record.data);
      const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(categoryId);
      if (!category) return;
      
      const fields = JSON.parse(category.fields);
      const fileField = fields.find(f => f.type === 'file');
      
      if (fileField && data[fileField.id]) {
        const filePath = data[fileField.id];
        if (deleteThumbnail(filePath)) {
          deletedCount++;
        }
      }
    });
    
    return deletedCount;
  } catch (error) {
    log('썸네일 정리 중 오류:', error);
    return 0;
  }
};

// 관계형 데이터에서 참조 정리
const cleanupRelationReferences = (categoryId) => {
  try {
    const allCategories = db.prepare('SELECT id, fields FROM categories').all();
    let updatedCount = 0;
    
    allCategories.forEach(cat => {
      const fields = JSON.parse(cat.fields);
      const relationFields = fields.filter(f => f.type === 'relation' && f.relationCategoryId === categoryId);
      
      if (relationFields.length > 0) {
        const records = db.prepare('SELECT id, data FROM records WHERE categoryId = ?').all(cat.id);
        
        records.forEach(record => {
          const data = JSON.parse(record.data);
          let hasChanges = false;
          
          relationFields.forEach(field => {
            const value = data[field.id];
            
            if (field.multiple && Array.isArray(value)) {
              const filteredValue = value.filter(id => id !== categoryId);
              if (filteredValue.length !== value.length) {
                data[field.id] = filteredValue;
                hasChanges = true;
              }
            } else if (value === categoryId) {
              data[field.id] = null;
              hasChanges = true;
            }
          });
          
          if (hasChanges) {
            db.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), record.id);
            updatedCount++;
          }
        });
      }
    });
    
    return updatedCount;
  } catch (error) {
    log('관계형 참조 정리 중 오류:', error);
    return 0;
  }
};

// 중복 체크 함수
function checkDuplicateFields(categoryId, data, existingRecordId = null) {
  const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(categoryId);
  if (!category) {
    throw new Error(`Category not found: ${categoryId}`);
  }

  const fields = JSON.parse(category.fields);
  const uniqueFields = fields.filter(field => field.unique);

  if (uniqueFields.length === 0) {
    return true;
  }

  for (const field of uniqueFields) {
    const fieldValue = data[field.id];
    if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
      continue;
    }

    let query = `
      SELECT id FROM records 
      WHERE categoryId = ? 
      AND json_extract(data, '$.${field.id}') = ?
    `;
    let params = [categoryId, String(fieldValue)];

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

// IPC 핸들러들
ipcMain.handle('openExternal', async (_, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    log('Error opening external URL:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:getCategories', async () => {
  try {
    const categories = db.prepare('SELECT * FROM categories ORDER BY order_num').all();
    // fields를 배열로 변환
    return categories.map(cat => ({
      ...cat,
      fields: JSON.parse(cat.fields)
    }));
  } catch (error) {
    log('Error getting categories:', error);
    throw error;
  }
});

ipcMain.handle('getTables', () => {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
});

ipcMain.handle('getTableData', (event, tableName) => {
  const validTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  if (!validTables.some(t => t.name === tableName)) {
    throw new Error('Invalid table name');
  }
  const stmt = db.prepare(`SELECT * FROM ${tableName} LIMIT 1000`);
  const rows = stmt.all();
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { columns, rows, total: rows.length };
});

ipcMain.handle('db:getPath', () => dbPath);

ipcMain.handle('db:openFile', () => {
  shell.showItemInFolder(dbPath);
});

ipcMain.handle('shell:openExternal', async (_, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    log('Error opening URL:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:addCategory', async (_, category) => {
  const id = generateUUID();
  const now = new Date().toISOString();
  
  try {
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
    return id;
  } catch (error) {
    log('Error adding category:', error);
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
    updates.order_num,
    new Date().toISOString(),
    id
  );
});

ipcMain.handle('db:deleteCategory', async (_, id) => {
  const relationCleanupCount = cleanupRelationReferences(id);
  const childCategories = db.prepare('SELECT id FROM categories WHERE parentId = ?').all(id);
  let totalThumbnailCount = 0;
  
  childCategories.forEach(child => {
    totalThumbnailCount += cleanupThumbnailsForCategory(child.id);
  });
  
  totalThumbnailCount += cleanupThumbnailsForCategory(id);
  
  db.prepare('DELETE FROM categories WHERE parentId = ?').run(id);
  db.prepare('DELETE FROM records WHERE categoryId = ?').run(id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  
  return {
    success: true,
    thumbnailCleanupCount: totalThumbnailCount,
    relationCleanupCount: relationCleanupCount
  };
});

ipcMain.handle('db:getRecords', async (_, categoryId) => {
  try {
    if (!categoryId) throw new Error('Category ID is required');
    const records = db.prepare('SELECT * FROM records WHERE categoryId = ? ORDER BY createdAt DESC').all(categoryId);
    return records.map(record => ({
      ...record,
      data: JSON.parse(record.data)
    }));
  } catch (error) {
    log('Error getting records:', error);
    throw error;
  }
});

ipcMain.handle('addRecord', async (_, record) => {
  try {
    if (!record || typeof record !== 'object') {
      throw new Error('Record must be an object');
    }

    if (!record.categoryId || !record.data) {
      throw new Error('Missing required fields');
    }

    await checkDuplicateFields(record.categoryId, record.data);

    const recordId = record.id || crypto.randomUUID();

    const stmt = db.prepare(`
      INSERT INTO records (id, categoryId, data, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const now = new Date().toISOString();
    stmt.run(
      recordId,
      record.categoryId,
      JSON.stringify(record.data),
      record.createdAt || now,
      record.updatedAt || now
    );

    // 파일 필드가 있으면 썸네일 자동 생성
    try {
      const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(record.categoryId);
      if (category) {
        const fields = JSON.parse(category.fields);
        const fileField = fields.find(f => f.type === 'file');
        if (fileField && record.data[fileField.id]) {
          const filePath = record.data[fileField.id];
          log('레코드 생성 시 썸네일 생성 시작:', filePath);
          
          // 직접 썸네일 생성 로직 구현
          let normalizedPath = filePath;
          if (!path.isAbsolute(filePath)) {
            // appDataDir 사용
            normalizedPath = path.join(appDataDir, filePath);
          }
          
          if (fs.existsSync(normalizedPath)) {
            const sharp = require('sharp');
            const ffmpeg = require('fluent-ffmpeg');
            const AdmZip = require('adm-zip');
            const ffmpegStatic = require('ffmpeg-static');
            
            // ffmpeg 경로 설정 - 빌드된 버전에서는 app.asar.unpacked 내부 경로 사용
            let ffmpegPath = ffmpegStatic;
            
            // 빌드된 앱에서 ffmpeg 경로 찾기
            if (!isDev && !isPreview) {
              // 1. app.asar.unpacked 내부의 ffmpeg-static 경로 시도
              const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static');
              if (fs.existsSync(unpackedPath)) {
                const ffmpegBinPath = path.join(unpackedPath, 'ffmpeg.exe');
                if (fs.existsSync(ffmpegBinPath)) {
                  ffmpegPath = ffmpegBinPath;
                  log('빌드된 앱에서 ffmpeg 경로 찾음 (asarUnpack):', ffmpegPath);
                }
              }
              
              // 2. extraResources 경로 시도
              if (!fs.existsSync(ffmpegPath)) {
                const extraResourcePath = path.join(process.resourcesPath, 'ffmpeg-static');
                if (fs.existsSync(extraResourcePath)) {
                  const ffmpegBinPath = path.join(extraResourcePath, 'ffmpeg.exe');
                  if (fs.existsSync(ffmpegBinPath)) {
                    ffmpegPath = ffmpegBinPath;
                    log('빌드된 앱에서 ffmpeg 경로 찾음 (extraResources):', ffmpegPath);
                  }
                }
              }
            }
            
            if (ffmpegPath && fs.existsSync(ffmpegPath)) {
              ffmpeg.setFfmpegPath(ffmpegPath);
              log('ffmpeg 경로 설정됨:', ffmpegPath);
            } else {
              log('ffmpeg-static 경로를 찾을 수 없음:', ffmpegPath);
              // ffmpeg를 찾을 수 없는 경우 썸네일 생성 실패
              return null;
            }
            
            const ext = path.extname(normalizedPath).toLowerCase();
            const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
            const isVideo = ['.mp4', '.avi', '.mkv', '.mov'].includes(ext);
            const isArchive = ['.zip', '.7z'].includes(ext);
            
            if (isImage || isVideo || isArchive) {
              const thumbnailDir = path.join(appDataDir, 'thumbnails');
              if (!fs.existsSync(thumbnailDir)) {
                fs.mkdirSync(thumbnailDir, { recursive: true });
                log('썸네일 디렉토리 생성됨:', thumbnailDir);
              }
              
              const hash = getThumbnailHash(normalizedPath);
              const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
              
              log('썸네일 생성 시작:', { filePath: normalizedPath, thumbnailPath, fileType: isImage ? 'image' : isVideo ? 'video' : 'archive' });
              
              if (isImage) {
                await sharp(normalizedPath)
                  .resize(400, 400, { fit: 'contain' })
                  .toFile(thumbnailPath);
                log('이미지 썸네일 생성 완료:', thumbnailPath);
              } else if (isVideo) {
                await new Promise((resolve, reject) => {
                  ffmpeg(normalizedPath)
                    .screenshots({
                      timestamps: ['00:00:01'],
                      filename: path.basename(thumbnailPath),
                      folder: thumbnailDir,
                      size: '400x400'
                    })
                    .on('end', () => {
                      log('비디오 썸네일 생성 완료:', thumbnailPath);
                      resolve();
                    })
                    .on('error', (err) => {
                      log('비디오 썸네일 생성 실패:', err);
                      reject(err);
                    });
                });
              } else if (isArchive) {
                // 스트리밍 방식으로 첫 이미지 추출
                let found = false;
                await new Promise((resolve, reject) => {
                  fs.createReadStream(normalizedPath)
                    .pipe(unzipper.Parse())
                    .on('entry', async function (entry) {
                      const fileName = entry.path;
                      if (/\.(jpg|jpeg|png|gif|webp)$/i.test(fileName) && !found) {
                        found = true;
                        const chunks = [];
                        entry.on('data', chunk => chunks.push(chunk));
                        entry.on('end', async () => {
                          const buffer = Buffer.concat(chunks);
                          try {
                            await sharp(buffer)
                              .resize(400, 400, { fit: 'contain' })
                              .toFile(thumbnailPath);
                            log('아카이브 썸네일 생성 완료:', thumbnailPath);
                            resolve();
                          } catch (err) {
                            log('아카이브 썸네일 생성 실패:', err);
                            reject(err);
                          }
                        });
                      } else {
                        entry.autodrain();
                      }
                    })
                    .on('close', () => {
                      if (!found) {
                        log('아카이브에서 이미지를 찾을 수 없음');
                        resolve();
                      }
                    })
                    .on('error', (err) => {
                      log('아카이브 처리 실패:', err);
                      reject(err);
                    });
                });
                if (!found) return null;
              }
            }
          } else {
            log('레코드 생성 시 파일이 존재하지 않음:', normalizedPath);
          }
        }
      }
    } catch (thumbnailError) {
      log('Error generating thumbnail for new record:', thumbnailError);
    }

    return recordId;
  } catch (error) {
    log('Error in addRecord:', error);
    throw error;
  }
});

ipcMain.handle('updateRecord', async (_, id, data) => {
  try {
    const record = db.prepare('SELECT categoryId FROM records WHERE id = ?').get(id);
    if (!record) {
      throw new Error('Record not found');
    }

    await checkDuplicateFields(record.categoryId, data, id);

    const stmt = db.prepare(`
      UPDATE records
      SET data = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(JSON.stringify(data), new Date().toISOString(), id);
    
    // 파일 필드가 있으면 썸네일 자동 생성
    try {
      const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(record.categoryId);
      if (category) {
        const fields = JSON.parse(category.fields);
        const fileField = fields.find(f => f.type === 'file');
        if (fileField && data[fileField.id]) {
          const filePath = data[fileField.id];
          log('레코드 업데이트 시 썸네일 생성 시작:', filePath);
          
          // 직접 썸네일 생성 로직 구현
          let normalizedPath = filePath;
          if (!path.isAbsolute(filePath)) {
            // appDataDir 사용
            normalizedPath = path.join(appDataDir, filePath);
          }
          
          if (fs.existsSync(normalizedPath)) {
            const sharp = require('sharp');
            const ffmpeg = require('fluent-ffmpeg');
            const AdmZip = require('adm-zip');
            const ffmpegStatic = require('ffmpeg-static');
            
            // ffmpeg 경로 설정 - 빌드된 버전에서는 app.asar.unpacked 내부 경로 사용
            let ffmpegPath = ffmpegStatic;
            
            // 빌드된 앱에서 ffmpeg 경로 찾기
            if (!isDev && !isPreview) {
              // 1. app.asar.unpacked 내부의 ffmpeg-static 경로 시도
              const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static');
              if (fs.existsSync(unpackedPath)) {
                const ffmpegBinPath = path.join(unpackedPath, 'ffmpeg.exe');
                if (fs.existsSync(ffmpegBinPath)) {
                  ffmpegPath = ffmpegBinPath;
                  log('빌드된 앱에서 ffmpeg 경로 찾음 (asarUnpack):', ffmpegPath);
                }
              }
              
              // 2. extraResources 경로 시도
              if (!fs.existsSync(ffmpegPath)) {
                const extraResourcePath = path.join(process.resourcesPath, 'ffmpeg-static');
                if (fs.existsSync(extraResourcePath)) {
                  const ffmpegBinPath = path.join(extraResourcePath, 'ffmpeg.exe');
                  if (fs.existsSync(ffmpegBinPath)) {
                    ffmpegPath = ffmpegBinPath;
                    log('빌드된 앱에서 ffmpeg 경로 찾음 (extraResources):', ffmpegPath);
                  }
                }
              }
            }
            
            if (ffmpegPath && fs.existsSync(ffmpegPath)) {
              ffmpeg.setFfmpegPath(ffmpegPath);
              log('ffmpeg 경로 설정됨:', ffmpegPath);
            } else {
              log('ffmpeg-static 경로를 찾을 수 없음:', ffmpegPath);
              // ffmpeg를 찾을 수 없는 경우 썸네일 생성 실패
              return null;
            }
            
            const ext = path.extname(normalizedPath).toLowerCase();
            const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
            const isVideo = ['.mp4', '.avi', '.mkv', '.mov'].includes(ext);
            const isArchive = ['.zip', '.7z'].includes(ext);
            
            if (isImage || isVideo || isArchive) {
              const thumbnailDir = path.join(appDataDir, 'thumbnails');
              if (!fs.existsSync(thumbnailDir)) {
                fs.mkdirSync(thumbnailDir, { recursive: true });
              }
              
              const hash = getThumbnailHash(normalizedPath);
              const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
              
              log('썸네일 생성 시작:', { filePath: normalizedPath, thumbnailPath, fileType: isImage ? 'image' : isVideo ? 'video' : 'archive' });
              
              if (isImage) {
                await sharp(normalizedPath)
                  .resize(400, 400, { fit: 'contain' })
                  .toFile(thumbnailPath);
                log('이미지 썸네일 생성 완료:', thumbnailPath);
              } else if (isVideo) {
                await new Promise((resolve, reject) => {
                  ffmpeg(normalizedPath)
                    .screenshots({
                      timestamps: ['00:00:01'],
                      filename: path.basename(thumbnailPath),
                      folder: thumbnailDir,
                      size: '400x400'
                    })
                    .on('end', () => {
                      log('비디오 썸네일 생성 완료:', thumbnailPath);
                      resolve();
                    })
                    .on('error', (err) => {
                      log('비디오 썸네일 생성 실패:', err);
                      reject(err);
                    });
                });
              } else if (isArchive) {
                // 스트리밍 방식으로 첫 이미지 추출
                let found = false;
                await new Promise((resolve, reject) => {
                  fs.createReadStream(normalizedPath)
                    .pipe(unzipper.Parse())
                    .on('entry', async function (entry) {
                      const fileName = entry.path;
                      if (/\.(jpg|jpeg|png|gif|webp)$/i.test(fileName) && !found) {
                        found = true;
                        const chunks = [];
                        entry.on('data', chunk => chunks.push(chunk));
                        entry.on('end', async () => {
                          const buffer = Buffer.concat(chunks);
                          try {
                            await sharp(buffer)
                              .resize(400, 400, { fit: 'contain' })
                              .toFile(thumbnailPath);
                            log('아카이브 썸네일 생성 완료:', thumbnailPath);
                            resolve();
                          } catch (err) {
                            log('아카이브 썸네일 생성 실패:', err);
                            reject(err);
                          }
                        });
                      } else {
                        entry.autodrain();
                      }
                    })
                    .on('close', () => {
                      if (!found) {
                        log('아카이브에서 이미지를 찾을 수 없음');
                        resolve();
                      }
                    })
                    .on('error', (err) => {
                      log('아카이브 처리 실패:', err);
                      reject(err);
                    });
                });
                if (!found) return null;
              }
            }
          } else {
            log('레코드 업데이트 시 파일이 존재하지 않음:', normalizedPath);
          }
        }
      }
    } catch (thumbnailError) {
      log('Error generating thumbnail for updated record:', thumbnailError);
    }
  } catch (error) {
    log('Error in updateRecord:', error);
    throw error;
  }
});

ipcMain.handle('deleteRecord', async (_, id) => {
  try {
    const record = db.prepare('SELECT categoryId, data FROM records WHERE id = ?').get(id);
    if (!record) {
      throw new Error('Record not found');
    }
    
    let thumbnailDeleted = false;
    try {
      const data = JSON.parse(record.data);
      const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(record.categoryId);
      if (category) {
        const fields = JSON.parse(category.fields);
        const fileField = fields.find(f => f.type === 'file');
        
        if (fileField && data[fileField.id]) {
          thumbnailDeleted = deleteThumbnail(data[fileField.id]);
        }
      }
    } catch (error) {
      log('썸네일 정리 중 오류:', error);
    }
    
    db.prepare('DELETE FROM records WHERE id = ?').run(id);
    
    return { success: true, thumbnailDeleted };
  } catch (error) {
    log('Error in deleteRecord:', error);
    throw error;
  }
});

ipcMain.handle('getConfig', () => {
  return {
    dbPath: dbPath,
    backupDir: backupDir,
    backupInterval: 60
  };
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
  return { success: true };
});

ipcMain.handle('backupDatabase', () => {
  try {
    const backupDir = path.join(path.join(os.homedir(), 'AppData', 'Local'), 'backups');
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
  const backupDir = path.join(path.join(os.homedir(), 'AppData', 'Local'), 'backups');
  shell.openPath(backupDir);
  return { success: true };
});

ipcMain.handle('db:checkDuplicate', async (_, categoryId, fieldId, value, recordId = null) => {
  try {
    const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(categoryId);
    if (!category) {
      throw new Error(`Category not found: ${categoryId}`);
    }

    const fields = JSON.parse(category.fields);
    const field = fields.find(f => f.id === fieldId);
    
    if (!field || !field.unique) {
      return { isDuplicate: false };
    }

    if (value === undefined || value === null || value === '') {
      return { isDuplicate: false };
    }

    let query = `
      SELECT id FROM records 
      WHERE categoryId = ? 
      AND json_extract(data, '$.${fieldId}') = ?
    `;
    let params = [categoryId, String(value)];

    if (recordId) {
      query += ' AND id != ?';
      params.push(recordId);
    }

    const duplicate = db.prepare(query).get(...params);
    return { isDuplicate: !!duplicate };
  } catch (error) {
    log('Error in checkDuplicate:', error);
    throw error;
  }
});

ipcMain.handle('openFileDialog', async () => {
  return await dialog.showOpenDialog({
    properties: ['openFile'],
    title: '파일 선택'
  });
});

ipcMain.handle('openFile', async (_, filePath) => {
  if (!filePath) {
    return { success: false, error: '파일 경로 없음' };
  }
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
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
    let normalizedPath = filePath;
    
    if (!path.isAbsolute(filePath)) {
      // appDataDir 사용
      normalizedPath = path.join(appDataDir, filePath);
    }
    
    if (!fs.existsSync(normalizedPath)) {
      log('파일이 존재하지 않음:', normalizedPath);
      return null;
    }
    
    const sharp = require('sharp');
    const ffmpeg = require('fluent-ffmpeg');
    const AdmZip = require('adm-zip');
    const ffmpegStatic = require('ffmpeg-static');
    
    // ffmpeg 경로 설정 - 빌드된 버전에서는 app.asar.unpacked 내부 경로 사용
    let ffmpegPath = ffmpegStatic;
    
    // 빌드된 앱에서 ffmpeg 경로 찾기
    if (!isDev && !isPreview) {
      // 1. app.asar.unpacked 내부의 ffmpeg-static 경로 시도
      const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static');
      if (fs.existsSync(unpackedPath)) {
        const ffmpegBinPath = path.join(unpackedPath, 'ffmpeg.exe');
        if (fs.existsSync(ffmpegBinPath)) {
          ffmpegPath = ffmpegBinPath;
          log('빌드된 앱에서 ffmpeg 경로 찾음 (asarUnpack):', ffmpegPath);
        }
      }
      
      // 2. extraResources 경로 시도
      if (!fs.existsSync(ffmpegPath)) {
        const extraResourcePath = path.join(process.resourcesPath, 'ffmpeg-static');
        if (fs.existsSync(extraResourcePath)) {
          const ffmpegBinPath = path.join(extraResourcePath, 'ffmpeg.exe');
          if (fs.existsSync(ffmpegBinPath)) {
            ffmpegPath = ffmpegBinPath;
            log('빌드된 앱에서 ffmpeg 경로 찾음 (extraResources):', ffmpegPath);
          }
        }
      }
    }
    
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      ffmpeg.setFfmpegPath(ffmpegPath);
      log('ffmpeg 경로 설정됨:', ffmpegPath);
    } else {
      log('ffmpeg-static 경로를 찾을 수 없음:', ffmpegPath);
      // ffmpeg를 찾을 수 없는 경우 썸네일 생성 실패
      return null;
    }
    
    const ext = path.extname(normalizedPath).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    const isVideo = ['.mp4', '.avi', '.mkv', '.mov'].includes(ext);
    const isArchive = ['.zip', '.7z'].includes(ext);
    
    if (!isImage && !isVideo && !isArchive) {
      log('지원하지 않는 파일 형식:', ext);
      return null;
    }
    
    // appDataDir 사용
    const thumbnailDir = path.join(appDataDir, 'thumbnails');
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
      log('썸네일 디렉토리 생성됨:', thumbnailDir);
    }
    
    const hash = getThumbnailHash(normalizedPath);
    const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
    
    log('썸네일 생성 시작:', { filePath: normalizedPath, thumbnailPath, fileType: isImage ? 'image' : isVideo ? 'video' : 'archive' });
    
    if (isImage) {
      await sharp(normalizedPath)
        .resize(400, 400, { fit: 'contain' })
        .toFile(thumbnailPath);
      log('이미지 썸네일 생성 완료:', thumbnailPath);
    } else if (isVideo) {
      await new Promise((resolve, reject) => {
        ffmpeg(normalizedPath)
          .screenshots({
            timestamps: ['00:00:01'],
            filename: path.basename(thumbnailPath),
            folder: thumbnailDir,
            size: '400x400'
          })
          .on('end', () => {
            log('비디오 썸네일 생성 완료:', thumbnailPath);
            resolve();
          })
          .on('error', (err) => {
            log('비디오 썸네일 생성 실패:', err);
            reject(err);
          });
      });
    } else if (isArchive) {
      // 스트리밍 방식으로 첫 이미지 추출
      let found = false;
      await new Promise((resolve, reject) => {
        fs.createReadStream(normalizedPath)
          .pipe(unzipper.Parse())
          .on('entry', async function (entry) {
            const fileName = entry.path;
            if (/\.(jpg|jpeg|png|gif|webp)$/i.test(fileName) && !found) {
              found = true;
              const chunks = [];
              entry.on('data', chunk => chunks.push(chunk));
              entry.on('end', async () => {
                const buffer = Buffer.concat(chunks);
                try {
                  await sharp(buffer)
                    .resize(400, 400, { fit: 'contain' })
                    .toFile(thumbnailPath);
                  log('아카이브 썸네일 생성 완료:', thumbnailPath);
                  resolve();
                } catch (err) {
                  log('아카이브 썸네일 생성 실패:', err);
                  reject(err);
                }
              });
            } else {
              entry.autodrain();
            }
          })
          .on('close', () => {
            if (!found) {
              log('아카이브에서 이미지를 찾을 수 없음');
              resolve();
            }
          })
          .on('error', (err) => {
            log('아카이브 처리 실패:', err);
            reject(err);
          });
      });
      if (!found) return null;
    }
    
    return thumbnailPath;
  } catch (e) {
    log('Error generating thumbnail:', e);
    return null;
  }
});

ipcMain.handle('getThumbnailDataUrl', async (_, filePath) => {
  try {
    let normalizedPath = filePath;
    
    if (!path.isAbsolute(filePath)) {
      // appDataDir 사용
      normalizedPath = path.join(appDataDir, filePath);
    }
    
    // appDataDir 사용
    const thumbnailDir = path.join(appDataDir, 'thumbnails');
    const hash = getThumbnailHash(normalizedPath);
    const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
    
    if (!fs.existsSync(thumbnailPath)) {
      log('썸네일 파일이 존재하지 않음:', thumbnailPath);
      return null;
    }
    
    const buffer = fs.readFileSync(thumbnailPath);
    const base64 = buffer.toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (e) {
    log('Error getting thumbnail data URL:', e);
    return null;
  }
});

ipcMain.handle('openDbFile', () => {
  shell.showItemInFolder(dbPath);
});

ipcMain.handle('getAppRoot', () => {
  return app.getAppPath();
});

// db:getFileType 핸들러 추가
ipcMain.handle('db:getFileType', async (_, filePath) => {
  try {
    const { getFileType } = require('../dist/lib/fileHandler');
    return getFileType(filePath);
  } catch (e) {
    log('Error getting file type:', e);
    return 'other';
  }
});

// getFileDataUrl 핸들러
ipcMain.handle('getFileDataUrl', async (_, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = 'application/octet-stream';
    if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.webp') mimeType = 'image/webp';
    else if (['.mp4', '.avi', '.mkv', '.mov'].includes(ext)) mimeType = `video/${ext.slice(1)}`;
    return `data:${mimeType};base64,${data.toString('base64')}`;
  } catch (e) {
    log('Error in getFileDataUrl:', e);
    return null;
  }
});

// getArchiveFiles 핸들러
ipcMain.handle('getArchiveFiles', async (_, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return [];
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.7z') return [];
    
    // 대용량 파일을 위해 unzipper 스트리밍 방식 사용
    const entries = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(unzipper.Parse())
        .on('entry', function (entry) {
          entries.push({
            name: entry.path,
            size: entry.vars.uncompressedSize,
            isDirectory: entry.type === 'Directory',
            comment: ''
          });
          entry.autodrain();
        })
        .on('close', resolve)
        .on('error', reject);
    });
    
    return entries;
  } catch (e) {
    log('Error in getArchiveFiles:', e);
    return [];
  }
});

// getArchiveFileDataUrl 핸들러
ipcMain.handle('getArchiveFileDataUrl', async (_, filePath, fileName) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.7z') return null;
    
    // 대용량 파일을 위해 unzipper 스트리밍 방식 사용
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(unzipper.Parse())
        .on('entry', function (entry) {
          if (entry.path === fileName && entry.type === 'File') {
            const chunks = [];
            entry.on('data', chunk => chunks.push(chunk));
            entry.on('end', () => {
              try {
                const buffer = Buffer.concat(chunks);
                const fileExt = path.extname(fileName).toLowerCase();
                let mimeType = 'application/octet-stream';
                if (['.jpg', '.jpeg'].includes(fileExt)) mimeType = 'image/jpeg';
                else if (fileExt === '.png') mimeType = 'image/png';
                else if (fileExt === '.gif') mimeType = 'image/gif';
                else if (fileExt === '.webp') mimeType = 'image/webp';
                else if (fileExt === '.txt') mimeType = 'text/plain';
                else if (['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(fileExt)) mimeType = `video/${fileExt.slice(1)}`;
                resolve(`data:${mimeType};base64,${buffer.toString('base64')}`);
              } catch (err) {
                reject(err);
              }
            });
            entry.on('error', reject);
          } else {
            entry.autodrain();
          }
        })
        .on('close', () => resolve(null))
        .on('error', reject);
    });
  } catch (e) {
    log('Error in getArchiveFileDataUrl:', e);
    return null;
  }
});

// getArchiveFileText 핸들러
ipcMain.handle('getArchiveFileText', async (_, filePath, fileName) => {
  try {
    if (!fs.existsSync(filePath)) {
      log('[압축 파일 존재하지 않음]', filePath);
      return null;
    }
    
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.7z') {
      log('[7z 파일은 현재 지원되지 않습니다]', filePath);
      return null;
    }
    
    // 대용량 파일을 위해 unzipper 스트리밍 방식 사용
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(unzipper.Parse())
        .on('entry', function (entry) {
          if (entry.path === fileName && entry.type === 'File') {
            const fileExt = path.extname(fileName).toLowerCase();
            
            // 텍스트 파일만 처리
            if (fileExt === '.txt') {
              const chunks = [];
              entry.on('data', chunk => chunks.push(chunk));
              entry.on('end', () => {
                try {
                  const buffer = Buffer.concat(chunks);
                  const text = buffer.toString('utf8');
                  log('[압축 파일 텍스트 읽기]', fileName);
                  resolve(text);
                } catch (err) {
                  reject(err);
                }
              });
              entry.on('error', reject);
            } else {
              log('[텍스트 파일이 아님]', fileName);
              entry.autodrain();
              resolve(null);
            }
          } else {
            entry.autodrain();
          }
        })
        .on('close', () => resolve(null))
        .on('error', (err) => {
          log('[압축 파일 텍스트 읽기 에러]', err);
          reject(err);
        });
    });
  } catch (e) {
    log('[압축 파일 텍스트 읽기 에러]', e);
    return null;
  }
});