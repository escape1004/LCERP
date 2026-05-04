const { app, BrowserWindow, ipcMain, protocol, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const fs = require('fs');
const crypto = require('crypto');
const unzipper = require('unzipper');
const url = require('url');
const http = require('http');
const { execSync } = require('child_process');
const XLSX = require('xlsx');
const AdmZip = require('adm-zip');

// 콘솔 출력 인코딩을 UTF-8로 고정 (Windows 환경 한글 깨짐 방지)
if (process.stdout && typeof process.stdout.setDefaultEncoding === 'function') {
  process.stdout.setDefaultEncoding('utf8');
}
if (process.stderr && typeof process.stderr.setDefaultEncoding === 'function') {
  process.stderr.setDefaultEncoding('utf8');
}
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
    process.env.LANG = 'ko_KR.UTF-8';
  } catch (e) {
    // 콘솔 코드페이지 변경 실패 시 무시
  }
}

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
const configPath = path.join(app.getPath('userData'), 'config.json');

const defaultConfig = {
  rememberWindowBounds: false,
  windowBounds: null,
  passwordHash: null,
  videoSeekSeconds: 5,
  videoAutoPlay: true,
  listThumbnailFit: 'cover',
  zoomPercent: 100,
  thumbnailPreviewScale: 100,
  dateParseFormats: null
};

let appConfig = { ...defaultConfig };
let currentProfileId = null;
const DEFAULT_PROFILE_COLOR = '#5865F2';

// save 폴더가 없으면 생성
if (!fs.existsSync(appDataDir)) {
  fs.mkdirSync(appDataDir, { recursive: true });
}

// 백업 폴더가 없으면 생성
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

function loadAppConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      appConfig = { ...defaultConfig, ...savedConfig };
    }
  } catch (error) {
    console.error('Failed to load app config:', error);
  }
}

function saveAppConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save app config:', error);
  }
}

function normalizeZoomPercent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.min(200, Math.max(50, Math.round(numericValue)));
}

function getConfiguredZoomPercent() {
  return normalizeZoomPercent(appConfig.zoomPercent) ?? 100;
}

function normalizeThumbnailPreviewScale(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.min(200, Math.max(75, Math.round(numericValue)));
}

function getConfiguredThumbnailPreviewScale() {
  return normalizeThumbnailPreviewScale(appConfig.thumbnailPreviewScale) ?? 100;
}

function normalizeDateParseFormats(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const seen = new Set();
  return value
    .map((item) => String(item || '').trim())
    .filter((item) => {
      if (!item || item.length > 80 || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 50);
}

function applyWindowZoom(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return;

  const zoomFactor = getConfiguredZoomPercent() / 100;
  targetWindow.webContents.setZoomLevel(0);
  targetWindow.webContents.setZoomFactor(zoomFactor);
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function getCurrentProfileIdOrThrow() {
  if (!currentProfileId) {
    throw new Error('Profile is not selected.');
  }

  return currentProfileId;
}

function getProfileById(profileId) {
  return db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId) || null;
}

function ensureCurrentProfileExists() {
  if (!currentProfileId) return null;

  const profile = getProfileById(currentProfileId);
  if (!profile) {
    currentProfileId = null;
    return null;
  }

  return profile;
}

function getScopedCategory(categoryId, profileId = getCurrentProfileIdOrThrow()) {
  return db.prepare('SELECT * FROM categories WHERE id = ? AND profileId = ?').get(categoryId, profileId) || null;
}

function getScopedRecord(recordId, profileId = getCurrentProfileIdOrThrow()) {
  return db.prepare('SELECT * FROM records WHERE id = ? AND profileId = ?').get(recordId, profileId) || null;
}

function ensureCategoryBelongsToCurrentProfile(categoryId) {
  const category = getScopedCategory(categoryId);
  if (!category) {
    throw new Error('Category not found in current profile.');
  }

  return category;
}

function getCategorySubtreeIds(rootCategoryId, profileId) {
  const categories = db.prepare('SELECT id, parentId FROM categories WHERE profileId = ?').all(profileId);
  const childrenByParentId = new Map();

  categories.forEach(category => {
    const key = category.parentId || '__root__';
    if (!childrenByParentId.has(key)) {
      childrenByParentId.set(key, []);
    }
    childrenByParentId.get(key).push(category.id);
  });

  const subtreeIds = [];
  const stack = [rootCategoryId];

  while (stack.length > 0) {
    const categoryId = stack.pop();
    subtreeIds.push(categoryId);

    const childIds = childrenByParentId.get(categoryId) || [];
    childIds.forEach(childId => stack.push(childId));
  }

  return subtreeIds;
}

function getSqlPlaceholders(count) {
  return Array.from({ length: count }, () => '?').join(', ');
}

function ensureRecordBelongsToCurrentProfile(recordId) {
  const record = getScopedRecord(recordId);
  if (!record) {
    throw new Error('Record not found in current profile.');
  }

  return record;
}

function createProfile(name, avatarColor = DEFAULT_PROFILE_COLOR) {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) {
    throw new Error('Profile name is required.');
  }

  const now = new Date().toISOString();
  const profile = {
    id: crypto.randomUUID(),
    name: normalizedName,
    avatarColor: avatarColor || DEFAULT_PROFILE_COLOR,
    createdAt: now,
    updatedAt: now
  };

  db.prepare(`
    INSERT INTO profiles (id, name, avatarColor, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(profile.id, profile.name, profile.avatarColor, profile.createdAt, profile.updatedAt);

  return profile;
}

function ensureDefaultProfile() {
  const existingProfile = db.prepare('SELECT * FROM profiles ORDER BY createdAt ASC LIMIT 1').get();
  if (existingProfile) {
    return existingProfile;
  }

  return createProfile('기본 프로필', DEFAULT_PROFILE_COLOR);
}

loadAppConfig();

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
  const rememberedBounds = appConfig.rememberWindowBounds ? appConfig.windowBounds : null;
  const mainWindow = new BrowserWindow({
    width: rememberedBounds?.width || 1920,
    height: rememberedBounds?.height || 1080,
    x: typeof rememberedBounds?.x === 'number' ? rememberedBounds.x : undefined,
    y: typeof rememberedBounds?.y === 'number' ? rememberedBounds.y : undefined,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    icon: iconPath
  });

  let saveBoundsTimer = null;
  const saveWindowBounds = () => {
    if (!appConfig.rememberWindowBounds) return;
    if (mainWindow.isDestroyed() || mainWindow.isMinimized() || mainWindow.isMaximized() || mainWindow.isFullScreen()) return;
    appConfig.windowBounds = mainWindow.getBounds();
    saveAppConfig();
  };

  const queueSaveWindowBounds = () => {
    if (saveBoundsTimer) {
      clearTimeout(saveBoundsTimer);
    }
    saveBoundsTimer = setTimeout(() => {
      saveWindowBounds();
      saveBoundsTimer = null;
    }, 150);
  };

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

  applyWindowZoom(mainWindow);
  mainWindow.webContents.on('did-finish-load', () => applyWindowZoom(mainWindow));
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isZoomShortcut =
      input.control &&
      !input.alt &&
      !input.meta &&
      ['+', '=', '-', '_', '0'].includes(input.key);

    const isNumpadZoomShortcut =
      input.control &&
      !input.alt &&
      !input.meta &&
      ['numadd', 'numsub', 'num0'].includes((input.code || '').toLowerCase());

    if (isZoomShortcut || isNumpadZoomShortcut) {
      event.preventDefault();
    }
  });

  // 창 상태 변경 이벤트 처리
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-change', { maximized: true });
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-change', { maximized: false });
    queueSaveWindowBounds();
  });

  mainWindow.on('move', queueSaveWindowBounds);
  mainWindow.on('resize', queueSaveWindowBounds);
  mainWindow.on('close', saveWindowBounds);

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

  ipcMain.removeHandler?.('setRememberWindowBounds');
  ipcMain.handle('setRememberWindowBounds', (_event, enabled) => {
    appConfig.rememberWindowBounds = !!enabled;
    if (appConfig.rememberWindowBounds) {
      saveWindowBounds();
    } else {
      saveAppConfig();
    }
    return { success: true };
  });
}

// 데이터베이스 연결 설정
const db = new Database(dbPath, { verbose: log });

// 북마크 핸들러 등록 (직접 추가)
try {
  ipcMain.handle('getBookmarks', async (_event, categoryId, recordId) => {
    const profileId = getCurrentProfileIdOrThrow();
    ensureCategoryBelongsToCurrentProfile(categoryId);
    const record = db.prepare("SELECT data FROM records WHERE categoryId = ? AND id = ? AND profileId = ?").get(categoryId, recordId, profileId);
    if (!record) return { success: false, error: "Record not found" };
    const data = JSON.parse(record.data);
    return { success: true, bookmarks: data.bookmarks || [] };
  });

  ipcMain.handle('addBookmark', async (_event, categoryId, recordId, time) => {
    const profileId = getCurrentProfileIdOrThrow();
    ensureCategoryBelongsToCurrentProfile(categoryId);
    const record = db.prepare("SELECT data FROM records WHERE categoryId = ? AND id = ? AND profileId = ?").get(categoryId, recordId, profileId);
    if (!record) return { success: false, error: "Record not found" };
    const data = JSON.parse(record.data);
    if (!data.bookmarks) data.bookmarks = [];
    if (data.bookmarks.find((b) => Math.abs(b.time - time) < 1)) {
      return { success: false, error: "이미 해당 시간에 북마크가 있습니다." };
    }
    const newBookmark = { time, createdAt: new Date().toISOString() };
    data.bookmarks.push(newBookmark);
    data.bookmarks.sort((a, b) => a.time - b.time);
    db.prepare("UPDATE records SET data = ?, updatedAt = ? WHERE categoryId = ? AND id = ? AND profileId = ?")
      .run(JSON.stringify(data), new Date().toISOString(), categoryId, recordId, profileId);
    return { success: true, bookmark: newBookmark };
  });

  ipcMain.handle('removeBookmark', async (_event, categoryId, recordId, time) => {
    const profileId = getCurrentProfileIdOrThrow();
    ensureCategoryBelongsToCurrentProfile(categoryId);
    const record = db.prepare("SELECT data FROM records WHERE categoryId = ? AND id = ? AND profileId = ?").get(categoryId, recordId, profileId);
    if (!record) return { success: false, error: "Record not found" };
    const data = JSON.parse(record.data);
    if (!data.bookmarks) return { success: false, error: "북마크가 없습니다." };
    const idx = data.bookmarks.findIndex((b) => Math.abs(b.time - time) < 1);
    if (idx === -1) return { success: false, error: "해당 시간의 북마크를 찾을 수 없습니다." };
    data.bookmarks.splice(idx, 1);
    db.prepare("UPDATE records SET data = ?, updatedAt = ? WHERE categoryId = ? AND id = ? AND profileId = ?")
      .run(JSON.stringify(data), new Date().toISOString(), categoryId, recordId, profileId);
    return { success: true };
  });

  ipcMain.handle('removeAllBookmarks', async (_event, categoryId, recordId) => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      ensureCategoryBelongsToCurrentProfile(categoryId);
      const record = db.prepare("SELECT data FROM records WHERE categoryId = ? AND id = ? AND profileId = ?").get(categoryId, recordId, profileId);
      if (!record) return { success: false, error: "Record not found" };
      
      const data = JSON.parse(record.data);
      if (data.bookmarks && data.bookmarks.length > 0) {
        data.bookmarks = [];
        db.prepare("UPDATE records SET data = ?, updatedAt = ? WHERE categoryId = ? AND id = ? AND profileId = ?")
          .run(JSON.stringify(data), new Date().toISOString(), categoryId, recordId, profileId);
      }
      return { success: true };
    } catch (error) {
      console.error('Failed to remove all bookmarks:', error);
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
    db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE,
        avatarColor TEXT,
        createdAt TEXT,
        updatedAt TEXT
      )
    `);

    // 카테고리 테이블
    db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        profileId TEXT,
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
        profileId TEXT,
        categoryId TEXT NOT NULL,
        data TEXT NOT NULL,
        createdAt TEXT,
        updatedAt TEXT,
        duration INTEGER,
        thumbnailTimestamp REAL
      )
    `);

    // duration 필드가 없으면 추가 (마이그레이션)
    const categoryColumns = db.prepare("PRAGMA table_info(categories)").all();
    if (!categoryColumns.some(col => col.name === 'profileId')) {
      db.exec('ALTER TABLE categories ADD COLUMN profileId TEXT');
    }

    const columns = db.prepare("PRAGMA table_info(records)").all();
    if (!columns.some(col => col.name === 'duration')) {
      db.exec('ALTER TABLE records ADD COLUMN duration INTEGER');
    }
    
    // thumbnailPath 필드가 없으면 추가 (새로운 마이그레이션)
    if (!columns.some(col => col.name === 'thumbnailPath')) {
      db.exec('ALTER TABLE records ADD COLUMN thumbnailPath TEXT');
    }

    if (!columns.some(col => col.name === 'thumbnailTimestamp')) {
      db.exec('ALTER TABLE records ADD COLUMN thumbnailTimestamp REAL');
    }

    if (!columns.some(col => col.name === 'profileId')) {
      db.exec('ALTER TABLE records ADD COLUMN profileId TEXT');
    }

    const defaultProfile = ensureDefaultProfile();
    db.prepare('UPDATE categories SET profileId = ? WHERE profileId IS NULL OR profileId = ?').run(defaultProfile.id, '');
    db.prepare('UPDATE records SET profileId = ? WHERE profileId IS NULL OR profileId = ?').run(defaultProfile.id, '');
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
    } else if (urlObj.pathname === '/archive-video') {
      // 압축파일 내 동영상 스트리밍 (대용량 대응: 전체 버퍼링 없이 스트림으로 전달)
      const archivePath = decodeURIComponent(urlObj.searchParams.get('archive') || '');
      const fileName = decodeURIComponent(urlObj.searchParams.get('file') || '');
      
      if (!archivePath || !fileName) {
        res.writeHead(400);
        res.end('Missing parameters');
        return;
      }
      
      let resolvedArchivePath = archivePath;
      if (!path.isAbsolute(archivePath)) {
        resolvedArchivePath = path.join(appDataDir, archivePath);
      }
      
      if (!fs.existsSync(resolvedArchivePath)) {
        res.writeHead(404);
        res.end('Archive not found');
        return;
      }
      
      const fileExt = path.extname(fileName).toLowerCase();
      const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(fileExt);
      
      if (!isVideo) {
        res.writeHead(400);
        res.end('Not a video file');
        return;
      }
      
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
      const mimeType = mimeTypes[fileExt] || 'application/octet-stream';
      
      const unzipper = require('unzipper');
      let responded = false;
      
      fs.createReadStream(resolvedArchivePath)
        .pipe(unzipper.Parse())
        .on('entry', (entry) => {
          if (responded) {
            entry.autodrain();
            return;
          }
          
          if (entry.path === fileName && entry.type === 'File') {
            responded = true;
            res.writeHead(200, {
              'Content-Type': mimeType,
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, HEAD'
            });
            
            entry.on('error', () => {
              if (!res.headersSent) {
                res.writeHead(500);
              }
              res.end('Error reading file from archive');
            });
            
            entry.pipe(res);
          } else {
            entry.autodrain();
          }
        })
        .on('close', () => {
          if (!responded && !res.headersSent) {
            res.writeHead(404);
            res.end('File not found in archive');
          }
        })
        .on('error', () => {
          if (!res.headersSent) {
            res.writeHead(500);
            res.end('Error reading archive');
          }
        });
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

function sanitizeThumbnailPathSegment(value, fallback = 'unknown') {
  const sanitized = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .slice(0, 80);

  return sanitized || fallback;
}

function getThumbnailRootDir() {
  return path.join(appDataDir, 'thumbnails');
}

function getLegacyThumbnailPath(filePath) {
  const hash = getThumbnailHash(filePath);
  return path.join(getThumbnailRootDir(), `thumb_${hash}.jpg`);
}

function getThumbnailCategorySegments(categoryId, profileId) {
  if (!categoryId || !profileId) {
    return ['uncategorized'];
  }

  const categories = db.prepare('SELECT id, name, parentId FROM categories WHERE profileId = ?').all(profileId);
  const categoriesById = new Map(categories.map(category => [category.id, category]));
  const segments = [];
  const seen = new Set();
  let current = categoriesById.get(categoryId);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    segments.unshift(sanitizeThumbnailPathSegment(current.name, current.id));
    current = current.parentId ? categoriesById.get(current.parentId) : null;
  }

  return segments.length > 0 ? segments : ['uncategorized'];
}

function resolveThumbnailContext(context = {}) {
  let recordId = context?.recordId || null;
  let categoryId = context?.categoryId || null;
  let profileId = context?.profileId || currentProfileId || null;

  if (recordId) {
    const record = profileId
      ? db.prepare('SELECT id, categoryId, profileId FROM records WHERE id = ? AND profileId = ?').get(recordId, profileId)
      : db.prepare('SELECT id, categoryId, profileId FROM records WHERE id = ?').get(recordId);

    if (record) {
      categoryId = record.categoryId || categoryId;
      profileId = record.profileId || profileId;
    }
  }

  return { recordId, categoryId, profileId };
}

function getStructuredThumbnailDir(context = {}) {
  const { categoryId, profileId } = resolveThumbnailContext(context);
  const profile = profileId ? getProfileById(profileId) : null;
  const profileSegment = sanitizeThumbnailPathSegment(profile?.name || profileId, 'profile');
  const categorySegments = getThumbnailCategorySegments(categoryId, profileId);

  return path.join(getThumbnailRootDir(), profileSegment, ...categorySegments);
}

function getThumbnailPathForContext(filePath, context = {}) {
  const thumbnailDir = getStructuredThumbnailDir(context);
  const hash = getThumbnailHash(filePath);
  return {
    thumbnailDir,
    thumbnailPath: path.join(thumbnailDir, `thumb_${hash}.jpg`)
  };
}

function ensureThumbnailDirForContext(filePath, context = {}) {
  const target = getThumbnailPathForContext(filePath, context);
  if (!fs.existsSync(target.thumbnailDir)) {
    fs.mkdirSync(target.thumbnailDir, { recursive: true });
    log('thumbnail directory created:', target.thumbnailDir);
  }

  return target;
}

function getThumbnailContextForRecordLike(record) {
  if (!record) {
    return resolveThumbnailContext({});
  }

  return resolveThumbnailContext({
    recordId: record.id,
    categoryId: record.categoryId,
    profileId: record.profileId || currentProfileId || null
  });
}

function copyLegacyThumbnailToStructuredPath(filePath, context = {}) {
  try {
    const legacyPath = getLegacyThumbnailPath(filePath);
    const { thumbnailPath } = ensureThumbnailDirForContext(filePath, context);

    if (legacyPath === thumbnailPath || !fs.existsSync(legacyPath)) {
      return null;
    }

    if (!fs.existsSync(thumbnailPath)) {
      fs.copyFileSync(legacyPath, thumbnailPath);
    }

    if (fs.existsSync(thumbnailPath) && fs.existsSync(legacyPath)) {
      fs.unlinkSync(legacyPath);
    }

    return thumbnailPath;
  } catch (error) {
    log('legacy thumbnail migration failed:', error);
    return null;
  }
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function removeEmptyThumbnailDirsUpward(startDir) {
  if (!startDir) return;

  const thumbnailRoot = getThumbnailRootDir();
  let currentDir = startDir;

  while (currentDir) {
    const relative = path.relative(thumbnailRoot, currentDir);
    const isInsideRoot = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    if (!isInsideRoot) {
      break;
    }

    if (!fs.existsSync(currentDir) || !fs.statSync(currentDir).isDirectory()) {
      currentDir = path.dirname(currentDir);
      continue;
    }

    if (fs.readdirSync(currentDir).length > 0) {
      break;
    }

    fs.rmdirSync(currentDir);
    if (currentDir === thumbnailRoot) {
      break;
    }

    currentDir = path.dirname(currentDir);
  }
}

function relocateThumbnailFile(sourcePath, targetPath) {
  if (!sourcePath || !targetPath || sourcePath === targetPath || !fs.existsSync(sourcePath)) {
    return false;
  }

  ensureDirectoryExists(path.dirname(targetPath));

  if (!fs.existsSync(targetPath)) {
    try {
      fs.renameSync(sourcePath, targetPath);
    } catch (_error) {
      fs.copyFileSync(sourcePath, targetPath);
      fs.unlinkSync(sourcePath);
    }
  } else if (fs.existsSync(sourcePath)) {
    fs.unlinkSync(sourcePath);
  }

  removeEmptyThumbnailDirsUpward(path.dirname(sourcePath));
  return true;
}

function collectThumbnailMigrationEntries(categoryIds, profileId) {
  if (!categoryIds?.length || !profileId) {
    return [];
  }

  const categories = db.prepare(`SELECT id, fields FROM categories WHERE profileId = ? AND id IN (${getSqlPlaceholders(categoryIds.length)})`).all(profileId, ...categoryIds);
  const fileFieldByCategoryId = new Map();

  categories.forEach(category => {
    const fields = JSON.parse(category.fields);
    const fileField = fields.find(field => field.type === 'file');
    if (fileField) {
      fileFieldByCategoryId.set(category.id, fileField.id);
    }
  });

  if (fileFieldByCategoryId.size === 0) {
    return [];
  }

  const records = db.prepare(`SELECT id, categoryId, profileId, data, thumbnailPath FROM records WHERE profileId = ? AND categoryId IN (${getSqlPlaceholders(categoryIds.length)})`).all(profileId, ...categoryIds);

  return records.flatMap(record => {
    const fileFieldId = fileFieldByCategoryId.get(record.categoryId);
    if (!fileFieldId) {
      return [];
    }

    const data = JSON.parse(record.data);
    const filePath = data[fileFieldId];
    if (!filePath || typeof filePath !== 'string' || filePath === '-') {
      return [];
    }

    return [{
      recordId: record.id,
      categoryId: record.categoryId,
      profileId: record.profileId || profileId,
      filePath,
      thumbnailPath: record.thumbnailPath || null
    }];
  });
}

function getStructuredThumbnailDirsForCategoryIds(categoryIds, profileId) {
  return [...new Set(
    (categoryIds || []).map(categoryId => getStructuredThumbnailDir({ categoryId, profileId }))
  )];
}

function migrateStructuredThumbnailEntries(entries) {
  let migratedCount = 0;
  let updatedCount = 0;

  entries.forEach(entry => {
    try {
      const normalizedPath = path.isAbsolute(entry.filePath) ? entry.filePath : path.join(appDataDir, entry.filePath);
      const { thumbnailPath: expectedPath } = getThumbnailPathForContext(normalizedPath, {
        recordId: entry.recordId,
        categoryId: entry.categoryId,
        profileId: entry.profileId
      });

      const candidatePaths = [
        entry.thumbnailPath,
        getLegacyThumbnailPath(normalizedPath)
      ].filter(Boolean);

      for (const candidatePath of [...new Set(candidatePaths)]) {
        if (candidatePath && candidatePath !== expectedPath && fs.existsSync(candidatePath)) {
          if (relocateThumbnailFile(candidatePath, expectedPath)) {
            migratedCount++;
          }
          break;
        }
      }

      if (fs.existsSync(expectedPath)) {
        db.prepare('UPDATE records SET thumbnailPath = ? WHERE id = ?').run(expectedPath, entry.recordId);
        updatedCount++;
      }
    } catch (error) {
      log('thumbnail entry migration failed:', {
        recordId: entry.recordId,
        categoryId: entry.categoryId,
        message: error.message
      });
    }
  });

  return { migratedCount, updatedCount };
}

// 썸네일 파일 삭제 함수
const deleteThumbnail = (filePath, context = {}) => {
  try {
    const normalizedPath = path.isAbsolute(filePath) ? filePath : path.join(appDataDir, filePath);
    const candidatePaths = [
      context?.thumbnailPath,
      getThumbnailPathForContext(normalizedPath, context).thumbnailPath,
      getLegacyThumbnailPath(normalizedPath)
    ].filter(Boolean);

    let deleted = false;
    for (const thumbnailPath of [...new Set(candidatePaths)]) {
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
        removeEmptyThumbnailDirsUpward(path.dirname(thumbnailPath));
        deleted = true;
      }
    }
    return deleted;
  } catch (error) {
    log('썸네일 삭제 실패:', error);
    return false;
  }
};

// 썸네일 생성 함수
function getAutoThumbnailTimestamp(duration) {
  if (!Number.isFinite(duration)) {
    return 1;
  }
  if (duration <= 1) {
    return 0;
  }
  return duration / 2;
}

function getThumbnailTimestampForFile(filePath, duration) {
  if (typeof filePath !== 'string' || !/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(filePath)) {
    return null;
  }
  return getAutoThumbnailTimestamp(duration);
}

async function generateThumbnail(filePath, context = {}) {
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
    
    const { thumbnailDir, thumbnailPath } = ensureThumbnailDirForContext(normalizedPath, context);
    
    log('썸네일 생성 시작:', { filePath: normalizedPath, thumbnailPath, fileType: isImage ? 'image' : isVideo ? 'video' : 'archive' });
    
    if (isImage) {
      await sharp(normalizedPath)
        .resize(400, 400, { fit: 'inside' })
        .toFile(thumbnailPath);
      log('이미지 썸네일 생성 완료:', thumbnailPath);
    } else if (isVideo) {
      const duration = await new Promise((resolve) => {
        ffmpeg.ffprobe(normalizedPath, (err, metadata) => {
          if (err || !metadata?.format?.duration) return resolve(null);
          resolve(Number(metadata.format.duration));
        });
      });
      const embeddedCoverPath = await extractEmbeddedVideoCover(normalizedPath, thumbnailPath);
      if (embeddedCoverPath) {
        log('비디오 메타데이터 커버 썸네일 생성 완료:', embeddedCoverPath);
        return embeddedCoverPath;
      }
      await new Promise((resolve, reject) => {
        ffmpeg(normalizedPath)
          .screenshots({
            timestamps: [getAutoThumbnailTimestamp(duration)],
            filename: path.basename(thumbnailPath),
            folder: thumbnailDir,
            size: '400x?'
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
                    .resize(400, 400, { fit: 'inside' })
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
    const category = db.prepare('SELECT fields, profileId FROM categories WHERE id = ?').get(categoryId);
    if (!category) return 0;

    const records = db.prepare('SELECT id, data, thumbnailPath FROM records WHERE categoryId = ? AND profileId = ?').all(categoryId, category.profileId);
    let deletedCount = 0;
    
    records.forEach(record => {
      const data = JSON.parse(record.data);
      const fields = JSON.parse(category.fields);
      const fileField = fields.find(f => f.type === 'file');
      
      if (fileField && data[fileField.id]) {
        const filePath = data[fileField.id];
        if (deleteThumbnail(filePath, { recordId: record.id, categoryId, profileId: category.profileId, thumbnailPath: record.thumbnailPath })) {
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
    const targetCategory = db.prepare('SELECT profileId FROM categories WHERE id = ?').get(categoryId);
    if (!targetCategory) return 0;

    const allCategories = db.prepare('SELECT id, fields FROM categories WHERE profileId = ?').all(targetCategory.profileId);
    let updatedCount = 0;
    
    allCategories.forEach(cat => {
      const fields = JSON.parse(cat.fields);
      const relationFields = fields.filter(f => f.type === 'relation' && f.relationCategoryId === categoryId);
      
      if (relationFields.length > 0) {
        const records = db.prepare('SELECT id, data FROM records WHERE categoryId = ? AND profileId = ?').all(cat.id, targetCategory.profileId);
        
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
function checkDuplicateFields(categoryId, data, existingRecordId = null, profileId = getCurrentProfileIdOrThrow()) {
  const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(categoryId, profileId);
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
      AND profileId = ?
      AND json_extract(data, '$.${field.id}') = ?
    `;
    let params = [categoryId, profileId, String(fieldValue)];

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

const IMPORT_EXPORT_BATCH_SIZE = 1000;

function sanitizeFileName(name) {
  return String(name || 'category').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim() || 'category';
}

function getCategoryOrThrow(categoryId, profileId = getCurrentProfileIdOrThrow()) {
  const category = db.prepare('SELECT * FROM categories WHERE id = ? AND profileId = ?').get(categoryId, profileId);
  if (!category) {
    throw new Error(`Category not found: ${categoryId}`);
  }
  return {
    ...category,
    fields: JSON.parse(category.fields)
  };
}

function getCategoryRecordsForProfile(categoryId, profileId = getCurrentProfileIdOrThrow()) {
  return db.prepare(`
    SELECT id, categoryId, data, createdAt, updatedAt, duration, thumbnailPath, thumbnailTimestamp
    FROM records
    WHERE categoryId = ? AND profileId = ?
    ORDER BY createdAt DESC
  `).all(categoryId, profileId).map((record) => ({
    ...record,
    data: JSON.parse(record.data)
  }));
}

function getRelationKeyField(relatedCategory, relationField) {
  if (!relatedCategory || !Array.isArray(relatedCategory.fields)) return null;

  const displayField = relationField?.displayFieldId
    ? relatedCategory.fields.find((field) => field.id === relationField.displayFieldId)
    : null;

  if (displayField?.unique) {
    return displayField;
  }

  const uniqueField = relatedCategory.fields.find((field) => field.unique);
  if (uniqueField) {
    return uniqueField;
  }

  if (displayField) {
    return displayField;
  }

  return relatedCategory.fields.find((field) => field.type !== 'file' && field.type !== 'relation')
    || relatedCategory.fields[0]
    || null;
}

function buildRelationResolvers(fields, profileId = getCurrentProfileIdOrThrow()) {
  const resolvers = new Map();

  fields
    .filter((field) => field.type === 'relation' && field.relationCategoryId)
    .forEach((field) => {
      const relatedCategory = getCategoryOrThrow(field.relationCategoryId, profileId);
      const relatedRecords = getCategoryRecordsForProfile(field.relationCategoryId, profileId);
      const keyField = getRelationKeyField(relatedCategory, field);
      const displayField = field.displayFieldId
        ? relatedCategory.fields.find((candidate) => candidate.id === field.displayFieldId)
        : relatedCategory.fields[0] || null;

      const lookup = new Map();

      relatedRecords.forEach((record) => {
        const candidates = [];
        if (keyField) {
          candidates.push(record.data[keyField.id]);
        }
        if (displayField && (!keyField || displayField.id !== keyField.id)) {
          candidates.push(record.data[displayField.id]);
        }
        candidates.push(record.id);

        candidates.forEach((candidate) => {
          if (candidate === undefined || candidate === null || candidate === '') return;
          const normalized = String(candidate).trim().toLowerCase();
          if (!normalized) return;
          if (!lookup.has(normalized)) {
            lookup.set(normalized, []);
          }
          lookup.get(normalized).push(record.id);
        });
      });

      resolvers.set(field.id, {
        field,
        relatedCategory,
        relatedRecords,
        keyField,
        displayField,
        lookup
      });
    });

  return resolvers;
}

function getRelationExportValue(field, value, relationResolvers) {
  const resolver = relationResolvers.get(field.id);
  if (!resolver) {
    return field.multiple ? JSON.stringify(Array.isArray(value) ? value : []) : String(value ?? '');
  }

  const toKeyValue = (recordId) => {
    const relatedRecord = resolver.relatedRecords.find((record) => record.id === recordId);
    if (!relatedRecord) {
      return String(recordId ?? '');
    }

    const keyField = resolver.keyField || resolver.displayField;
    if (!keyField) {
      return relatedRecord.id;
    }

    const keyValue = relatedRecord.data[keyField.id];
    return keyValue === undefined || keyValue === null ? '' : String(keyValue);
  };

  if (field.multiple) {
    const relationValues = Array.isArray(value) ? value.map(toKeyValue).filter(Boolean) : [];
    return JSON.stringify(relationValues);
  }

  return toKeyValue(value);
}

function getExcelHeaderLabel(field) {
  return `${field.name}${field.type === 'relation' ? '*' : ''}`;
}

function getExcelColumnWidth(field, header, values) {
  const maxLength = values.reduce((max, value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return Math.max(max, text.length);
  }, String(header || '').length);

  const minWidthByType = {
    checkbox: 12,
    date: 14,
    number: 12,
    relation: 18,
    file: 24
  };
  const minWidth = minWidthByType[field?.type] || 12;
  return Math.min(Math.max(maxLength + 4, minWidth), 48);
}

function buildDiscordStyleSheetXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><color rgb="FFDCDDDE"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="12"/><color rgb="FFF2F3F5"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFB5BAC1"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF5865F2"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF313338"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2B2D31"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FF1E1F22"/></left>
      <right style="thin"><color rgb="FF1E1F22"/></right>
      <top style="thin"><color rgb="FF1E1F22"/></top>
      <bottom style="thin"><color rgb="FF1E1F22"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleMedium4"/>
</styleSheet>`;
}

function applyDiscordExcelStyling(buffer, options) {
  const { recordColumnCount, recordRowCount } = options;
  const zip = new AdmZip(buffer);
  const stylesPath = 'xl/styles.xml';
  const recordsSheetPath = 'xl/worksheets/sheet1.xml';
  const recordsSheetXml = zip.readAsText(recordsSheetPath);

  const lastCellRef = XLSX.utils.encode_cell({
    c: Math.max(recordColumnCount - 1, 0),
    r: Math.max(recordRowCount - 1, 0)
  });
  const autoFilterRef = `A1:${XLSX.utils.encode_cell({ c: Math.max(recordColumnCount - 1, 0), r: 0 })}`;

  let styledRecordsSheetXml = recordsSheetXml.replace(
    '<sheetView workbookViewId="0"/>',
    '<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>'
  );

  styledRecordsSheetXml = styledRecordsSheetXml.replace(
    /<row r="1">([\s\S]*?)<\/row>/,
    (_match, rowContent) => {
      const styledRow = rowContent.replace(/<c r="([A-Z]+1)"/g, '<c r="$1" s="1"');
      return `<row r="1" ht="24" customHeight="1">${styledRow}</row>`;
    }
  );

  styledRecordsSheetXml = styledRecordsSheetXml.replace(
    /<row r="([2-9]\d*)">([\s\S]*?)<\/row>/g,
    (_match, rowNumber, rowContent) => {
      const styleId = Number(rowNumber) % 2 === 0 ? '2' : '3';
      const styledRow = rowContent.replace(/<c r="([A-Z]+\d+)"/g, `<c r="$1" s="${styleId}"`);
      return `<row r="${rowNumber}" ht="22" customHeight="1">${styledRow}</row>`;
    }
  );

  if (!styledRecordsSheetXml.includes('<autoFilter ')) {
    styledRecordsSheetXml = styledRecordsSheetXml.replace(
      '</sheetData>',
      `</sheetData><autoFilter ref="${autoFilterRef}"/>`
    );
  }

  styledRecordsSheetXml = styledRecordsSheetXml.replace(
    /<ignoredError numberStoredAsText="1" sqref="[^"]*"\/>/,
    `<ignoredError numberStoredAsText="1" sqref="A1:${lastCellRef}"/>`
  );

  zip.updateFile(stylesPath, Buffer.from(buildDiscordStyleSheetXml(), 'utf8'));
  zip.updateFile(recordsSheetPath, Buffer.from(styledRecordsSheetXml, 'utf8'));
  return zip.toBuffer();
}

function serializeExportValue(field, value) {
  if (value === null || value === undefined) return '';
  if (field?.multiple || Array.isArray(value)) {
    return JSON.stringify(Array.isArray(value) ? value : [value]);
  }
  if (field?.type === 'checkbox') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function escapeCsvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function parseBooleanImportValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['true', '1', 'y', 'yes', 'o', 'on'].includes(normalized);
}

function parseArrayImportValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const text = String(value ?? '').trim();
  if (!text) return [];

  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch (error) {
      // Fall through to delimiter parsing.
    }
  }

  return text
    .split(/[\r\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePercentageImportPart(value) {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (text === '') return 0;
  const numericValue = Number(text);
  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}

function normalizePercentageImportValue(value, max) {
  const safeMax = parsePercentageImportPart(max);
  return {
    value: Math.min(parsePercentageImportPart(value), safeMax),
    max: safeMax
  };
}

function parseImportedFieldValue(field, rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return field?.multiple ? [] : field?.type === 'checkbox' ? false : '';
  }

  const text = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  if (text === '') {
    return field?.multiple ? [] : field?.type === 'checkbox' ? false : '';
  }

  switch (field?.type) {
    case 'number':
    case 'percentage': {
      if (field?.type === 'percentage') {
        if (typeof text === 'string') {
          const trimmedText = text.trim();
          if (trimmedText.startsWith('{') && trimmedText.endsWith('}')) {
            try {
              const parsed = JSON.parse(trimmedText);
              return normalizePercentageImportValue(parsed?.value, parsed?.max);
            } catch (error) {
              // Fall through to delimiter parsing.
            }
          }

          if (trimmedText.includes('/')) {
            const [currentPart, maxPart] = trimmedText.split('/', 2);
            return normalizePercentageImportValue(currentPart, maxPart);
          }
        }

        return normalizePercentageImportValue(text, 0);
      }
      const numericValue = Number(text);
      return Number.isFinite(numericValue) ? numericValue : String(text);
    }
    case 'checkbox':
      return parseBooleanImportValue(text);
    case 'select':
    case 'relation':
      return field?.multiple ? parseArrayImportValue(text) : String(text);
    case 'file':
    case 'date':
    case 'text':
    default:
      return String(text);
  }
}

function resolveImportedRelationValue(field, rawValue, relationResolvers) {
  const resolver = relationResolvers.get(field.id);
  if (!resolver) {
    return {
      value: field.multiple ? parseArrayImportValue(rawValue) : String(rawValue ?? ''),
      unresolvedCount: 0
    };
  }

  const sourceValues = field.multiple ? parseArrayImportValue(rawValue) : [String(rawValue ?? '').trim()].filter(Boolean);
  const resolvedIds = [];
  let unresolvedCount = 0;

  sourceValues.forEach((sourceValue) => {
    const normalized = String(sourceValue).trim().toLowerCase();
    if (!normalized) return;

    const matches = resolver.lookup.get(normalized) || [];
    if (matches.length === 1) {
      resolvedIds.push(matches[0]);
      return;
    }

    unresolvedCount += 1;
  });

  return {
    value: field.multiple ? Array.from(new Set(resolvedIds)) : (resolvedIds[0] || ''),
    unresolvedCount
  };
}

function createDefaultRecordData(fields) {
  return fields.reduce((acc, field) => {
    if (field.multiple) {
      acc[field.id] = [];
    } else if (field.type === 'checkbox') {
      acc[field.id] = false;
    } else {
      acc[field.id] = '';
    }
    return acc;
  }, {});
}

function getHeaderFieldMap(fields) {
  const map = new Map();
  fields.forEach((field) => {
    const keys = [field.id, field.name]
      .filter(Boolean)
      .map((key) => String(key).trim().toLowerCase());

    for (const key of keys) {
      if (key) {
        map.set(key, field);
      }
    }
  });
  return map;
}

function getUniqueFieldValueSets(categoryId, uniqueFields, profileId = getCurrentProfileIdOrThrow()) {
  const uniqueValueSets = new Map();

  for (const field of uniqueFields) {
    const rows = db.prepare(`
      SELECT json_extract(data, '$.${field.id}') AS value
      FROM records
      WHERE categoryId = ?
        AND profileId = ?
        AND json_extract(data, '$.${field.id}') IS NOT NULL
    `).all(categoryId, profileId);

    const values = new Set();
    rows.forEach((row) => {
      if (row.value !== '') {
        values.add(String(row.value));
      }
    });
    uniqueValueSets.set(field.id, values);
  }

  return uniqueValueSets;
}

const insertImportedRecordsBatch = db.transaction((recordsToInsert) => {
  const stmt = db.prepare(`
    INSERT INTO records (id, profileId, categoryId, data, createdAt, updatedAt, duration, thumbnailTimestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const record of recordsToInsert) {
    stmt.run(
      record.id,
      record.profileId,
      record.categoryId,
      JSON.stringify(record.data),
      record.createdAt,
      record.updatedAt,
      record.duration ?? null,
      record.thumbnailTimestamp ?? null
    );
  }
});

async function exportCategoryRecordsToCsv(filePath, category, records) {
  const relationResolvers = buildRelationResolvers(category.fields);
  const writeChunk = (stream, chunk) => new Promise((resolve, reject) => {
    const handleError = (error) => reject(error);
    stream.once('error', handleError);
    const canContinue = stream.write(chunk);
    if (canContinue) {
      stream.off('error', handleError);
      resolve();
      return;
    }
    stream.once('drain', () => {
      stream.off('error', handleError);
      resolve();
    });
  });

  await new Promise(async (resolve, reject) => {
    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    stream.on('error', reject);
    stream.on('finish', resolve);
    try {
      await writeChunk(stream, '\uFEFF');
      await writeChunk(stream, `${category.fields.map((field) => escapeCsvCell(field.name)).join(',')}\r\n`);

      for (const record of records) {
        const row = category.fields
          .map((field) => {
            const exportValue = field.type === 'relation'
              ? getRelationExportValue(field, record.data[field.id], relationResolvers)
              : serializeExportValue(field, record.data[field.id]);
            return escapeCsvCell(exportValue);
          })
          .join(',');

        await writeChunk(stream, `${row}\r\n`);
      }

      stream.end();
    } catch (error) {
      stream.destroy();
      reject(error);
    }
  });
}

function exportCategoryRecordsToExcel(filePath, category, records) {
  const relationResolvers = buildRelationResolvers(category.fields);
  const workbook = XLSX.utils.book_new();
  const headers = category.fields.map((field) => getExcelHeaderLabel(field));
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);

  for (let index = 0; index < records.length; index += IMPORT_EXPORT_BATCH_SIZE) {
    const batch = records.slice(index, index + IMPORT_EXPORT_BATCH_SIZE).map((record) =>
      category.fields.map((field) => (
        field.type === 'relation'
          ? getRelationExportValue(field, record.data[field.id], relationResolvers)
          : serializeExportValue(field, record.data[field.id])
      ))
    );

    XLSX.utils.sheet_add_aoa(worksheet, batch, { origin: -1 });
  }

  worksheet['!cols'] = category.fields.map((field, index) => ({
    wch: getExcelColumnWidth(
      field,
      headers[index],
      records.map((record) => (
        field.type === 'relation'
          ? getRelationExportValue(field, record.data[field.id], relationResolvers)
          : serializeExportValue(field, record.data[field.id])
      ))
    )
  }));

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Records');
  const workbookBuffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
    compression: true
  });
  const styledBuffer = applyDiscordExcelStyling(workbookBuffer, {
    recordColumnCount: headers.length,
    recordRowCount: records.length + 1
  });
  fs.writeFileSync(filePath, styledBuffer);
}

function readImportRowsFromFile(filePath) {
  const workbook = XLSX.readFile(filePath, {
    raw: false,
    dense: true,
    cellDates: false
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }
  const worksheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: false
  });
}

function importCategoryRecordsFromRows(categoryId, fields, rows, profileId = getCurrentProfileIdOrThrow()) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const headerFieldMap = getHeaderFieldMap(fields);
  const uniqueFields = fields.filter((field) => field.unique);
  const uniqueValueSets = getUniqueFieldValueSets(categoryId, uniqueFields, profileId);
  const relationResolvers = buildRelationResolvers(fields, profileId);
  const now = new Date().toISOString();

  let importedCount = 0;
  let duplicateCount = 0;
  let skippedCount = 0;
  let unresolvedRelationCount = 0;
  const duplicateFields = new Set();
  let pendingBatch = [];

  const flushPendingBatch = () => {
    if (pendingBatch.length === 0) return;
    insertImportedRecordsBatch(pendingBatch);
    pendingBatch = [];
  };

  for (const row of normalizedRows) {
    const recordData = createDefaultRecordData(fields);
    let hasAnyValue = false;

    for (const [header, rawValue] of Object.entries(row)) {
      const field = headerFieldMap.get(String(header).trim().toLowerCase());
      if (!field) continue;

      const relationResult = field.type === 'relation'
        ? resolveImportedRelationValue(field, rawValue, relationResolvers)
        : null;
      const parsedValue = relationResult
        ? relationResult.value
        : parseImportedFieldValue(field, rawValue);

      if (relationResult) {
        unresolvedRelationCount += relationResult.unresolvedCount;
      }

      recordData[field.id] = parsedValue;

      if (
        parsedValue !== '' &&
        parsedValue !== null &&
        parsedValue !== undefined &&
        !(Array.isArray(parsedValue) && parsedValue.length === 0) &&
        !(field.type === 'checkbox' && parsedValue === false)
      ) {
        hasAnyValue = true;
      }
    }

    if (!hasAnyValue) {
      skippedCount += 1;
      continue;
    }

    let isDuplicate = false;
    for (const field of uniqueFields) {
      const value = recordData[field.id];
      if (value === undefined || value === null || value === '') {
        continue;
      }

      const normalizedValue = String(value);
      const valueSet = uniqueValueSets.get(field.id);
      if (valueSet && valueSet.has(normalizedValue)) {
        isDuplicate = true;
        duplicateFields.add(field.name);
        break;
      }
    }

    if (isDuplicate) {
      duplicateCount += 1;
      continue;
    }

    const recordId = crypto.randomUUID();
    const record = {
      id: recordId,
      profileId,
      categoryId,
      data: recordData,
      createdAt: now,
      updatedAt: now,
      duration: null
    };

    pendingBatch.push(record);
    importedCount += 1;

    for (const field of uniqueFields) {
      const value = recordData[field.id];
      if (value === undefined || value === null || value === '') {
        continue;
      }
      uniqueValueSets.get(field.id)?.add(String(value));
    }

    if (pendingBatch.length >= IMPORT_EXPORT_BATCH_SIZE) {
      flushPendingBatch();
    }
  }

  flushPendingBatch();

  return {
    importedCount,
    duplicateCount,
    skippedCount,
    unresolvedRelationCount,
    duplicateFields: Array.from(duplicateFields)
  };
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
    const profileId = getCurrentProfileIdOrThrow();
    const categories = db.prepare('SELECT * FROM categories WHERE profileId = ? ORDER BY order_num').all(profileId);
    // fields를 배열로 변환
    return categories.map(cat => ({
      ...cat,
      order: cat.order_num ?? 0,
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
  const columnNames = rows.length > 0 ? Object.keys(rows[0]) : [];
  const columns = columnNames.map(name => ({ name, hidden: false }));
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
  const profileId = getCurrentProfileIdOrThrow();
  const id = generateUUID();
  const now = new Date().toISOString();
  
  try {
    db.prepare(`
      INSERT INTO categories (id, profileId, name, parentId, fields, order_num, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      profileId,
      category.name,
      category.parentId || null,
      JSON.stringify(category.fields),
      category.order_num ?? category.order ?? 0,
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
    
    const profileId = getCurrentProfileIdOrThrow();
    const record = db.prepare('SELECT categoryId, duration, thumbnailTimestamp FROM records WHERE id = ? AND profileId = ?').get(id, profileId);
    if (!record) {
      throw new Error('Record not found');
    }

    const dataToSave = { ...data };
    const requestedThumbnailTimestamp = Number(dataToSave.__thumbnailTimestamp);
    delete dataToSave.__thumbnailTimestamp;

    await checkDuplicateFields(record.categoryId, dataToSave, id, profileId);

    // 기존 duration 값 유지
    let duration = record.duration;
    let thumbnailTimestamp = Number.isFinite(requestedThumbnailTimestamp)
      ? Math.max(0, requestedThumbnailTimestamp)
      : record.thumbnailTimestamp;
    
    // duration이 없거나 파일 경로가 변경된 경우에만 새로 계산
    const fileField = Object.values(dataToSave).find(v => typeof v === 'string' && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(v));
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
      const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(record.categoryId, profileId);
      if (category) {
        const fields = JSON.parse(category.fields);
        log('=== 카테고리 필드 ===', { fields: fields.map(f => ({ id: f.id, type: f.type, name: f.name })) });
        
        const fileField = fields.find(f => f.type === 'file');
        if (fileField) {
          log('=== 파일 필드 발견 ===', { fileFieldId: fileField.id, fileFieldName: fileField.name });
          
          // 업데이트 전에 이전 파일 경로 조회
          const prevRecord = db.prepare('SELECT data FROM records WHERE id = ? AND profileId = ?').get(id, profileId);
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
      SET data = ?, updatedAt = ?, duration = ?, thumbnailTimestamp = ?
      WHERE id = ? AND profileId = ?
    `);
    
    stmt.run(
      JSON.stringify(dataToSave),
      new Date().toISOString(),
      duration,
      thumbnailTimestamp,
      id,
      profileId
    );
    log('=== DB 업데이트 완료 ===');
    
    // 파일 필드가 있으면 썸네일 자동 생성
    try {
      log('=== 썸네일 생성 로직 시작 ===');
      const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(record.categoryId, profileId);
      if (category) {
        const fields = JSON.parse(category.fields);
        const fileField = fields.find(f => f.type === 'file');
        if (fileField && dataToSave[fileField.id]) {
          const newFilePath = dataToSave[fileField.id];
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
              const recordData = db.prepare('SELECT data FROM records WHERE id = ? AND profileId = ?').get(id, profileId);
              if (recordData) {
                const data = JSON.parse(recordData.data);
                if (data.bookmarks && data.bookmarks.length > 0) {
                  data.bookmarks = [];
                  db.prepare("UPDATE records SET data = ?, updatedAt = ? WHERE id = ? AND profileId = ?")
                    .run(JSON.stringify(data), new Date().toISOString(), id, profileId);
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
            const thumbnailResult = await generateThumbnail(newFilePath, { recordId: id, categoryId: record.categoryId, profileId });
            if (thumbnailResult) {
              log('=== 썸네일 생성 완료 ===', { thumbnailResult });
              
              // 새 레코드의 경우 썸네일 경로를 DB에 저장
              thumbnailTimestamp = getThumbnailTimestampForFile(newFilePath, duration);
              db.prepare('UPDATE records SET thumbnailPath = ?, thumbnailTimestamp = ? WHERE id = ? AND profileId = ?').run(thumbnailResult, thumbnailTimestamp, id, profileId);
              log('[updateRecord] thumbnail path saved', { recordId: id, thumbnailPath: thumbnailResult, thumbnailTimestamp });
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
            hasFilePath: fileField ? !!dataToSave[fileField.id] : false,
            filePath: fileField ? dataToSave[fileField.id] : null
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
  const profileId = getCurrentProfileIdOrThrow();
  ensureCategoryBelongsToCurrentProfile(id);
  const subtreeIds = getCategorySubtreeIds(id, profileId);
  const relationCleanupCount = subtreeIds.reduce((count, categoryId) => count + cleanupRelationReferences(categoryId), 0);
  const categoryDirs = getStructuredThumbnailDirsForCategoryIds(subtreeIds, profileId);
  let totalThumbnailCount = 0;

  subtreeIds.forEach(categoryId => {
    totalThumbnailCount += cleanupThumbnailsForCategory(categoryId);
  });

  db.prepare(`DELETE FROM records WHERE profileId = ? AND categoryId IN (${getSqlPlaceholders(subtreeIds.length)})`).run(profileId, ...subtreeIds);
  db.prepare(`DELETE FROM categories WHERE profileId = ? AND id IN (${getSqlPlaceholders(subtreeIds.length)})`).run(profileId, ...subtreeIds);
  categoryDirs
    .sort((a, b) => b.length - a.length)
    .forEach(dirPath => removeEmptyThumbnailDirsUpward(dirPath));
  
  return {
    success: true,
    thumbnailCleanupCount: totalThumbnailCount,
    relationCleanupCount: relationCleanupCount
  };
});

ipcMain.handle('db:getRecords', async (_, categoryId) => {
  try {
    const profileId = getCurrentProfileIdOrThrow();
    if (!categoryId) throw new Error('Category ID is required');
    ensureCategoryBelongsToCurrentProfile(categoryId);
    const records = db.prepare('SELECT id, categoryId, data, createdAt, updatedAt, duration, thumbnailPath, thumbnailTimestamp FROM records WHERE categoryId = ? AND profileId = ? ORDER BY createdAt DESC').all(categoryId, profileId);
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
    const profileId = getCurrentProfileIdOrThrow();
    if (!record || typeof record !== 'object') {
      throw new Error('Record must be an object');
    }
    if (!record.categoryId || !record.data) {
      throw new Error('Missing required fields');
    }
    ensureCategoryBelongsToCurrentProfile(record.categoryId);
    await checkDuplicateFields(record.categoryId, record.data, null, profileId);
    const recordId = record.id || crypto.randomUUID();
    const stmt = db.prepare(`
      INSERT INTO records (id, profileId, categoryId, data, createdAt, updatedAt, duration, thumbnailTimestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
        profileId,
        record.categoryId,
        JSON.stringify(record.data),
        record.createdAt || now,
        record.updatedAt || now,
        duration,
        null
      );
    } catch (e) {
      log('[addRecord] DB insert 예외', { recordId, error: e.message, stack: e.stack });
      throw e;
    }
    // 파일 필드가 있으면 썸네일 자동 생성
    try {
      const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(record.categoryId, profileId);
      if (category) {
        const fields = JSON.parse(category.fields);
        const fileFieldObj = fields.find(f => f.type === 'file');
        if (fileFieldObj && record.data[fileFieldObj.id]) {
          const filePath = record.data[fileFieldObj.id];
          log('[addRecord] 썸네일 생성 시작', { filePath });
          try {
            const thumbnailResult = await generateThumbnail(filePath, { recordId, categoryId: record.categoryId, profileId });
            if (thumbnailResult) {
              log('[addRecord] 썸네일 생성 완료', { thumbnailResult });
              
              // 새 레코드의 경우 썸네일 경로를 DB에 저장
              const thumbnailTimestamp = getThumbnailTimestampForFile(filePath, duration);
              db.prepare('UPDATE records SET thumbnailPath = ?, thumbnailTimestamp = ? WHERE id = ? AND profileId = ?').run(thumbnailResult, thumbnailTimestamp, recordId, profileId);
              log('[addRecord] thumbnail path saved', { recordId, thumbnailPath: thumbnailResult, thumbnailTimestamp });
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
    const profileId = getCurrentProfileIdOrThrow();
    const record = db.prepare('SELECT categoryId, data, thumbnailPath FROM records WHERE id = ? AND profileId = ?').get(id, profileId);
    if (!record) {
      throw new Error('Record not found');
    }
    
    // 썸네일 삭제
    try {
      const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(record.categoryId, profileId);
      if (category) {
        const fields = JSON.parse(category.fields);
        const fileField = fields.find(f => f.type === 'file');
        if (fileField) {
          const data = JSON.parse(record.data);
          if (data[fileField.id]) {
            const filePath = data[fileField.id];
            log('레코드 삭제 시 썸네일 삭제 시작:', filePath);
            
            const thumbnailDeleted = deleteThumbnail(filePath, { recordId: id, categoryId: record.categoryId, profileId, thumbnailPath: record.thumbnailPath });
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
    
    db.prepare('DELETE FROM records WHERE id = ? AND profileId = ?').run(id, profileId);
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
    backupInterval: 60,
    rememberWindowBounds: appConfig.rememberWindowBounds,
    zoomPercent: getConfiguredZoomPercent(),
    hasAppPassword: Boolean(appConfig.passwordHash),
    videoSeekSeconds: appConfig.videoSeekSeconds || 5,
    videoAutoPlay: appConfig.videoAutoPlay !== false,
    listThumbnailFit: appConfig.listThumbnailFit === 'contain' ? 'contain' : 'cover',
    thumbnailPreviewScale: getConfiguredThumbnailPreviewScale(),
    dateParseFormats: normalizeDateParseFormats(appConfig.dateParseFormats)
  };
});

ipcMain.handle('profiles:getAll', () => {
  log('profiles:getAll');
  return db.prepare('SELECT * FROM profiles ORDER BY createdAt ASC').all();
});

ipcMain.handle('profiles:getCurrent', () => {
  return ensureCurrentProfileExists();
});

ipcMain.handle('profiles:select', (_event, profileId) => {
  log('profiles:select', { profileId });
  const profile = getProfileById(profileId);
  if (!profile) {
    log('profiles:select:not-found', { profileId });
    return { success: false, error: 'Profile not found.' };
  }

  currentProfileId = profile.id;
  log('profiles:select:success', { profileId: profile.id });
  return { success: true, profile };
});

ipcMain.handle('profiles:clearCurrent', () => {
  currentProfileId = null;
  return { success: true };
});

ipcMain.handle('profiles:create', (_event, payload = {}) => {
  try {
    log('profiles:create', payload);
    const profile = createProfile(payload.name, payload.avatarColor);
    log('profiles:create:success', { profileId: profile.id, name: profile.name });
    return { success: true, profile };
  } catch (error) {
    log('profiles:create:error', { message: error.message, stack: error.stack });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('profiles:update', (_event, profileId, updates = {}) => {
  const profile = getProfileById(profileId);
  if (!profile) {
    return { success: false, error: 'Profile not found.' };
  }

  const name = String(updates.name ?? profile.name).trim();
  if (!name) {
    return { success: false, error: 'Profile name is required.' };
  }

  const avatarColor = updates.avatarColor || profile.avatarColor || DEFAULT_PROFILE_COLOR;
  const categoryIds = db.prepare('SELECT id FROM categories WHERE profileId = ?').all(profileId).map(row => row.id);
  const thumbnailEntries = collectThumbnailMigrationEntries(categoryIds, profileId);
  const previousCategoryDirs = getStructuredThumbnailDirsForCategoryIds(categoryIds, profileId);
  const previousProfileDir = path.join(getThumbnailRootDir(), sanitizeThumbnailPathSegment(profile.name || profileId, 'profile'));
  db.prepare(`
    UPDATE profiles
    SET name = ?, avatarColor = ?, updatedAt = ?
    WHERE id = ?
  `).run(name, avatarColor, new Date().toISOString(), profileId);

  migrateStructuredThumbnailEntries(thumbnailEntries);
  previousCategoryDirs
    .sort((a, b) => b.length - a.length)
    .forEach(dirPath => removeEmptyThumbnailDirsUpward(dirPath));
  removeEmptyThumbnailDirsUpward(previousProfileDir);

  return { success: true, profile: getProfileById(profileId) };
});

ipcMain.handle('profiles:delete', (_event, profileId) => {
  const profile = getProfileById(profileId);
  if (!profile) {
    return { success: false, error: 'Profile not found.' };
  }

  const profileCount = db.prepare('SELECT COUNT(*) as count FROM profiles').get();
  if ((profileCount?.count || 0) <= 1) {
    return { success: false, error: 'At least one profile must remain.' };
  }

  const categoryIds = db.prepare('SELECT id FROM categories WHERE profileId = ?').all(profileId).map(row => row.id);
  const categoryDirs = getStructuredThumbnailDirsForCategoryIds(categoryIds, profileId);
  const profileDir = path.join(getThumbnailRootDir(), sanitizeThumbnailPathSegment(profile.name || profileId, 'profile'));
  categoryIds.forEach(categoryId => {
    cleanupThumbnailsForCategory(categoryId);
  });

  db.prepare('DELETE FROM records WHERE profileId = ?').run(profileId);
  db.prepare('DELETE FROM categories WHERE profileId = ?').run(profileId);
  db.prepare('DELETE FROM profiles WHERE id = ?').run(profileId);
  categoryDirs
    .sort((a, b) => b.length - a.length)
    .forEach(dirPath => removeEmptyThumbnailDirsUpward(dirPath));
  removeEmptyThumbnailDirsUpward(profileDir);

  if (currentProfileId === profileId) {
    currentProfileId = null;
  }

  return { success: true };
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

ipcMain.handle('setAppPassword', (_event, password) => {
  if (!password || String(password).trim().length < 4) {
    return { success: false, error: 'Password must be at least 4 characters.' };
  }

  appConfig.passwordHash = hashPassword(password);
  saveAppConfig();
  return { success: true };
});

ipcMain.handle('clearAppPassword', () => {
  appConfig.passwordHash = null;
  saveAppConfig();
  return { success: true };
});

ipcMain.handle('verifyAppPassword', (_event, password) => {
  if (!appConfig.passwordHash) {
    return { success: true };
  }

  const isValid = hashPassword(password) === appConfig.passwordHash;
  return isValid
    ? { success: true }
    : { success: false, error: 'Invalid password.' };
});

ipcMain.handle('setVideoSeekSeconds', (_event, seconds) => {
  const normalized = Number(seconds);
  if (!Number.isFinite(normalized) || normalized < 1) {
    return { success: false, error: 'Seconds must be at least 1.' };
  }

  appConfig.videoSeekSeconds = Math.floor(normalized);
  saveAppConfig();
  return { success: true };
});

ipcMain.handle('setZoomPercent', (_event, percent) => {
  const normalized = normalizeZoomPercent(percent);
  if (normalized === null) {
    return { success: false, error: 'Zoom percent must be a number.' };
  }

  appConfig.zoomPercent = normalized;
  saveAppConfig();

  for (const browserWindow of BrowserWindow.getAllWindows()) {
    applyWindowZoom(browserWindow);
  }

  return { success: true };
});

ipcMain.handle('setVideoAutoPlay', (_event, enabled) => {
  appConfig.videoAutoPlay = enabled !== false;
  saveAppConfig();
  return { success: true };
});

ipcMain.handle('setListThumbnailFit', (_event, fit) => {
  if (fit !== 'cover' && fit !== 'contain') {
    return { success: false, error: 'Thumbnail fit must be cover or contain.' };
  }

  appConfig.listThumbnailFit = fit;
  saveAppConfig();
  return { success: true };
});

ipcMain.handle('setThumbnailPreviewScale', (_event, scale) => {
  const normalized = normalizeThumbnailPreviewScale(scale);
  if (normalized === null) {
    return { success: false, error: 'Thumbnail preview scale must be a number.' };
  }

  appConfig.thumbnailPreviewScale = normalized;
  saveAppConfig();
  return { success: true };
});

ipcMain.handle('setDateParseFormats', (_event, formats) => {
  appConfig.dateParseFormats = normalizeDateParseFormats(formats);
  saveAppConfig();
  return { success: true, dateParseFormats: appConfig.dateParseFormats ?? [] };
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

function getCategorySubtree(rootId, allCategories) {
  const childrenMap = new Map();
  for (const cat of allCategories) {
    const parentKey = cat.parentId || null;
    if (!childrenMap.has(parentKey)) {
      childrenMap.set(parentKey, []);
    }
    childrenMap.get(parentKey).push(cat);
  }
  // preserve order within parent
  for (const [key, list] of childrenMap.entries()) {
    list.sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  }

  const result = [];
  const stack = [rootId];
  const visited = new Set();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const node = allCategories.find(c => c.id === current);
    if (!node) continue;
    result.push(node);
    const children = childrenMap.get(current) || [];
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i].id);
    }
  }
  return result;
}

ipcMain.handle('category:export', async (_, categoryId) => {
  try {
    const categories = db.prepare('SELECT id, name, parentId, fields, order_num, createdAt, updatedAt FROM categories').all();
    const subtree = getCategorySubtree(categoryId, categories);
    if (subtree.length === 0) {
      return { success: false, error: 'Category not found' };
    }

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      rootCategoryId: categoryId,
      categories: subtree.map(cat => ({
        id: cat.id,
        name: cat.name,
        parentId: cat.parentId,
        fields: JSON.parse(cat.fields),
        order_num: cat.order_num ?? 0,
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt
      }))
    };

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: '카테고리 추출 저장',
      defaultPath: `category-${categoryId}.json`,
      filters: [{ name: 'Category Export', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { success: false };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { success: true, path: filePath };
  } catch (error) {
    log('Error exporting category:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('category:import', async () => {
  try {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: '카테고리 붙여넣기',
      filters: [{ name: 'Category Export', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths || filePaths.length === 0) return { success: false };

    const raw = fs.readFileSync(filePaths[0], 'utf-8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.categories)) {
      return { success: false, error: 'Invalid category export file' };
    }

    const now = new Date().toISOString();
    const oldToNew = new Map();
    const categories = data.categories;
    const categoryMap = new Map(categories.map(c => [c.id, c]));
    const childrenMap = new Map();
    for (const cat of categories) {
      const parentKey = categoryMap.has(cat.parentId) ? cat.parentId : null;
      if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
      childrenMap.get(parentKey).push(cat);
    }
    for (const [key, list] of childrenMap.entries()) {
      list.sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
    }

    const getNextOrder = (() => {
      const cache = new Map();
      return (parentId) => {
        const key = parentId || null;
        if (!cache.has(key)) {
          const row = parentId
            ? db.prepare('SELECT MAX(order_num) as maxOrder FROM categories WHERE parentId = ?').get(parentId)
            : db.prepare('SELECT MAX(order_num) as maxOrder FROM categories WHERE parentId IS NULL').get();
          cache.set(key, Number.isFinite(row?.maxOrder) ? row.maxOrder + 1 : 0);
        }
        const next = cache.get(key);
        cache.set(key, next + 1);
        return next;
      };
    })();

    const insertStmt = db.prepare(`
      INSERT INTO categories (id, name, parentId, fields, order_num, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const dfsInsert = (parentId) => {
      const children = childrenMap.get(parentId || null) || [];
      for (const child of children) {
        const newId = generateUUID();
        oldToNew.set(child.id, newId);
        const newParentId = parentId ? oldToNew.get(parentId) : null;
        const orderNum = getNextOrder(newParentId || null);
        insertStmt.run(
          newId,
          child.name,
          newParentId,
          JSON.stringify(child.fields),
          orderNum,
          now,
          now
        );
        dfsInsert(child.id);
      }
    };

    dfsInsert(null);

    return { success: true, importedCount: oldToNew.size };
  } catch (error) {
    log('Error importing category:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('category:exportRecords', async (_, categoryId, format = 'csv') => {
  try {
    const profileId = getCurrentProfileIdOrThrow();
    if (!categoryId) {
      throw new Error('Category ID is required');
    }

    ensureCategoryBelongsToCurrentProfile(categoryId);
    const category = getCategoryOrThrow(categoryId, profileId);
    const records = getCategoryRecordsForProfile(categoryId, profileId);
    const normalizedFormat = format === 'xlsx' ? 'xlsx' : 'csv';
    const extension = normalizedFormat === 'xlsx' ? 'xlsx' : 'csv';
    const safeCategoryName = sanitizeFileName(category.name);

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: normalizedFormat === 'xlsx' ? 'Excel 내보내기' : 'CSV 내보내기',
      defaultPath: `${safeCategoryName}.${extension}`,
      filters: [
        {
          name: normalizedFormat === 'xlsx' ? 'Excel Workbook' : 'CSV File',
          extensions: [extension]
        }
      ]
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    if (normalizedFormat === 'xlsx') {
      exportCategoryRecordsToExcel(filePath, category, records);
    } else {
      await exportCategoryRecordsToCsv(filePath, category, records);
    }

    return {
      success: true,
      path: filePath,
      recordCount: records.length,
      format: normalizedFormat
    };
  } catch (error) {
    log('Error exporting category records:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('category:importRecords', async (_, categoryId, format = 'csv') => {
  try {
    const profileId = getCurrentProfileIdOrThrow();
    if (!categoryId) {
      throw new Error('Category ID is required');
    }

    ensureCategoryBelongsToCurrentProfile(categoryId);
    const category = getCategoryOrThrow(categoryId, profileId);
    const normalizedFormat = format === 'xlsx' ? 'xlsx' : 'csv';
    const extensions = normalizedFormat === 'xlsx' ? ['xlsx', 'xls'] : ['csv'];

    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: normalizedFormat === 'xlsx' ? 'Excel 가져오기' : 'CSV 가져오기',
      properties: ['openFile'],
      filters: [
        {
          name: normalizedFormat === 'xlsx' ? 'Excel Workbook' : 'CSV File',
          extensions
        }
      ]
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const rows = readImportRowsFromFile(filePaths[0]);
    const result = importCategoryRecordsFromRows(categoryId, category.fields, rows, profileId);

    return {
      success: true,
      path: filePaths[0],
      format: normalizedFormat,
      ...result
    };
  } catch (error) {
    log('Error importing category records:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('resetDatabase', () => {
  try {
    const backupDir = path.join(path.join(os.homedir(), 'AppData', 'Local'), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-before-reset-${timestamp}.db`);
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
    }

    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('DROP TABLE IF EXISTS records');
    db.exec('DROP TABLE IF EXISTS categories');
    db.exec('PRAGMA foreign_keys = ON');

    initializeDatabase();
    db.exec('VACUUM');

    return { success: true, backupPath };
  } catch (error) {
    log('Reset database failed:', error);
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
    const profileId = getCurrentProfileIdOrThrow();
    const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(categoryId, profileId);
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
      AND profileId = ?
      AND json_extract(data, '$.${fieldId}') = ?
    `;
    let params = [categoryId, profileId, String(value)];

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

function getDialogDefaultPath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return undefined;

  const trimmedPath = inputPath.trim();
  if (!trimmedPath) return undefined;

  const candidates = path.isAbsolute(trimmedPath)
    ? [trimmedPath]
    : [
        path.join(app.getAppPath(), trimmedPath),
        path.join(appDataDir, trimmedPath)
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const stat = fs.statSync(candidate);
      return stat.isDirectory() ? candidate : path.dirname(candidate);
    }

    const parentDir = path.dirname(candidate);
    if (parentDir && fs.existsSync(parentDir)) {
      return parentDir;
    }
  }

  return undefined;
}

ipcMain.handle('openFileDialog', async (_, defaultPath) => {
  const dialogOptions = {
    properties: ['openFile'],
    title: '파일 선택'
  };
  const resolvedDefaultPath = getDialogDefaultPath(defaultPath);
  if (resolvedDefaultPath) {
    dialogOptions.defaultPath = resolvedDefaultPath;
  }

  return await dialog.showOpenDialog({
    ...dialogOptions
  });
});

ipcMain.handle('openDirectoryDialog', async () => {
  return await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: '폴더 선택'
  });
});

// 이미지 전용 파일 선택 다이얼로그
ipcMain.handle('openImageFileDialog', async (_, defaultPath) => {
  const dialogOptions = {
    properties: ['openFile'],
    title: '이미지 파일 선택',
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }
    ]
  };
  const resolvedDefaultPath = getDialogDefaultPath(defaultPath);
  if (resolvedDefaultPath) {
    dialogOptions.defaultPath = resolvedDefaultPath;
  }

  return await dialog.showOpenDialog({
    ...dialogOptions
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

ipcMain.handle('getThumbnailDataUrl', async (_, filePath, context = {}) => {
  try {
    let normalizedPath = filePath;
    
    if (!path.isAbsolute(filePath)) {
      // appDataDir 사용
      normalizedPath = path.join(appDataDir, filePath);
    }
    
    let thumbnailPath = getThumbnailPathForContext(normalizedPath, context).thumbnailPath;
    if (!fs.existsSync(thumbnailPath)) {
      const migratedPath = copyLegacyThumbnailToStructuredPath(normalizedPath, context);
      thumbnailPath = migratedPath || thumbnailPath;
    }
    
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
        log('Large video detected, using streaming mode:', { filePath, sizeMB: fileSizeInMB });
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

// getArchiveFileStreamInfo 핸들러 (압축파일 내 동영상 스트리밍 여부 결정)
ipcMain.handle('getArchiveFileStreamInfo', async (_, filePath, fileName) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.7z') return null;
    
    const fileExt = path.extname(fileName).toLowerCase();
    const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(fileExt);
    
    if (!isVideo) return null;
    
    // 압축파일 내 동영상 파일 크기 확인
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(unzipper.Parse())
        .on('entry', function (entry) {
          if (entry.path === fileName && entry.type === 'File') {
            const fileSizeInMB = entry.vars.uncompressedSize / (1024 * 1024);
            
            // 50MB 이상인 경우 스트리밍 방식 사용
            if (fileSizeInMB > 50) {
              log('압축파일 내 대용량 동영상 감지, 스트리밍 방식 사용:', { 
                archivePath: filePath, 
                fileName, 
                sizeMB: fileSizeInMB 
              });
              resolve('stream'); // 스트리밍 방식 사용을 나타내는 특별한 값
            } else {
              resolve(null); // 일반 방식 사용
            }
            entry.autodrain();
          } else {
            entry.autodrain();
          }
        })
        .on('close', () => resolve(null))
        .on('error', reject);
    });
  } catch (e) {
    log('Error in getArchiveFileStreamInfo:', e);
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
  const profileId = getCurrentProfileIdOrThrow();
  const existingCategory = ensureCategoryBelongsToCurrentProfile(id);
  const subtreeIds = getCategorySubtreeIds(id, profileId);
  const thumbnailEntries = collectThumbnailMigrationEntries(subtreeIds, profileId);
  const previousCategoryDirs = getStructuredThumbnailDirsForCategoryIds(subtreeIds, profileId);
  const nextOrder = updates.order_num ?? updates.order ?? existingCategory.order_num ?? 0;
  const stmt = db.prepare(`
    UPDATE categories
    SET name = ?, parentId = ?, fields = ?, order_num = ?, updatedAt = ?
    WHERE id = ? AND profileId = ?
  `);
  stmt.run(
    updates.name,
    updates.parentId || null,
    JSON.stringify(updates.fields),
    nextOrder,
    new Date().toISOString(),
    id,
    profileId
  );
  migrateStructuredThumbnailEntries(thumbnailEntries);
  previousCategoryDirs
    .sort((a, b) => b.length - a.length)
    .forEach(dirPath => removeEmptyThumbnailDirsUpward(dirPath));
  return { success: true };
});

ipcMain.handle('db:moveCategoryToProfile', (_event, categoryId, targetProfileId) => {
  try {
    const sourceProfileId = getCurrentProfileIdOrThrow();
    const category = ensureCategoryBelongsToCurrentProfile(categoryId);

    if (category.parentId) {
      return { success: false, error: 'Only root categories can be moved.' };
    }

    const targetProfile = getProfileById(targetProfileId);
    if (!targetProfile) {
      return { success: false, error: 'Target profile not found.' };
    }

    if (targetProfileId === sourceProfileId) {
      return { success: false, error: 'Category is already in that profile.' };
    }

    const subtreeIds = getCategorySubtreeIds(categoryId, sourceProfileId);
    const targetRootOrder = db.prepare(`
      SELECT COALESCE(MAX(order_num), -1) + 1 AS nextOrder
      FROM categories
      WHERE profileId = ? AND parentId IS NULL
    `).get(targetProfileId)?.nextOrder ?? 0;

    const updateCategoryProfileStmt = db.prepare(`
      UPDATE categories
      SET profileId = ?, updatedAt = ?
      WHERE id = ?
    `);
    const updateRecordProfileStmt = db.prepare(`
      UPDATE records
      SET profileId = ?, updatedAt = ?
      WHERE categoryId = ? AND profileId = ?
    `);
    const updateRootOrderStmt = db.prepare(`
      UPDATE categories
      SET order_num = ?, updatedAt = ?
      WHERE id = ?
    `);

    const moveCategoryTree = db.transaction(() => {
      const now = new Date().toISOString();

      subtreeIds.forEach(subtreeCategoryId => {
        updateCategoryProfileStmt.run(targetProfileId, now, subtreeCategoryId);
        updateRecordProfileStmt.run(targetProfileId, now, subtreeCategoryId, sourceProfileId);
      });

      updateRootOrderStmt.run(targetRootOrder, now, categoryId);
    });

    moveCategoryTree();
    return { success: true };
  } catch (error) {
    log('Error moving category to profile:', error);
    return { success: false, error: error.message };
  }
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
ipcMain.handle('deleteThumbnail', async (_, filePath, context = {}) => {
  return deleteThumbnail(filePath, context);
});

const generateVideoThumbnailWithTime = async (filePath, timestampSec, context = {}) => {
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
    if (!ffmpegPath || !ffprobePath || !fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
      log('ffmpeg/ffprobe 경로를 찾을 수 없음', { ffmpegPath, ffprobePath });
      return null;
    }
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
    
    const ext = path.extname(normalizedPath).toLowerCase();
    const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(ext);
    if (!isVideo) return null;
    const { thumbnailDir, thumbnailPath } = ensureThumbnailDirForContext(normalizedPath, context);
    // duration 구하기
    const duration = await new Promise((resolve) => {
      ffmpeg.ffprobe(normalizedPath, (err, metadata) => {
        if (err || !metadata || !metadata.format || !metadata.format.duration) return resolve(null);
        resolve(Math.floor(metadata.format.duration));
      });
    });
    const embeddedCoverPath = await extractEmbeddedVideoCover(normalizedPath, thumbnailPath);
    if (embeddedCoverPath) {
      return embeddedCoverPath;
    }
    let ts = Number(timestampSec);
    if (!Number.isFinite(ts)) {
      ts = getAutoThumbnailTimestamp(duration);
    }
    if (duration && ts > duration) {
      ts = getAutoThumbnailTimestamp(duration);
    }
    await new Promise((resolve, reject) => {
      ffmpeg(normalizedPath)
        .screenshots({
          timestamps: [ts],
          filename: path.basename(thumbnailPath),
          folder: thumbnailDir,
          size: '400x?'
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    });
    return thumbnailPath;
  } catch (e) {
    return null;
  }
};

ipcMain.handle('generateThumbnailWithTime', async (_, filePath, timestampSec, context = {}) => {
  return await generateVideoThumbnailWithTime(filePath, timestampSec, context);
});

// 이미지/압축파일용 썸네일 재생성 함수
const regenerateImageOrArchiveThumbnail = async (filePath, context = {}) => {
  try {
    const sharp = require('sharp');
    const path = require('path');
    const fs = require('fs');
    const unzipper = require('unzipper');
    
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
    
    const { thumbnailDir, thumbnailPath } = ensureThumbnailDirForContext(normalizedPath, context);
    
    log('썸네일 재생성 시작:', { filePath: normalizedPath, thumbnailPath, fileType: isImage ? 'image' : 'archive' });
    
    if (isImage) {
      // 이미지 썸네일 재생성
      await sharp(normalizedPath)
        .resize(400, 400, { fit: 'inside' })
        .toFile(thumbnailPath);
      log('이미지 썸네일 재생성 완료:', thumbnailPath);
    } else if (isArchive) {
      // 압축파일 썸네일 재생성 (대용량 대응을 위해 스트리밍 처리)
      let found = false;
      await new Promise((resolve, reject) => {
        fs.createReadStream(normalizedPath)
          .pipe(unzipper.Parse())
          .on('entry', async (entry) => {
            const fileName = entry.path;
            if (/\.(jpg|jpeg|png|gif|webp)$/i.test(fileName) && !found && entry.type === 'File') {
              found = true;
              const chunks = [];
              entry.on('data', (chunk) => chunks.push(chunk));
              entry.on('end', async () => {
                const buffer = Buffer.concat(chunks);
                try {
                  await sharp(buffer)
                    .resize(400, 400, { fit: 'inside' })
                    .toFile(thumbnailPath);
                  log('압축파일 썸네일 재생성 완료:', thumbnailPath);
                  resolve(null);
                } catch (err) {
                  log('압축파일 썸네일 재생성 실패:', err);
                  reject(err);
                }
              });
              entry.on('error', (err) => {
                log('압축파일 엔트리 처리 실패:', err);
                reject(err);
              });
            } else {
              entry.autodrain();
            }
          })
          .on('close', () => {
            if (!found) {
              log('압축파일 내 이미지 파일을 찾을 수 없음');
            }
            resolve(null);
          })
          .on('error', (err) => {
            log('압축파일 처리 실패:', err);
            reject(err);
          });
      });
      if (!found) {
        return null;
      }
    }
    
    return thumbnailPath;
  } catch (e) {
    log('썸네일 재생성 에러:', e);
    return null;
  }
};

// 사용자가 직접 선택한 이미지 파일로 썸네일을 교체하는 함수
const setCustomThumbnailFromImage = async (targetFilePath, imagePath, context = {}) => {
  try {
    const sharp = require('sharp');
    const path = require('path');
    const fs = require('fs');

    if (!imagePath) {
      log('커스텀 썸네일 이미지 경로가 비어 있습니다.');
      return null;
    }

    if (!fs.existsSync(imagePath)) {
      log('커스텀 썸네일 이미지 파일이 존재하지 않습니다:', imagePath);
      return null;
    }

    let normalizedTargetPath = targetFilePath;
    if (!path.isAbsolute(targetFilePath)) {
      normalizedTargetPath = path.join(appDataDir, targetFilePath);
    }

    const ext = path.extname(imagePath).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    if (!isImage) {
      log('커스텀 썸네일로 지원하지 않는 이미지 형식:', ext);
      return null;
    }

    const { thumbnailPath } = ensureThumbnailDirForContext(normalizedTargetPath, context);

    log('커스텀 썸네일 생성 시작:', { targetFilePath: normalizedTargetPath, imagePath, thumbnailPath });

    await sharp(imagePath)
      .resize(400, 400, { fit: 'inside' })
      .toFile(thumbnailPath);

    log('커스텀 썸네일 생성 완료:', thumbnailPath);

    const targetExt = path.extname(normalizedTargetPath).toLowerCase();
    const isVideoTarget = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v'].includes(targetExt);
    if (isVideoTarget) {
      await persistCustomThumbnailToVideoMetadata(normalizedTargetPath, thumbnailPath);
    }

    return thumbnailPath;
  } catch (e) {
    log('커스텀 썸네일 생성 에러:', e);
    return null;
  }
};

ipcMain.handle('regenerateThumbnail', async (_, filePath, context = {}) => {
  return await regenerateImageOrArchiveThumbnail(filePath, context);
});

// 사용자가 선택한 이미지로 썸네일을 직접 등록
ipcMain.handle('setCustomThumbnail', async (_, filePath, imagePath, context = {}) => {
  return await setCustomThumbnailFromImage(filePath, imagePath, context);
});

ipcMain.handle('removeCustomThumbnail', async (_, filePath, context = {}) => {
  const removed = await removeEmbeddedVideoCover(filePath);
  const stillHasEmbeddedCover = removed ? await hasEmbeddedVideoCover(filePath) : true;
  if (removed && !stillHasEmbeddedCover) {
    deleteThumbnail(filePath, context);
    return true;
  }
  return false;
});

ipcMain.handle('getVideoDuration', async (_, filePath) => {
  try {
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegStatic = require('ffmpeg-static');
    const ffprobeStatic = require('ffprobe-static');
    const path = require('path');
    const fs = require('fs');
    let normalizedPath = filePath;
    if (!path.isAbsolute(filePath)) {
      normalizedPath = path.join(appDataDir, filePath);
    }
    if (!fs.existsSync(normalizedPath)) {
      return null;
    }

    // ffmpeg/ffprobe 경로를 resources 폴더의 경로로만 강제 지정
    const ffmpegPath = path.join(process.resourcesPath, 'ffmpeg-static', 'ffmpeg.exe');
    const ffprobePath = getUnpackedFfprobePath();
    if (!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
      log('ffmpeg/ffprobe 경로를 찾을 수 없음', { ffmpegPath, ffprobePath });
      return null;
    }
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
    
    return await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(normalizedPath, (err, metadata) => {
        if (err) {
          console.error('ffprobe error:', err);
          return resolve(null);
        }
        if (metadata && metadata.format && metadata.format.duration) {
          const duration = Math.floor(metadata.format.duration);
          resolve(duration);
        } else {
          resolve(null);
        }
      });
    });
  } catch (e) {
    console.error('Failed to get video duration:', e);
    return null;
  }
});

ipcMain.handle('generateThumbnail', async (_, filePath, context = {}) => {
  return await generateThumbnail(filePath, context);
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
        const hasEmbeddedCover = metadata.streams.some((s) => s?.disposition?.attached_pic === 1);
        resolve({
          video: video ? { codec: video.codec_name, profile: video.profile, pix_fmt: video.pix_fmt } : null,
          audio: audio ? { codec: audio.codec_name, sample_rate: audio.sample_rate, channels: audio.channels } : null,
          hasEmbeddedCover,
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

// 새로운 하이브리드 썸네일 데이터 URL 핸들러
const getFfmpegToolPaths = () => {
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

  return {
    ffmpegPath: ffmpegCandidates.find(fs.existsSync),
    ffprobePath: ffprobeCandidates.find(fs.existsSync)
  };
};

const hasEmbeddedVideoCover = async (filePath) => {
  try {
    const ffmpeg = require('fluent-ffmpeg');
    const { ffmpegPath, ffprobePath } = getFfmpegToolPaths();
    if (!ffmpegPath || !ffprobePath) {
      return false;
    }

    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);

    return await new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err || !metadata?.streams) {
          return resolve(false);
        }

        resolve(metadata.streams.some((stream) => stream?.disposition?.attached_pic === 1));
      });
    });
  } catch (error) {
    return false;
  }
};

const extractEmbeddedVideoCover = async (filePath, outputPath) => {
  try {
    const ffmpeg = require('fluent-ffmpeg');
    const { ffmpegPath, ffprobePath } = getFfmpegToolPaths();

    if (!ffmpegPath || !ffprobePath) {
      return null;
    }

    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);

    const attachedPicStreamIndex = await new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err || !metadata?.streams) {
          return resolve(null);
        }

        const stream = metadata.streams.find((item) => item?.disposition?.attached_pic === 1);
        resolve(stream?.index ?? null);
      });
    });

    if (attachedPicStreamIndex === null || attachedPicStreamIndex === undefined) {
      return null;
    }

    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .outputOptions([`-map 0:${attachedPicStreamIndex}`, '-frames:v 1'])
        .save(outputPath)
        .on('end', resolve)
        .on('error', reject);
    });

    return fs.existsSync(outputPath) ? outputPath : null;
  } catch (error) {
    log('비디오 메타데이터 커버 추출 실패:', { filePath, outputPath, error: error.message });
    return null;
  }
};

const persistCustomThumbnailToVideoMetadata = async (targetFilePath, imagePath) => {
  try {
    const ext = path.extname(targetFilePath).toLowerCase();
    const supportedFormats = ['.mp4', '.m4v', '.mov', '.mkv'];
    if (!supportedFormats.includes(ext)) {
      return false;
    }

    const ffmpeg = require('fluent-ffmpeg');
    const { ffmpegPath, ffprobePath } = getFfmpegToolPaths();
    if (!ffmpegPath || !ffprobePath) {
      return false;
    }

    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);

    const tempOutputPath = `${targetFilePath}.cover-tmp${ext}`;

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(targetFilePath)
        .input(imagePath)
        .outputOptions([
          '-map 0',
          '-map 1',
          '-c copy',
          '-c:v:1 mjpeg',
          '-disposition:v:1 attached_pic'
        ])
        .save(tempOutputPath)
        .on('end', resolve)
        .on('error', reject);
    });

    if (!fs.existsSync(tempOutputPath)) {
      return false;
    }

    const backupPath = `${targetFilePath}.cover-backup`;
    try {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      fs.renameSync(targetFilePath, backupPath);
      fs.renameSync(tempOutputPath, targetFilePath);
      fs.unlinkSync(backupPath);
    } catch (swapError) {
      if (fs.existsSync(tempOutputPath)) {
        fs.unlinkSync(tempOutputPath);
      }
      if (fs.existsSync(backupPath) && !fs.existsSync(targetFilePath)) {
        fs.renameSync(backupPath, targetFilePath);
      }
      throw swapError;
    }

    return true;
  } catch (error) {
    log('비디오 메타데이터 커버 저장 실패:', { targetFilePath, imagePath, error: error.message });
    return false;
  }
};

const removeEmbeddedVideoCover = async (targetFilePath) => {
  try {
    const ext = path.extname(targetFilePath).toLowerCase();
    const supportedFormats = ['.mp4', '.m4v', '.mov', '.mkv'];
    if (!supportedFormats.includes(ext)) {
      return false;
    }

    const ffmpeg = require('fluent-ffmpeg');
    const { ffmpegPath, ffprobePath } = getFfmpegToolPaths();
    if (!ffmpegPath || !ffprobePath) {
      return false;
    }

    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);

    const attachedPicStreamIndexes = await new Promise((resolve) => {
      ffmpeg.ffprobe(targetFilePath, (err, metadata) => {
        if (err || !metadata?.streams) {
          return resolve([]);
        }

        const indexes = metadata.streams
          .filter((stream) => stream?.disposition?.attached_pic === 1)
          .map((stream) => stream.index)
          .filter((index) => index !== null && index !== undefined);

        resolve(indexes);
      });
    });

    if (!attachedPicStreamIndexes.length) {
      return false;
    }

    const tempOutputPath = `${targetFilePath}.cover-remove-tmp${ext}`;
    const outputOptions = ['-map 0', ...attachedPicStreamIndexes.map((index) => `-map -0:${index}`), '-c copy'];

    await new Promise((resolve, reject) => {
      ffmpeg(targetFilePath)
        .outputOptions(outputOptions)
        .save(tempOutputPath)
        .on('end', resolve)
        .on('error', reject);
    });

    if (!fs.existsSync(tempOutputPath)) {
      return false;
    }

    const backupPath = `${targetFilePath}.cover-remove-backup`;
    try {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      fs.renameSync(targetFilePath, backupPath);
      fs.renameSync(tempOutputPath, targetFilePath);
      fs.unlinkSync(backupPath);
    } catch (swapError) {
      if (fs.existsSync(tempOutputPath)) {
        fs.unlinkSync(tempOutputPath);
      }
      if (fs.existsSync(backupPath) && !fs.existsSync(targetFilePath)) {
        fs.renameSync(backupPath, targetFilePath);
      }
      throw swapError;
    }

    return true;
  } catch (error) {
    log('임베디드 커버 제거 실패:', { targetFilePath, error: error.message });
    return false;
  }
};

ipcMain.handle('getThumbnailDataUrlHybrid', async (_, record, filePath) => {
  try {
    if (!filePath) return null;
    let normalizedPath = filePath;
    if (!path.isAbsolute(filePath)) {
      normalizedPath = path.join(appDataDir, filePath);
    }

    const thumbnailContext = getThumbnailContextForRecordLike(record);
    let thumbnailPath = null;

    if (record && record.thumbnailPath && fs.existsSync(record.thumbnailPath)) {
      const expectedPath = getThumbnailPathForContext(normalizedPath, thumbnailContext).thumbnailPath;
      if (record.thumbnailPath !== expectedPath) {
        ensureThumbnailDirForContext(normalizedPath, thumbnailContext);
        if (!fs.existsSync(expectedPath)) {
          fs.copyFileSync(record.thumbnailPath, expectedPath);
        }
        thumbnailPath = expectedPath;
        if (record?.id) {
          db.prepare('UPDATE records SET thumbnailPath = ? WHERE id = ?').run(thumbnailPath, record.id);
        }
      } else {
        thumbnailPath = record.thumbnailPath;
      }
    } else {
      thumbnailPath = getThumbnailPathForContext(normalizedPath, thumbnailContext).thumbnailPath;
      if (!fs.existsSync(thumbnailPath)) {
        const migratedPath = copyLegacyThumbnailToStructuredPath(normalizedPath, thumbnailContext);
        if (migratedPath) {
          thumbnailPath = migratedPath;
          if (record?.id) {
            db.prepare('UPDATE records SET thumbnailPath = ? WHERE id = ?').run(thumbnailPath, record.id);
          }
        }
      }
    }

    if (!thumbnailPath || !fs.existsSync(thumbnailPath)) {
      if (!fs.existsSync(normalizedPath)) {
        log('원본 파일이 존재하지 않음:', normalizedPath);
        return null;
      }

      const ext = path.extname(normalizedPath).toLowerCase();
      const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(ext);
      const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
      const isArchive = ['.zip', '.7z'].includes(ext);

      if (isVideo) {
        const tsRaw = record?.thumbnailTimestamp ?? record?.data?.__thumbnailTimestamp;
        const timestampSec = Number.isFinite(Number(tsRaw)) ? Number(tsRaw) : null;
        thumbnailPath = await generateVideoThumbnailWithTime(normalizedPath, timestampSec, thumbnailContext);
      } else if (isImage || isArchive) {
        thumbnailPath = await regenerateImageOrArchiveThumbnail(normalizedPath, thumbnailContext);
      }

      if (thumbnailPath && record?.id) {
        try {
          const thumbnailTimestamp = isVideo
            ? (Number.isFinite(Number(record?.thumbnailTimestamp ?? record?.data?.__thumbnailTimestamp))
              ? Math.max(0, Number(record?.thumbnailTimestamp ?? record?.data?.__thumbnailTimestamp))
              : getThumbnailTimestampForFile(normalizedPath, null))
            : null;
          db.prepare('UPDATE records SET thumbnailPath = ?, thumbnailTimestamp = COALESCE(?, thumbnailTimestamp) WHERE id = ?').run(thumbnailPath, thumbnailTimestamp, record.id);
        } catch (e) {
          log('썸네일 경로 업데이트 실패:', e);
        }
      }
    }

    if (!thumbnailPath || !fs.existsSync(thumbnailPath)) {
      log('하이브리드 썸네일 파일이 존재하지 않음:', thumbnailPath);
      return null;
    }

    const buffer = fs.readFileSync(thumbnailPath);
    const base64 = buffer.toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (e) {
    log('Error getting hybrid thumbnail data URL:', e);
    return null;
  }
});

// 썸네일 경로 마이그레이션 핸들러
ipcMain.handle('migrateThumbnailPaths', async () => {
  try {
    log('=== 썸네일 경로 마이그레이션 시작 ===');
    
    // 모든 카테고리 조회
    const categories = db.prepare('SELECT id, fields, profileId FROM categories').all();
    let totalProcessed = 0;
    let totalUpdated = 0;
    
    for (const category of categories) {
      const fields = JSON.parse(category.fields);
      const fileField = fields.find(f => f.type === 'file');
      
      if (!fileField) continue;
      
      // 해당 카테고리의 모든 레코드 조회
      const records = db.prepare('SELECT id, data, thumbnailPath, categoryId, profileId FROM records WHERE categoryId = ?').all(category.id);
      
      for (const record of records) {
        totalProcessed++;
        const data = JSON.parse(record.data);
        const filePath = data[fileField.id];
        
        if (!filePath || filePath === '' || filePath === '-') continue;
        
        try {
          // 해시 기반 썸네일 경로 생성
          const normalizedPath = path.isAbsolute(filePath) ? filePath : path.join(appDataDir, filePath);
          const context = { recordId: record.id, categoryId: record.categoryId, profileId: record.profileId || category.profileId };
          const thumbnailPath = getThumbnailPathForContext(normalizedPath, context).thumbnailPath;

          if (record.thumbnailPath && record.thumbnailPath === thumbnailPath && fs.existsSync(thumbnailPath)) {
            continue;
          }

          if (record.thumbnailPath && fs.existsSync(record.thumbnailPath) && record.thumbnailPath !== thumbnailPath) {
            ensureThumbnailDirForContext(normalizedPath, context);
            if (!fs.existsSync(thumbnailPath)) {
              fs.copyFileSync(record.thumbnailPath, thumbnailPath);
            }
          }

          if (!fs.existsSync(thumbnailPath)) {
            copyLegacyThumbnailToStructuredPath(normalizedPath, context);
          }
          
          // 썸네일 파일이 실제로 존재하는지 확인
          if (fs.existsSync(thumbnailPath)) {
            // DB에 썸네일 경로 저장
            db.prepare('UPDATE records SET thumbnailPath = ? WHERE id = ?').run(thumbnailPath, record.id);
            totalUpdated++;
            log(`썸네일 경로 업데이트: ${record.id} -> ${thumbnailPath}`);
          }
        } catch (error) {
          log(`썸네일 경로 업데이트 실패: ${record.id}`, error);
        }
      }
    }
    
    log('=== 썸네일 경로 마이그레이션 완료 ===', { totalProcessed, totalUpdated });
    return { success: true, totalProcessed, totalUpdated };
  } catch (error) {
    log('썸네일 경로 마이그레이션 중 오류:', error);
    return { success: false, error: error.message };
  }
});

// 썸네일 동기화 점검/정리 핸들러
ipcMain.handle('checkThumbnailSync', async () => {
  try {
    log('=== 썸네일 동기화 점검 시작 ===');
    
    const results = {
      totalRecords: 0,
      dbOnly: [], // DB에만 있고 파일이 없는 경우
      fileOnly: [], // 파일만 있고 DB에 없는 경우
      bothExist: 0, // 둘 다 있는 경우
      neitherExist: 0 // 둘 다 없는 경우
    };
    
    // 모든 카테고리 조회
    const categories = db.prepare('SELECT id, fields, profileId FROM categories').all();
    
    for (const category of categories) {
      const fields = JSON.parse(category.fields);
      const fileField = fields.find(f => f.type === 'file');
      
      if (!fileField) continue;
      
      // 해당 카테고리의 모든 레코드 조회
      const records = db.prepare('SELECT id, data, thumbnailPath, categoryId, profileId FROM records WHERE categoryId = ?').all(category.id);
      
      for (const record of records) {
        results.totalRecords++;
        const data = JSON.parse(record.data);
        const filePath = data[fileField.id];
        
        if (!filePath || filePath === '' || filePath === '-') {
          results.neitherExist++;
          continue;
        }
        
        // 해시 기반 썸네일 경로
        const normalizedPath = path.isAbsolute(filePath) ? filePath : path.join(appDataDir, filePath);
        const context = { recordId: record.id, categoryId: record.categoryId, profileId: record.profileId || category.profileId };
        const hashPath = getThumbnailPathForContext(normalizedPath, context).thumbnailPath;
        const legacyPath = getLegacyThumbnailPath(normalizedPath);
        
        const dbExists = record.thumbnailPath && fs.existsSync(record.thumbnailPath);
        const hashExists = fs.existsSync(hashPath) || fs.existsSync(legacyPath);
        
        if (dbExists && hashExists) {
          results.bothExist++;
        } else if (dbExists && !hashExists) {
          results.dbOnly.push({
            recordId: record.id,
            dbPath: record.thumbnailPath,
            filePath: filePath
          });
        } else if (!dbExists && hashExists) {
          results.fileOnly.push({
            recordId: record.id,
            hashPath: hashPath,
            filePath: filePath
          });
        } else {
          results.neitherExist++;
        }
      }
    }
    
    log('=== 썸네일 동기화 점검 완료 ===');
    log(`총 레코드: ${results.totalRecords}`);
    log(`DB에만 존재: ${results.dbOnly.length}`);
    log(`파일에만 존재: ${results.fileOnly.length}`);
    log(`둘 다 존재: ${results.bothExist}`);
    log(`둘 다 없음: ${results.neitherExist}`);
    
    return results;
  } catch (error) {
    log('Error checking thumbnail sync:', error);
    throw error;
  }
});

// 썸네일 동기화 정리 핸들러
ipcMain.handle('cleanupThumbnailSync', async (event, options = {}) => {
  try {
    log('=== 썸네일 동기화 정리 시작 ===');
    
    const { 
      removeDbOnly = true, // DB에만 있고 파일이 없으면 DB에서 제거
      addFileOnly = true,  // 파일만 있고 DB에 없으면 DB에 추가
      dryRun = false       // 실제 변경하지 않고 시뮬레이션만
    } = options;
    
    const results = {
      removedFromDb: 0,
      addedToDb: 0,
      errors: []
    };
    
    // 모든 카테고리 조회
    const categories = db.prepare('SELECT id, fields, profileId FROM categories').all();
    
    for (const category of categories) {
      const fields = JSON.parse(category.fields);
      const fileField = fields.find(f => f.type === 'file');
      
      if (!fileField) continue;
      
      // 해당 카테고리의 모든 레코드 조회
      const records = db.prepare('SELECT id, data, thumbnailPath, categoryId, profileId FROM records WHERE categoryId = ?').all(category.id);
      
      for (const record of records) {
        const data = JSON.parse(record.data);
        const filePath = data[fileField.id];
        
        if (!filePath || filePath === '' || filePath === '-') continue;
        
        // 해시 기반 썸네일 경로
        const normalizedPath = path.isAbsolute(filePath) ? filePath : path.join(appDataDir, filePath);
        const context = { recordId: record.id, categoryId: record.categoryId, profileId: record.profileId || category.profileId };
        const hashPath = getThumbnailPathForContext(normalizedPath, context).thumbnailPath;
        const legacyPath = getLegacyThumbnailPath(normalizedPath);
        
        const dbExists = record.thumbnailPath && fs.existsSync(record.thumbnailPath);
        let hashExists = fs.existsSync(hashPath);
        if (!hashExists && fs.existsSync(legacyPath)) {
          hashExists = !!copyLegacyThumbnailToStructuredPath(normalizedPath, context);
        }
        
        try {
          if (removeDbOnly && dbExists && !hashExists) {
            // DB에만 있고 파일이 없으면 DB에서 제거
            if (!dryRun) {
              db.prepare('UPDATE records SET thumbnailPath = NULL WHERE id = ?').run(record.id);
            }
            results.removedFromDb++;
            log(`DB에서 썸네일 경로 제거: ${record.id}`);
          } else if (addFileOnly && !dbExists && hashExists) {
            // 파일만 있고 DB에 없으면 DB에 추가
            if (!dryRun) {
              db.prepare('UPDATE records SET thumbnailPath = ? WHERE id = ?').run(hashPath, record.id);
            }
            results.addedToDb++;
            log(`DB에 썸네일 경로 추가: ${record.id} -> ${hashPath}`);
          }
        } catch (error) {
          results.errors.push({
            recordId: record.id,
            error: error.message
          });
          log(`정리 중 오류: ${record.id}`, error);
        }
      }
    }
    
    log('=== 썸네일 동기화 정리 완료 ===');
    log(`DB에서 제거: ${results.removedFromDb}`);
    log(`DB에 추가: ${results.addedToDb}`);
    log(`오류: ${results.errors.length}`);
    
    return results;
  } catch (error) {
    log('Error cleaning up thumbnail sync:', error);
    throw error;
  }
});
