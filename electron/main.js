const { app, BrowserWindow, ipcMain, protocol, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const fs = require('fs');
const crypto = require('crypto');
const unzipper = require('unzipper');
const url = require('url');
const http = require('http');

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
  console.log(logMessage);
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
      preload: path.join(__dirname, 'preload.js'),
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
          "default-src 'self' 'unsafe-inline' data: localvideo: http://localhost:17345; " +
          "media-src 'self' data: localvideo: http://localhost:17345; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "img-src 'self' data: https:; " +
          "font-src 'self' data: https://fonts.gstatic.com; " +
          "connect-src 'self' ws: wss:;"
        ]
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

// 북마크 핸들러 등록 (직접 추가)
try {
  console.log('=== Registering bookmark handlers ===');
  
  ipcMain.handle('getBookmarks', async (_event, categoryId, recordId) => {
    console.log('=== getBookmarks called with:', categoryId, recordId);
    const record = db.prepare("SELECT data FROM records WHERE categoryId = ? AND id = ?").get(categoryId, recordId);
    if (!record) return { success: false, error: "Record not found" };
    const data = JSON.parse(record.data);
    return { success: true, bookmarks: data.bookmarks || [] };
  });

  ipcMain.handle('addBookmark', async (_event, categoryId, recordId, time) => {
    console.log('=== addBookmark called with:', categoryId, recordId, time);
    const record = db.prepare("SELECT data FROM records WHERE categoryId = ? AND id = ?").get(categoryId, recordId);
    if (!record) return { success: false, error: "Record not found" };
    const data = JSON.parse(record.data);
    if (!data.bookmarks) data.bookmarks = [];
    if (data.bookmarks.find((b) => Math.abs(b.time - time) < 1)) {
      return { success: false, error: "이미 해당 시간에 북마크가 있습니다." };
    }
    const newBookmark = { time, createdAt: new Date().toISOString() };
    data.bookmarks.push(newBookmark);
    data.bookmarks.sort((a, b) => a.time - b.time);
    db.prepare("UPDATE records SET data = ?, updatedAt = ? WHERE categoryId = ? AND id = ?")
      .run(JSON.stringify(data), new Date().toISOString(), categoryId, recordId);
    return { success: true, bookmark: newBookmark };
  });

  ipcMain.handle('removeBookmark', async (_event, categoryId, recordId, time) => {
    console.log('=== removeBookmark called with:', categoryId, recordId, time);
    const record = db.prepare("SELECT data FROM records WHERE categoryId = ? AND id = ?").get(categoryId, recordId);
    if (!record) return { success: false, error: "Record not found" };
    const data = JSON.parse(record.data);
    if (!data.bookmarks) return { success: false, error: "북마크가 없습니다." };
    const idx = data.bookmarks.findIndex((b) => Math.abs(b.time - time) < 1);
    if (idx === -1) return { success: false, error: "해당 시간의 북마크를 찾을 수 없습니다." };
    data.bookmarks.splice(idx, 1);
    db.prepare("UPDATE records SET data = ?, updatedAt = ? WHERE categoryId = ? AND id = ?")
      .run(JSON.stringify(data), new Date().toISOString(), categoryId, recordId);
    return { success: true };
  });

  ipcMain.handle('removeAllBookmarks', async (_event, categoryId, recordId) => {
    console.log('=== removeAllBookmarks called with:', categoryId, recordId);
    try {
      const record = db.prepare("SELECT data FROM records WHERE categoryId = ? AND id = ?").get(categoryId, recordId);
      if (!record) return { success: false, error: "Record not found" };
      
      const data = JSON.parse(record.data);
      if (data.bookmarks && data.bookmarks.length > 0) {
        data.bookmarks = [];
        db.prepare("UPDATE records SET data = ?, updatedAt = ? WHERE categoryId = ? AND id = ?")
          .run(JSON.stringify(data), new Date().toISOString(), categoryId, recordId);
        console.log('=== 북마크 삭제 완료 ===', { recordId, deletedCount: data.bookmarks.length });
      } else {
        console.log('=== 북마크가 없음 ===', { recordId });
      }
      return { success: true };
    } catch (error) {
      console.error('=== removeAllBookmarks 에러 ===', error);
      return { success: false, error: error.message };
    }
  });
  
  log('Bookmark handlers registered');
} catch (e) {
  log('Bookmark handler registration failed', e);
}

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
        duration INTEGER
      )
    `);

    // duration 필드가 없으면 추가 (마이그레이션)
    const columns = db.prepare("PRAGMA table_info(records)").all();
    if (!columns.some(col => col.name === 'duration')) {
      db.exec('ALTER TABLE records ADD COLUMN duration INTEGER');
    }
  } catch (error) {
    log('Error initializing database:', error);
    throw error;
  }
}

let videoServerPort = 17345;
globalThis.videoServerPort = videoServerPort;
function startVideoHttpServer() {
  const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url, `http://localhost:${videoServerPort}`);
    if (urlObj.pathname === '/video') {
      let filePath = decodeURIComponent(urlObj.searchParams.get('path') || '');
      let resolvedPath = filePath;
      if (!path.isAbsolute(filePath)) {
        resolvedPath = path.join(appDataDir, filePath);
      }
      const ext = path.extname(resolvedPath).toLowerCase();
      const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(ext);
      if (!isVideo || !fs.existsSync(resolvedPath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      // Range 헤더 지원
      const stat = fs.statSync(resolvedPath);
      const fileSize = stat.size;
      const range = req.headers.range;
      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.mov': 'video/quicktime',
        '.wmv': 'video/x-ms-wmv',
        '.flv': 'video/x-flv',
        '.m4v': 'video/x-m4v',
        '.3gp': 'video/3gpp',
        '.ts': 'video/mp2t'
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = (end - start) + 1;
        const file = fs.createReadStream(resolvedPath, { start, end });
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': mimeType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD',
          'Access-Control-Allow-Headers': 'Range'
        });
        file.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD',
          'Content-Type': mimeType
        });
        fs.createReadStream(resolvedPath).pipe(res);
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  server.listen(videoServerPort, () => {
    globalThis.videoServerPort = videoServerPort;
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      videoServerPort++;
      startVideoHttpServer();
    } else {
      throw err;
    }
  });
}

app.whenReady().then(() => {
  registerProtocol();
  initializeDatabase();
  createWindow();
  startVideoHttpServer();

  // 동영상 스트리밍용 커스텀 프로토콜 등록
  protocol.registerStreamProtocol('localvideo', (request, callback) => {
    try {
      const parsedUrl = new URL(request.url);
      const filePath = decodeURIComponent(parsedUrl.searchParams.get('path') || '');
      let resolvedPath = filePath;
      if (!path.isAbsolute(filePath)) {
        resolvedPath = path.join(appDataDir, filePath);
      }
      const ext = path.extname(resolvedPath).toLowerCase();
      const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(ext);

      if (!isVideo || !fs.existsSync(resolvedPath)) {
        callback({ statusCode: 404 });
        return;
      }
      // 확장자별 MIME 타입 매핑
      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.mov': 'video/quicktime',
        '.wmv': 'video/x-ms-wmv',
        '.flv': 'video/x-flv',
        '.m4v': 'video/x-m4v',
        '.3gp': 'video/3gpp',
        '.ts': 'video/mp2t'
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      callback({
        statusCode: 200,
        headers: { 'Content-Type': mimeType },
        data: fs.createReadStream(resolvedPath)
      });
    } catch (e) {
      callback({ statusCode: 500 });
    }
  });

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

// 썸네일 생성 함수
async function generateThumbnail(filePath) {
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
    const ffprobeStatic = require('ffprobe-static');
    
    // ffmpeg/ffprobe 경로를 여러 후보에서 찾기
    const ffmpegCandidates = [
      path.join(process.resourcesPath, 'ffmpeg-static', 'ffmpeg.exe'),
      path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
      path.join(__dirname, '..', 'node_modules', '.bin', 'ffmpeg.exe')
    ];
    const ffprobeCandidates = [
      getUnpackedFfprobePath(),
      path.join(__dirname, '..', 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'),
      path.join(__dirname, '..', 'node_modules', '.bin', 'ffprobe.exe')
    ];
    const ffmpegPath = ffmpegCandidates.find(fs.existsSync);
    const ffprobePath = ffprobeCandidates.find(fs.existsSync);
    console.log('ffmpegPath:', ffmpegPath);
    console.log('ffprobePath:', ffprobePath);
    if (!ffmpegPath || !ffprobePath) {
      log('ffmpeg/ffprobe 경로를 찾을 수 없음', { ffmpegPath, ffprobePath });
      return null;
    }
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
    
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
}

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

ipcMain.handle('db:getTables', () => {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
});

ipcMain.handle('db:getTableData', (event, tableName) => {
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

async function handleUpdateRecord(_, id, data) {
  try {
    log('=== handleUpdateRecord 시작 ===', { id, dataKeys: Object.keys(data) });
    
    const record = db.prepare('SELECT categoryId, duration FROM records WHERE id = ?').get(id);
    if (!record) {
      throw new Error('Record not found');
    }

    await checkDuplicateFields(record.categoryId, data, id);

    // 기존 duration 값 유지
    let duration = record.duration;
    
    // duration이 없거나 파일 경로가 변경된 경우에만 새로 계산
    const fileField = Object.values(data).find(v => typeof v === 'string' && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(v));
    if (fileField && (!duration || duration === null)) {
      try {
        const ffmpeg = require('fluent-ffmpeg');
        const ffmpegStatic = require('ffmpeg-static');
        const ffprobeStatic = require('ffprobe-static');
        const path = require('path');
        const fs = require('fs');
        // ffmpeg/ffprobe 경로를 여러 후보에서 찾기
        const ffmpegCandidates = [
          path.join(process.resourcesPath, 'ffmpeg-static', 'ffmpeg.exe'),
          path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
          path.join(__dirname, '..', 'node_modules', '.bin', 'ffmpeg.exe')
        ];
        const ffprobeCandidates = [
          getUnpackedFfprobePath(),
          path.join(__dirname, '..', 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'),
          path.join(__dirname, '..', 'node_modules', '.bin', 'ffprobe.exe')
        ];
        const ffmpegPath = ffmpegCandidates.find(fs.existsSync);
        const ffprobePath = ffprobeCandidates.find(fs.existsSync);
        log('[addRecord] 동영상 duration 계산 시도', { fileField, ffmpegPath, ffprobePath });
        if (!ffmpegPath || !ffprobePath) {
          log('[addRecord] ffmpeg/ffprobe 경로를 찾을 수 없음, duration=null', { ffmpegPath, ffprobePath });
          duration = null;
        } else {
          ffmpeg.setFfmpegPath(ffmpegPath);
          ffmpeg.setFfprobePath(ffprobePath);
          duration = await new Promise((resolve) => {
            ffmpeg.ffprobe(fileField, (err, metadata) => {
              if (err) {
                log('[addRecord] ffprobe 에러', { fileField, err: err.message, stack: err.stack });
                return resolve(null);
              }
              if (!metadata || !metadata.format || !metadata.format.duration) {
                log('[addRecord] ffprobe 결과에 duration 없음', { fileField, metadata });
                return resolve(null);
              }
              resolve(Math.floor(metadata.format.duration));
            });
          });
        }
      } catch (e) {
        log('[addRecord] duration 계산 중 예외', { fileField, error: e.message, stack: e.stack });
        duration = null;
      }
    }

    // 파일 경로 변경 감지를 위해 업데이트 전에 이전 데이터 조회
    let prevFilePath = null;
    try {
      log('=== 파일 경로 변경 감지 시작 ===');
      const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(record.categoryId);
      if (category) {
        const fields = JSON.parse(category.fields);
        log('=== 카테고리 필드 ===', { fields: fields.map(f => ({ id: f.id, type: f.type, name: f.name })) });
        
        const fileField = fields.find(f => f.type === 'file');
        if (fileField) {
          log('=== 파일 필드 발견 ===', { fileFieldId: fileField.id, fileFieldName: fileField.name });
          
          // 업데이트 전에 이전 파일 경로 조회
          const prevRecord = db.prepare('SELECT data FROM records WHERE id = ?').get(id);
          if (prevRecord) {
            const prevData = JSON.parse(prevRecord.data);
            prevFilePath = prevData[fileField.id] || null;
            log('=== 이전 파일 경로 조회 완료 ===', { prevFilePath });
          } else {
            log('=== 이전 레코드 데이터 없음 ===');
          }
        } else {
          log('=== 파일 필드 없음 ===');
        }
      } else {
        log('=== 카테고리 없음 ===');
      }
    } catch (error) {
      log('이전 파일 경로 조회 중 오류:', error);
    }

    log('=== DB 업데이트 시작 ===');
    const stmt = db.prepare(`
      UPDATE records
      SET data = ?, updatedAt = ?, duration = ?
      WHERE id = ?
    `);
    
    stmt.run(
      JSON.stringify(data),
      new Date().toISOString(),
      duration,
      id
    );
    log('=== DB 업데이트 완료 ===');
    
    // 파일 필드가 있으면 썸네일 자동 생성 (파일 경로가 변경된 경우에만)
    try {
      log('=== 썸네일 생성 로직 시작 ===');
      const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(record.categoryId);
      if (category) {
        const fields = JSON.parse(category.fields);
        const fileField = fields.find(f => f.type === 'file');
        if (fileField && data[fileField.id]) {
          const newFilePath = data[fileField.id];
          log('=== 새 파일 경로 ===', { newFilePath });
          log('=== 파일 경로 변경 여부 ===', { 
            prevFilePath, 
            newFilePath, 
            isChanged: newFilePath !== prevFilePath,
            prevType: typeof prevFilePath,
            newType: typeof newFilePath
          });
          
          if (newFilePath !== prevFilePath) {
            log('=== 썸네일 생성 시작 (파일 경로 변경됨) ===', { newFilePath });
            
            // 파일 경로가 변경되었으므로 기존 북마크 삭제
            try {
              const recordData = db.prepare('SELECT data FROM records WHERE id = ?').get(id);
              if (recordData) {
                const data = JSON.parse(recordData.data);
                if (data.bookmarks && data.bookmarks.length > 0) {
                  data.bookmarks = [];
                  db.prepare("UPDATE records SET data = ?, updatedAt = ? WHERE id = ?")
                    .run(JSON.stringify(data), new Date().toISOString(), id);
                  log('=== 파일 변경으로 인해 북마크 삭제 완료 ===', { recordId: id, deletedCount: data.bookmarks.length });
                } else {
                  log('=== 파일 변경됨, 북마크 없음 ===', { recordId: id });
                }
              }
            } catch (error) {
              log('북마크 삭제 중 오류:', error);
              // 북마크 삭제 실패는 레코드 업데이트를 막지 않음
            }
            
            // 썸네일 생성
            const thumbnailResult = await generateThumbnail(newFilePath);
            if (thumbnailResult) {
              log('=== 썸네일 생성 완료 ===', { thumbnailResult });
              
              // 프론트엔드에 썸네일 재생성 이벤트 전송
              try {
                const { BrowserWindow } = require('electron');
                const windows = BrowserWindow.getAllWindows();
                log('=== 이벤트 전송 시작 ===', { windowCount: windows.length });
                windows.forEach((window) => {
                  if (!window.isDestroyed()) {
                    window.webContents.send('thumbnail:regenerated', { filePath: newFilePath });
                    log('=== 이벤트 전송됨 ===', { filePath: newFilePath });
                  }
                });
              } catch (error) {
                log('썸네일 재생성 이벤트 전송 중 오류:', error);
              }
            } else {
              log('=== 썸네일 생성 실패 ===');
            }
          } else {
            log('=== 파일 경로 동일, 썸네일 재생성 생략 ===');
          }
        } else {
          log('=== 파일 필드가 없거나 파일 경로가 비어있음 ===', { 
            hasFileField: !!fileField, 
            fileFieldId: fileField?.id,
            hasFilePath: fileField ? !!data[fileField.id] : false,
            filePath: fileField ? data[fileField.id] : null
          });
        }
      } else {
        log('=== 카테고리를 찾을 수 없음 ===');
      }
    } catch (error) {
      log('썸네일 생성 중 오류:', error);
      // 썸네일 생성 실패는 레코드 업데이트를 막지 않음
    }
    
    log('=== handleUpdateRecord 완료 ===');
    return { success: true };
  } catch (error) {
    log('Error in updateRecord:', error);
    throw error;
  }
}
ipcMain.handle('updateRecord', handleUpdateRecord);
ipcMain.handle('db:updateRecord', handleUpdateRecord);

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
    const records = db.prepare('SELECT id, categoryId, data, createdAt, updatedAt, duration FROM records WHERE categoryId = ? ORDER BY createdAt DESC').all(categoryId);
    return records.map(record => ({
      ...record,
      data: JSON.parse(record.data)
    }));
  } catch (error) {
    log('Error getting records:', error);
    throw error;
  }
});

ipcMain.handle('db:addRecord', async (_, record) => {
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
      INSERT INTO records (id, categoryId, data, createdAt, updatedAt, duration)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    // duration 계산
    let duration = null;
    const fileField = Object.values(record.data).find(v => typeof v === 'string' && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(v));
    if (fileField) {
      try {
        const ffmpeg = require('fluent-ffmpeg');
        const ffmpegStatic = require('ffmpeg-static');
        const ffprobeStatic = require('ffprobe-static');
        const path = require('path');
        const fs = require('fs');
        // ffmpeg/ffprobe 경로를 여러 후보에서 찾기
        const ffmpegCandidates = [
          path.join(process.resourcesPath, 'ffmpeg-static', 'ffmpeg.exe'),
          path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
          path.join(__dirname, '..', 'node_modules', '.bin', 'ffmpeg.exe')
        ];
        const ffprobeCandidates = [
          getUnpackedFfprobePath(),
          path.join(__dirname, '..', 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'),
          path.join(__dirname, '..', 'node_modules', '.bin', 'ffprobe.exe')
        ];
        const ffmpegPath = ffmpegCandidates.find(fs.existsSync);
        const ffprobePath = ffprobeCandidates.find(fs.existsSync);
        log('[addRecord] 동영상 duration 계산 시도', { fileField, ffmpegPath, ffprobePath });
        if (!ffmpegPath || !ffprobePath) {
          log('[addRecord] ffmpeg/ffprobe 경로를 찾을 수 없음, duration=null', { ffmpegPath, ffprobePath });
          duration = null;
        } else {
          ffmpeg.setFfmpegPath(ffmpegPath);
          ffmpeg.setFfprobePath(ffprobePath);
          duration = await new Promise((resolve) => {
            ffmpeg.ffprobe(fileField, (err, metadata) => {
              if (err) {
                log('[addRecord] ffprobe 에러', { fileField, err: err.message, stack: err.stack });
                return resolve(null);
              }
              if (!metadata || !metadata.format || !metadata.format.duration) {
                log('[addRecord] ffprobe 결과에 duration 없음', { fileField, metadata });
                return resolve(null);
              }
              resolve(Math.floor(metadata.format.duration));
            });
          });
        }
      } catch (e) {
        log('[addRecord] duration 계산 중 예외', { fileField, error: e.message, stack: e.stack });
        duration = null;
      }
    }
    try {
      stmt.run(
        recordId,
        record.categoryId,
        JSON.stringify(record.data),
        record.createdAt || now,
        record.updatedAt || now,
        duration
      );
    } catch (e) {
      log('[addRecord] DB insert 예외', { recordId, error: e.message, stack: e.stack });
      throw e;
    }
    // 파일 필드가 있으면 썸네일 자동 생성
    try {
      const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(record.categoryId);
      if (category) {
        const fields = JSON.parse(category.fields);
        const fileFieldObj = fields.find(f => f.type === 'file');
        if (fileFieldObj && record.data[fileFieldObj.id]) {
          const filePath = record.data[fileFieldObj.id];
          log('[addRecord] 썸네일 생성 시작', { filePath });
          try {
            const thumbnailResult = await generateThumbnail(filePath);
            if (thumbnailResult) {
              log('[addRecord] 썸네일 생성 완료', { thumbnailResult });
            } else {
              log('[addRecord] 썸네일 생성 실패(결과 null)', { filePath });
            }
          } catch (thumbErr) {
            log('[addRecord] 썸네일 생성 중 예외', { filePath, error: thumbErr.message, stack: thumbErr.stack });
          }
        }
      }
    } catch (error) {
      log('썸네일 생성 블록 예외', { error: error.message, stack: error.stack });
    }
    return recordId;
  } catch (error) {
    log('[addRecord] 최상위 예외', { error: error.message, stack: error.stack });
    throw error;
  }
});

ipcMain.handle('db:deleteRecord', async (_, id) => {
  try {
    const record = db.prepare('SELECT categoryId, data FROM records WHERE id = ?').get(id);
    if (!record) {
      throw new Error('Record not found');
    }
    
    // 썸네일 삭제
    try {
      const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(record.categoryId);
      if (category) {
        const fields = JSON.parse(category.fields);
        const fileField = fields.find(f => f.type === 'file');
        if (fileField) {
          const data = JSON.parse(record.data);
          if (data[fileField.id]) {
            const filePath = data[fileField.id];
            log('레코드 삭제 시 썸네일 삭제 시작:', filePath);
            
            const thumbnailDeleted = deleteThumbnail(filePath);
            if (thumbnailDeleted) {
              log('썸네일 삭제 완료:', filePath);
            }
          }
        }
      }
    } catch (error) {
      log('썸네일 삭제 중 오류:', error);
      // 썸네일 삭제 실패는 레코드 삭제를 막지 않음
    }
    
    db.prepare('DELETE FROM records WHERE id = ?').run(id);
    return { success: true };
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
    
    const ext = path.extname(filePath).toLowerCase();
    const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(ext);
    
    // 동영상 파일이고 크기가 50MB 이상인 경우 스트리밍 방식 사용
    if (isVideo) {
      const stats = fs.statSync(filePath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      
      if (fileSizeInMB > 50) {
        log('대용량 동영상 파일 감지, 스트리밍 방식 사용:', { filePath, sizeMB: fileSizeInMB });
        return 'stream'; // 스트리밍 방식 사용을 나타내는 특별한 값
      }
    }
    
    // 일반 파일 처리
    const data = fs.readFileSync(filePath);
    let mimeType = 'application/octet-stream';
    if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.webp') mimeType = 'image/webp';
    else if (isVideo) {
      const videoMimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.mov': 'video/quicktime',
        '.wmv': 'video/x-ms-wmv',
        '.flv': 'video/x-flv',
        '.m4v': 'video/x-m4v',
        '.3gp': 'video/3gpp',
        '.ts': 'video/mp2t'
      };
      mimeType = videoMimeTypes[ext] || 'video/mp4';
    }
    return `data:${mimeType};base64,${data.toString('base64')}`;
  } catch (e) {
    log('Error in getFileDataUrl:', e);
    return null;
  }
});

// getVideoBlobUrl 핸들러 (대용량 동영상 Blob 방식)
ipcMain.handle('getVideoBlobUrl', async (_, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const ext = path.extname(filePath).toLowerCase();
    const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(ext);
    if (!isVideo) return null;
    const stats = fs.statSync(filePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    // 50MB 이상만 Blob 방식으로 처리
    if (fileSizeInMB > 50) {
      const data = fs.readFileSync(filePath);
      // base64 인코딩
      return {
        base64: data.toString('base64'),
        mimeType: `video/${ext.slice(1)}`
      };
    }
    return null;
  } catch (e) {
    log('Error in getVideoBlobUrl:', e);
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
                else if (['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(fileExt)) {
                  const videoMimeTypes = {
                    '.mp4': 'video/mp4',
                    '.webm': 'video/webm',
                    '.ogg': 'video/ogg',
                    '.avi': 'video/x-msvideo',
                    '.mkv': 'video/x-matroska',
                    '.mov': 'video/quicktime',
                    '.wmv': 'video/x-ms-wmv',
                    '.flv': 'video/x-flv',
                    '.m4v': 'video/x-m4v',
                    '.3gp': 'video/3gpp',
                    '.ts': 'video/mp2t'
                  };
                  mimeType = videoMimeTypes[fileExt] || 'video/mp4';
                }
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

ipcMain.handle('db:updateCategory', (event, id, updates) => {
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
  return { success: true };
});

ipcMain.handle('getVideoServerPort', () => {
  return globalThis.videoServerPort;
});

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

// 썸네일 삭제 IPC 핸들러 등록
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

ipcMain.handle('generateThumbnailWithTime', async (_, filePath, timestampSec) => {
  try {
    const sharp = require('sharp');
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegStatic = require('ffmpeg-static');
    const path = require('path');
    const fs = require('fs');
    let normalizedPath = filePath;
    if (!path.isAbsolute(filePath)) {
      normalizedPath = path.join(appDataDir, filePath);
    }
    if (!fs.existsSync(normalizedPath)) {
      return null;
    }
    
    // ffmpeg/ffprobe 경로를 여러 후보에서 찾기
    const ffmpegCandidates = [
      path.join(process.resourcesPath, 'ffmpeg-static', 'ffmpeg.exe'),
      path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
      path.join(__dirname, '..', 'node_modules', '.bin', 'ffmpeg.exe')
    ];
    const ffprobeCandidates = [
      getUnpackedFfprobePath(),
      path.join(__dirname, '..', 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'),
      path.join(__dirname, '..', 'node_modules', '.bin', 'ffprobe.exe')
    ];
    const ffmpegPath = ffmpegCandidates.find(fs.existsSync);
    const ffprobePath = ffprobeCandidates.find(fs.existsSync);
    console.log('ffmpegPath:', ffmpegPath);
    console.log('ffprobePath:', ffprobePath);
    if (!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
      log('ffmpeg/ffprobe 경로를 찾을 수 없음', { ffmpegPath, ffprobePath });
      return null;
    }
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
    
    const ext = path.extname(normalizedPath).toLowerCase();
    const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(ext);
    if (!isVideo) return null;
    const thumbnailDir = path.join(appDataDir, 'thumbnails');
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }
    const hash = getThumbnailHash(normalizedPath);
    const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
    // duration 구하기
    const duration = await new Promise((resolve) => {
      ffmpeg.ffprobe(normalizedPath, (err, metadata) => {
        if (err || !metadata || !metadata.format || !metadata.format.duration) return resolve(null);
        resolve(Math.floor(metadata.format.duration));
      });
    });
    let ts = Number(timestampSec);
    if (duration && ts > duration) {
      ts = duration - 1;
      if (ts < 0) ts = 0;
    }
    await new Promise((resolve, reject) => {
      ffmpeg(normalizedPath)
        .screenshots({
          timestamps: [ts],
          filename: path.basename(thumbnailPath),
          folder: thumbnailDir,
          size: '400x400'
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    });
    return thumbnailPath;
  } catch (e) {
    return null;
  }
});

// 이미지/압축파일용 썸네일 재생성 함수
ipcMain.handle('regenerateThumbnail', async (_, filePath) => {
  try {
    const sharp = require('sharp');
    const AdmZip = require('adm-zip');
    const path = require('path');
    const fs = require('fs');
    
    let normalizedPath = filePath;
    if (!path.isAbsolute(filePath)) {
      normalizedPath = path.join(appDataDir, filePath);
    }
    
    if (!fs.existsSync(normalizedPath)) {
      log('파일이 존재하지 않음:', normalizedPath);
      return null;
    }
    
    const ext = path.extname(normalizedPath).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    const isArchive = ['.zip', '.7z'].includes(ext);
    
    if (!isImage && !isArchive) {
      log('지원하지 않는 파일 형식:', ext);
      return null;
    }
    
    const thumbnailDir = path.join(appDataDir, 'thumbnails');
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }
    
    const hash = getThumbnailHash(normalizedPath);
    const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
    
    log('썸네일 재생성 시작:', { filePath: normalizedPath, thumbnailPath, fileType: isImage ? 'image' : 'archive' });
    
    if (isImage) {
      // 이미지 썸네일 재생성
      await sharp(normalizedPath)
        .resize(400, 400, { fit: 'contain' })
        .toFile(thumbnailPath);
      log('이미지 썸네일 재생성 완료:', thumbnailPath);
    } else if (isArchive) {
      // 압축파일 썸네일 재생성
      const zip = new AdmZip(normalizedPath);
      const zipEntries = zip.getEntries();
      const imageEntry = zipEntries.find(entry => 
        /\.(jpg|jpeg|png|gif|webp)$/i.test(entry.entryName) && !entry.isDirectory
      );
      
      if (imageEntry) {
        const buffer = zip.readFile(imageEntry);
        if (buffer) {
          await sharp(buffer)
            .resize(400, 400, { fit: 'contain' })
            .toFile(thumbnailPath);
          log('압축파일 썸네일 재생성 완료:', thumbnailPath);
        } else {
          log('압축파일 내 이미지 버퍼 읽기 실패');
          return null;
        }
      } else {
        log('압축파일 내 이미지 파일을 찾을 수 없음');
        return null;
      }
    }
    
    return thumbnailPath;
  } catch (e) {
    log('썸네일 재생성 에러:', e);
    return null;
  }
});

ipcMain.handle('getVideoDuration', async (_, filePath) => {
  try {
    console.log('getVideoDuration 호출됨:', filePath);
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegStatic = require('ffmpeg-static');
    const ffprobeStatic = require('ffprobe-static');
    const path = require('path');
    const fs = require('fs');
    let normalizedPath = filePath;
    if (!path.isAbsolute(filePath)) {
      normalizedPath = path.join(appDataDir, filePath);
    }
    console.log('정규화된 경로:', normalizedPath);
    if (!fs.existsSync(normalizedPath)) {
      console.log('파일이 존재하지 않음:', normalizedPath);
      return null;
    }
    console.log('파일 존재 확인됨');
    
    // ffmpeg/ffprobe 경로를 resources 폴더의 경로로만 강제 지정
    const ffmpegPath = path.join(process.resourcesPath, 'ffmpeg-static', 'ffmpeg.exe');
    const ffprobePath = getUnpackedFfprobePath();
    console.log('ffmpegPath:', ffmpegPath);
    console.log('ffprobePath:', ffprobePath);
    if (!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
      log('ffmpeg/ffprobe 경로를 찾을 수 없음', { ffmpegPath, ffprobePath });
      return null;
    }
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
    
    return await new Promise((resolve, reject) => {
      console.log('ffprobe 실행 시작');
      ffmpeg.ffprobe(normalizedPath, (err, metadata) => {
        if (err) {
          console.error('ffprobe 에러:', err);
          return resolve(null);
        }
        console.log('ffprobe 메타데이터:', metadata);
        if (metadata && metadata.format && metadata.format.duration) {
          const duration = Math.floor(metadata.format.duration);
          console.log('동영상 duration:', duration);
          resolve(duration);
        } else {
          console.log('duration 정보 없음');
          resolve(null);
        }
      });
    });
  } catch (e) {
    console.error('getVideoDuration 전체 에러:', e);
    return null;
  }
});

ipcMain.handle('generateThumbnail', async (_, filePath) => {
  return await generateThumbnail(filePath);
});

ipcMain.handle('getVideoCodecInfo', async (_, filePath) => {
  try {
    const ffmpeg = require('fluent-ffmpeg');
    const ffprobeStatic = require('ffprobe-static');
    ffmpeg.setFfprobePath(ffprobeStatic.path);
    return await new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return resolve({ error: err.message });
        if (!metadata || !metadata.streams) return resolve({ error: 'No metadata' });
        const video = metadata.streams.find(s => s.codec_type === 'video');
        const audio = metadata.streams.find(s => s.codec_type === 'audio');
        resolve({
          video: video ? { codec: video.codec_name, profile: video.profile, pix_fmt: video.pix_fmt } : null,
          audio: audio ? { codec: audio.codec_name, sample_rate: audio.sample_rate, channels: audio.channels } : null,
        });
      });
    });
  } catch (e) {
    return { error: e.message };
  }
});

const getUnpackedFfprobePath = () => {
  const base = path.join(process.resourcesPath, 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe');
  // asar 환경이면 unpacked 경로로 보정
  if (base.includes('app.asar')) {
    return base.replace('app.asar', 'app.asar.unpacked');
  }
  return base;
};