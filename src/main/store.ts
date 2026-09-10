import { app, BrowserWindow } from 'electron';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';
import XLSX from 'xlsx';
import { format, isValid, parse } from 'date-fns';

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
export const logPath = path.join(app.getPath('userData'), 'app.log');
export const logStream = fs.createWriteStream(logPath, { flags: 'a' });

function getArgValue(prefix) {
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : '';
}

function getIsolatedRendererUrl() {
  const fromEnv = String(process.env.VITE_DEV_SERVER_URL || '').trim();
  return fromEnv || getArgValue('--smoke-url=');
}

function getOverrideDataDir() {
  const fromEnv = String(process.env.LOCAL_ERP_DATA_DIR || '').trim();
  const fromArg = getArgValue('--data-dir=');
  const override = fromEnv || fromArg;
  return override ? path.resolve(override) : '';
}

// 데이터베이스 및 백업 경로 설정
export const isolatedRendererUrl = getIsolatedRendererUrl();
export const isDev = process.env.VITE_DEV_SERVER_URL;
export const isPreview = process.env.ELECTRON === 'true' || process.env.npm_lifecycle_event === 'electron:preview';

// 개발 환경에서는 프로젝트 루트의 save 폴더 사용, 빌드된 앱에서는 Local 경로 사용 (용량 제한 없음)
export const projectRoot = isDev ? path.resolve(__dirname, '..') : path.join(os.homedir(), 'AppData', 'Local');
export const appDataDir = getOverrideDataDir() || path.join(projectRoot, isDev ? 'save' : 'Local ERP');
export const dbPath = path.join(appDataDir, 'erp.db');
export const backupDir = path.join(path.join(os.homedir(), 'AppData', 'Local'), 'backups');
export const configPath = path.join(app.getPath('userData'), 'config.json');
export const DEFAULT_TRANSLATION_MODEL = 'gpt-5.6-luna';
export const SUPPORTED_TRANSLATION_MODELS = new Set([
  DEFAULT_TRANSLATION_MODEL,
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-4.1-mini'
]);

export const defaultConfig = {
  backupDir,
  backupInterval: 60,
  backupEnabled: true,
  rememberWindowBounds: false,
  muteAudioWhenBackgrounded: false,
  windowBounds: null,
  passwordHash: null,
  passwordLockMaxAttempts: 5,
  passwordLockDurationMinutes: 1,
  passwordFailedAttempts: 0,
  passwordLockUntil: null,
  openAiApiKey: '',
  translationTargetLanguage: 'ko',
  translationModel: DEFAULT_TRANSLATION_MODEL,
  videoSeekSeconds: 5,
  videoAutoPlay: true,
  listThumbnailFit: 'cover',
  videoHoverPreviewEnabled: true,
  zoomPercent: 100,
  thumbnailPreviewScale: 100,
  defaultGalleryZoom: 100,
  dateParseFormats: null,
  idleLockMinutes: 0
};

export let appConfig = { ...defaultConfig };
export let currentProfileId = null;

export function setCurrentProfileId(id) {
  currentProfileId = id;
}

export const DEFAULT_PROFILE_COLOR = '#5865F2';
export const DEFAULT_DATE_PARSE_FORMATS = [
  'yyyy-MM-dd',
  'yyyy.MM.dd',
  'yyyy. MM. dd',
  'yyyy/MM/dd',
  'MM/dd/yyyy',
  'MM-dd-yyyy',
  'MM/dd/yy',
  'MM-dd-yy',
  'yy-MM-dd',
  'yy.MM.dd',
  'yy/MM/dd',
  'yyyy-MM',
  'yyyy.MM',
  'yyyy/MM',
  'yyyyMMdd',
  'yyMMdd'
];

// save 폴더가 없으면 생성
if (!fs.existsSync(appDataDir)) {
  fs.mkdirSync(appDataDir, { recursive: true });
}

// 백업 폴더가 없으면 생성
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

export function loadAppConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      appConfig = { ...defaultConfig, ...savedConfig };
    }
  } catch (error) {
    console.error('Failed to load app config:', error);
  }
}

export function saveAppConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save app config:', error);
  }
}

export function normalizeZoomPercent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.min(200, Math.max(50, Math.round(numericValue)));
}

export function getConfiguredZoomPercent() {
  return normalizeZoomPercent(appConfig.zoomPercent) ?? 100;
}

export function normalizeThumbnailPreviewScale(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.min(200, Math.max(75, Math.round(numericValue)));
}

export function getConfiguredThumbnailPreviewScale() {
  return normalizeThumbnailPreviewScale(appConfig.thumbnailPreviewScale) ?? 100;
}

export function normalizeDefaultGalleryZoom(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.min(200, Math.max(50, Math.round(numericValue / 10) * 10));
}

export function getConfiguredDefaultGalleryZoom() {
  return normalizeDefaultGalleryZoom(appConfig.defaultGalleryZoom) ?? 100;
}

export function normalizeTranslationTargetLanguage(value) {
  const normalizedValue = String(value || '').trim();
  const supportedLanguages = ['ko', 'en', 'ja', 'zh-CN', 'zh-TW'];
  return supportedLanguages.includes(normalizedValue) ? normalizedValue : 'ko';
}

export function getConfiguredTranslationTargetLanguage() {
  return normalizeTranslationTargetLanguage(appConfig.translationTargetLanguage);
}

export function normalizeTranslationModel(value) {
  const normalizedValue = String(value || '').trim();
  return SUPPORTED_TRANSLATION_MODELS.has(normalizedValue)
    ? normalizedValue
    : DEFAULT_TRANSLATION_MODEL;
}

export function getConfiguredTranslationModel() {
  return normalizeTranslationModel(appConfig.translationModel);
}

export function normalizeBackupInterval(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return Math.min(10080, Math.max(1, Math.floor(numericValue)));
}

export function getConfiguredBackupInterval() {
  return normalizeBackupInterval(appConfig.backupInterval) ?? 60;
}

export function getConfiguredBackupDir() {
  const configuredPath = String(appConfig.backupDir || '').trim();
  return configuredPath ? path.resolve(configuredPath) : backupDir;
}

export function normalizePasswordLockMaxAttempts(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return Math.min(20, Math.max(1, Math.floor(numericValue)));
}

export function normalizePasswordLockDurationMinutes(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return Math.min(1440, Math.max(1, Math.floor(numericValue)));
}

export function getConfiguredPasswordLockMaxAttempts() {
  return normalizePasswordLockMaxAttempts(appConfig.passwordLockMaxAttempts) ?? 5;
}

export function getConfiguredPasswordLockDurationMinutes() {
  return normalizePasswordLockDurationMinutes(appConfig.passwordLockDurationMinutes) ?? 1;
}

export function normalizeIdleLockMinutes(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  const rounded = Math.floor(numericValue);
  if (rounded <= 0) return 0;
  return Math.min(1440, rounded);
}

export function getConfiguredIdleLockMinutes() {
  return normalizeIdleLockMinutes(appConfig.idleLockMinutes) ?? 0;
}

export function getPasswordLockUntil() {
  const lockUntil = Number(appConfig.passwordLockUntil);
  return Number.isFinite(lockUntil) && lockUntil > Date.now() ? lockUntil : null;
}

export function resetPasswordLockState() {
  appConfig.passwordFailedAttempts = 0;
  appConfig.passwordLockUntil = null;
}

export function getTranslationLanguageLabel(language) {
  switch (normalizeTranslationTargetLanguage(language)) {
    case 'en':
      return 'English';
    case 'ja':
      return 'Japanese';
    case 'zh-CN':
      return 'Simplified Chinese';
    case 'zh-TW':
      return 'Traditional Chinese';
    case 'ko':
    default:
      return 'Korean';
  }
}

export function normalizeDateParseFormats(value) {
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

export function normalizeDateParseFormat(dateFormat) {
  return String(dateFormat || '')
    .trim()
    .replace(/Y/g, 'y')
    .replace(/D/g, 'd');
}

export function getDateParseFormats(customFormats = []) {
  const seen = new Set();
  const configuredFormats = [
    ...DEFAULT_DATE_PARSE_FORMATS,
    ...customFormats
  ];
  return configuredFormats
    .map(normalizeDateParseFormat)
    .filter((dateFormat) => {
      if (!dateFormat || seen.has(dateFormat)) return false;
      seen.add(dateFormat);
      return true;
    });
}

export function getStoredDateOutputFormat(dateFormat) {
  return /d/.test(normalizeDateParseFormat(dateFormat)) ? 'yyyy-MM-dd' : 'yyyy-MM';
}

export function extractResponseText(responseBody) {
  if (typeof responseBody?.output_text === 'string' && responseBody.output_text.trim()) {
    return responseBody.output_text.trim();
  }

  if (Array.isArray(responseBody?.output)) {
    const textParts = [];
    responseBody.output.forEach((item) => {
      if (!Array.isArray(item?.content)) return;
      item.content.forEach((content) => {
        if (content?.type === 'output_text' && typeof content?.text === 'string') {
          textParts.push(content.text);
        }
      });
    });

    if (textParts.length > 0) {
      return textParts.join('\n').trim();
    }
  }

  return '';
}

export async function translateTextWithOpenAi(text, targetLanguage, model) {
  const apiKey = String(appConfig.openAiApiKey || '').trim();
  if (!apiKey) {
    throw new Error('OpenAI API 키가 설정되지 않았습니다.');
  }

  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    return '';
  }

  const languageLabel = getTranslationLanguageLabel(targetLanguage);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: normalizeTranslationModel(model),
        store: false,
        input: `Detect the source language automatically and translate the text into ${languageLabel}.\nReturn only the translated text.\nDo not add explanations, labels, notes, or quotation marks.\nIf the input is already in ${languageLabel}, return it unchanged.\n\nText:\n${normalizedText}`
      }),
      signal: controller.signal
    });

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      const apiError = responseBody?.error?.message || `OpenAI API 요청에 실패했습니다. (${response.status})`;
      const error: any = new Error(apiError);
      error.status = response.status;
      error.code = responseBody?.error?.code;
      error.type = responseBody?.error?.type;
      throw error;
    }

    const translatedText = extractResponseText(responseBody);
    if (!translatedText) {
      throw new Error('번역 결과를 읽지 못했습니다.');
    }

    return translatedText;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('번역 요청 시간이 초과되었습니다.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function normalizeImportedDateValue(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return '';
  }

  if (rawValue instanceof Date && isValid(rawValue)) {
    return format(rawValue, 'yyyy-MM-dd');
  }

  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    const parsedDateCode = XLSX.SSF.parse_date_code(rawValue);
    if (parsedDateCode && parsedDateCode.y && parsedDateCode.m && parsedDateCode.d) {
      const parsedDate = new Date(parsedDateCode.y, parsedDateCode.m - 1, parsedDateCode.d);
      if (
        isValid(parsedDate) &&
        parsedDate.getFullYear() === parsedDateCode.y &&
        parsedDate.getMonth() === parsedDateCode.m - 1 &&
        parsedDate.getDate() === parsedDateCode.d
      ) {
        return format(parsedDate, 'yyyy-MM-dd');
      }
    }
  }

  const text = String(rawValue).trim();
  if (!text) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text) || /^\d{4}-\d{2}$/.test(text)) {
    return text;
  }

  const supportedFullDatePatterns = [
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/,
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/
  ];

  for (const pattern of supportedFullDatePatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const [, yearStr, monthStr, dayStr] = match;
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const parsedDate = new Date(year, month - 1, day);

    if (
      year >= 1900 &&
      year <= 2100 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31 &&
      isValid(parsedDate) &&
      parsedDate.getFullYear() === year &&
      parsedDate.getMonth() === month - 1 &&
      parsedDate.getDate() === day
    ) {
      return `${yearStr.padStart(4, '0')}-${monthStr.padStart(2, '0')}-${dayStr.padStart(2, '0')}`;
    }

    return text;
  }

  const supportedYearMonthPatterns = [
    /^(\d{4})-(\d{1,2})$/,
    /^(\d{4})\.(\d{1,2})$/,
    /^(\d{4})\/(\d{1,2})$/
  ];

  for (const pattern of supportedYearMonthPatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const [, yearStr, monthStr] = match;
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12) {
      return `${yearStr}-${monthStr.padStart(2, '0')}`;
    }
    return text;
  }

  for (const dateFormat of getDateParseFormats(normalizeDateParseFormats(appConfig.dateParseFormats) ?? [])) {
    try {
      const parsedDate = parse(text, dateFormat, new Date());
      if (isValid(parsedDate)) {
        return format(parsedDate, getStoredDateOutputFormat(dateFormat));
      }
    } catch (error) {
      // Ignore invalid format tokens and continue trying other formats.
    }
  }

  return text;
}

export function applyWindowZoom(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return;

  const zoomFactor = getConfiguredZoomPercent() / 100;
  targetWindow.webContents.setZoomLevel(0);
  targetWindow.webContents.setZoomFactor(zoomFactor);
}

export const PASSWORD_SCRYPT_PREFIX = 'scrypt$v1';
export const PASSWORD_SCRYPT_KEY_LENGTH = 64;
export const PASSWORD_SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024
};

export function hashLegacyPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

export function derivePasswordKey(password, salt): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      String(password),
      salt,
      PASSWORD_SCRYPT_KEY_LENGTH,
      PASSWORD_SCRYPT_OPTIONS,
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

export async function createPasswordHash(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await derivePasswordKey(password, salt);
  return `${PASSWORD_SCRYPT_PREFIX}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export function timingSafeBufferEqual(actual, expected) {
  return actual.length === expected.length && crypto.timingSafeEqual(actual as Buffer, expected as Buffer);
}

export async function verifyStoredPassword(password, storedHash) {
  const normalizedHash = String(storedHash || '');
  if (normalizedHash.startsWith(`${PASSWORD_SCRYPT_PREFIX}$`)) {
    const parts = normalizedHash.split('$');
    if (
      parts.length !== 4
      || !/^[a-f0-9]{32}$/i.test(parts[2])
      || !/^[a-f0-9]{128}$/i.test(parts[3])
    ) {
      return { valid: false, needsUpgrade: false };
    }

    const salt = Buffer.from(parts[2], 'hex');
    const expectedKey = Buffer.from(parts[3], 'hex');
    const actualKey = await derivePasswordKey(password, salt);
    return {
      valid: timingSafeBufferEqual(actualKey, expectedKey),
      needsUpgrade: false
    };
  }

  if (/^[a-f0-9]{64}$/i.test(normalizedHash)) {
    const actualHash = Buffer.from(hashLegacyPassword(password), 'hex');
    const expectedHash = Buffer.from(normalizedHash, 'hex');
    return {
      valid: timingSafeBufferEqual(actualHash, expectedHash),
      needsUpgrade: true
    };
  }

  return { valid: false, needsUpgrade: false };
}

export function getCurrentProfileIdOrThrow() {
  if (!currentProfileId) {
    throw new Error('Profile is not selected.');
  }

  return currentProfileId;
}

export function getProfileById(profileId) {
  return db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId) || null;
}

export function ensureCurrentProfileExists() {
  if (!currentProfileId) return null;

  const profile = getProfileById(currentProfileId);
  if (!profile) {
    currentProfileId = null;
    return null;
  }

  return profile;
}

export function getScopedCategory(categoryId, profileId = getCurrentProfileIdOrThrow()) {
  return db.prepare('SELECT * FROM categories WHERE id = ? AND profileId = ?').get(categoryId, profileId) || null;
}

export function getScopedRecord(recordId, profileId = getCurrentProfileIdOrThrow()) {
  return db.prepare('SELECT * FROM records WHERE id = ? AND profileId = ?').get(recordId, profileId) || null;
}

export function ensureCategoryBelongsToCurrentProfile(categoryId) {
  const category = getScopedCategory(categoryId);
  if (!category) {
    throw new Error('Category not found in current profile.');
  }

  return category;
}

export function getCategorySubtreeIds(rootCategoryId, profileId) {
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

export function getSqlPlaceholders(count) {
  return Array.from({ length: count }, () => '?').join(', ');
}

export function ensureRecordBelongsToCurrentProfile(recordId) {
  const record = getScopedRecord(recordId);
  if (!record) {
    throw new Error('Record not found in current profile.');
  }

  return record;
}

export function createProfile(name, avatarColor = DEFAULT_PROFILE_COLOR) {
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

export function ensureDefaultProfile() {
  const existingProfile = db.prepare('SELECT * FROM profiles ORDER BY createdAt ASC LIMIT 1').get();
  if (existingProfile) {
    return existingProfile;
  }

  return createProfile('기본 프로필', DEFAULT_PROFILE_COLOR);
}

loadAppConfig();

// 로깅 함수
export function log(message, data: any = '') {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message} ${data ? JSON.stringify(data) : ''}\n`;
  logStream.write(logMessage);
  console.log(logMessage);
}

// 데이터베이스 연결 설정
export const db: any = new Database(dbPath, { verbose: log });

// SQLite 설정
db.exec('PRAGMA encoding = "UTF-8"');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');
