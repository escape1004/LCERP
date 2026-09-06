export interface ThumbnailContext {
  recordId?: string;
  categoryId?: string;
  profileId?: string;
  thumbnailPath?: string;
}

export interface DashboardWarningItem {
  id: string;
  categoryId: string;
  recordId: string;
  title: string;
  description: string;
  type: 'missing-file' | 'broken-relation';
}

export interface DashboardWarningsResult {
  totalCount: number;
  counts: {
    missingFiles: number;
    brokenRelations: number;
  };
  items: DashboardWarningItem[];
}

export interface ElectronAPI {
  getTables: () => Promise<{ name: string }[]>;
  getTableData: (tableName: string, options?: { page?: number; pageSize?: number }) => Promise<TableData>;
  getDbPath: () => Promise<string>;
  openDbFile: () => Promise<void>;
  addCategory: (category: NewCategory) => Promise<string>;
  updateCategory: (id: string, updates: CategoryUpdate) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  moveCategoryToProfile: (categoryId: string, targetProfileId: string) => Promise<{ success: boolean; error?: string }>;
  exportCategoryRecords: (categoryId: string, format: 'csv' | 'xlsx') => Promise<{ success: boolean; canceled?: boolean; path?: string; recordCount?: number; format?: 'csv' | 'xlsx'; error?: string }>;
  importCategoryRecords: (categoryId: string, format: 'csv' | 'xlsx') => Promise<{ success: boolean; canceled?: boolean; path?: string; importedCount?: number; duplicateCount?: number; skippedCount?: number; unresolvedRelationCount?: number; duplicateFields?: string[]; format?: 'csv' | 'xlsx'; error?: string }>;
  getRecords: (categoryId: string) => Promise<DataRecord[]>;
  addRecord: (record: NewRecord) => Promise<string>;
  updateRecord: (id: string, data: Record<string, any>) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  exportCategory: (categoryId: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  importCategories: () => Promise<{ success: boolean; importedCount?: number; error?: string }>;
  getCategories: () => Promise<Category[]>;
  backupDatabase: () => Promise<{ success: boolean; path?: string; error?: string }>;
  resetDatabase: () => Promise<{ success: boolean; backupPath?: string; error?: string }>;
  openBackupLocation: () => Promise<{ success: boolean; error?: string }>;
  getConfig: () => Promise<any>;
  setDbPath: () => Promise<{ success: boolean; path?: string; error?: string }>;
  setBackupDir: () => Promise<{ success: boolean; path?: string; error?: string }>;
  setBackupInterval: (minutes: number) => Promise<{ success: boolean; error?: string }>;
  setBackupEnabled: (enabled: boolean) => Promise<{ success: boolean; backupEnabled?: boolean; error?: string }>;
  setRememberWindowBounds: (enabled: boolean) => Promise<{ success: boolean }>;
  setMuteAudioWhenBackgrounded: (enabled: boolean) => Promise<{ success: boolean }>;
  setZoomPercent: (percent: number) => Promise<{ success: boolean; error?: string }>;
  setDateParseFormats: (formats: string[]) => Promise<{ success: boolean; dateParseFormats?: string[]; error?: string }>;
  setAppPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  setPasswordLockSettings: (maxAttempts: number, durationMinutes: number) => Promise<{ success: boolean; passwordLockMaxAttempts?: number; passwordLockDurationMinutes?: number; error?: string }>;
  clearAppPassword: () => Promise<{ success: boolean; error?: string }>;
  verifyAppPassword: (password: string) => Promise<{ success: boolean; locked?: boolean; lockUntil?: number; remainingMs?: number; remainingAttempts?: number; error?: string }>;
  getProfiles: () => Promise<Profile[]>;
  getCurrentProfile: () => Promise<Profile | null>;
  selectProfile: (profileId: string) => Promise<{ success: boolean; profile?: Profile; error?: string }>;
  clearCurrentProfile: () => Promise<{ success: boolean }>;
  createProfile: (payload: { name: string; avatarColor?: string }) => Promise<{ success: boolean; profile?: Profile; error?: string }>;
  updateProfile: (profileId: string, updates: { name?: string; avatarColor?: string }) => Promise<{ success: boolean; profile?: Profile; error?: string }>;
  deleteProfile: (profileId: string) => Promise<{ success: boolean; error?: string }>;
  setVideoSeekSeconds: (seconds: number) => Promise<{ success: boolean; error?: string }>;
  setVideoAutoPlay: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  setListThumbnailFit: (fit: 'cover' | 'contain') => Promise<{ success: boolean; error?: string }>;
  setThumbnailPreviewScale: (scale: number) => Promise<{ success: boolean; error?: string }>;
  setDefaultGalleryZoom: (scale: number) => Promise<{ success: boolean; defaultGalleryZoom?: number; error?: string }>;
  setTranslationTargetLanguage: (language: string) => Promise<{ success: boolean; translationTargetLanguage?: string; error?: string }>;
  setTranslationModel: (model: string) => Promise<{ success: boolean; translationModel?: string; error?: string }>;
  setOpenAiApiKey: (apiKey: string) => Promise<{ success: boolean; hasOpenAiApiKey?: boolean; error?: string }>;
  clearOpenAiApiKey: () => Promise<{ success: boolean; hasOpenAiApiKey?: boolean; error?: string }>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  checkFileExists: (filePath: string) => Promise<boolean>;
  getDashboardWarnings: (previewLimit?: number) => Promise<DashboardWarningsResult>;
  incrementRecordViewCount: (categoryId: string, recordId: string) => Promise<{ success: boolean; error?: string }>;
  getRecordViewCounts: () => Promise<Array<{ recordId: string; categoryId: string; viewCount: number }>>;
  checkDuplicate: (categoryId: string, fieldId: string, value: any, recordId?: string) => Promise<{ isDuplicate: boolean }>;
  send: (channel: string, ...args: any[]) => void;
  onRandomRecordShortcut: (callback: () => void) => () => void;
  openFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  generateThumbnail: (filePath: string) => Promise<string | null>;
  getThumbnailDataUrl: (filePath: string) => Promise<string | null>;
  getThumbnailDataUrlHybrid: (record: any, filePath: string) => Promise<string | null>;
  getFileDataUrl: (filePath: string) => Promise<string | null>;
  getVideoStream: (filePath: string) => Promise<string | null>;
  getArchiveFiles: (filePath: string) => Promise<Array<{ name: string; size: number; isDirectory: boolean; comment: string }>>;
  openArchiveFile: (archivePath: string, fileName: string) => Promise<{ success: boolean; error?: string }>;
  getArchiveFileDataUrl: (filePath: string, fileName: string) => Promise<string | null>;
  getArchiveFileStreamInfo: (filePath: string, fileName: string) => Promise<string | null>;
  getArchiveFileText: (filePath: string, fileName: string) => Promise<string | null>;
  openFileDialog: (defaultPath?: string) => Promise<Electron.OpenDialogReturnValue>;
  openDirectoryDialog: () => Promise<Electron.OpenDialogReturnValue>;
  openImageFileDialog: (defaultPath?: string) => Promise<Electron.OpenDialogReturnValue>;
  getFileType: (filePath: string) => Promise<'image' | 'video' | 'archive' | 'other'>;
  getAppRoot: () => Promise<string>;
  getVideoBlobUrl: (filePath: string) => Promise<{ base64: string; mimeType: string } | null>;
  getVideoServerPort: () => Promise<number>;
  getFileSize: (filePath: string) => Promise<{ success: boolean; size?: string; error?: string }>;
  deleteThumbnail: (filePath: string, context?: ThumbnailContext) => Promise<boolean>;
  generateThumbnailWithTime: (filePath: string, timestampSec: number, context?: ThumbnailContext) => Promise<string | null>;
  regenerateThumbnail: (filePath: string, context?: ThumbnailContext) => Promise<string | null>;
  setCustomThumbnail: (filePath: string, imagePath: string, context?: ThumbnailContext) => Promise<string | null>;
  removeCustomThumbnail: (filePath: string, context?: ThumbnailContext) => Promise<boolean>;
  getVideoDuration: (filePath: string) => Promise<number | null>;
  getVideoCodecInfo: (filePath: string) => Promise<{ video?: { codec?: string; profile?: string; pix_fmt?: string }; audio?: { codec?: string; sample_rate?: string; channels?: number }; hasEmbeddedCover?: boolean; error?: string }>;
  getBookmarks: (categoryId: string, recordId: string) => Promise<{ success: boolean; bookmarks: { time: number; createdAt: string }[]; error?: string }>;
  addBookmark: (categoryId: string, recordId: string, time: number) => Promise<{ success: boolean; bookmark?: { time: number; createdAt: string }; error?: string }>;
  removeBookmark: (categoryId: string, recordId: string, time: number) => Promise<{ success: boolean; error?: string }>;
  translateText: (payload: { text: string; targetLanguage: string }) => Promise<{ success: boolean; translatedText?: string; model?: string; error?: string; errorCode?: string; errorType?: string; status?: number }>;
  migrateThumbnailPaths: () => Promise<{ success: boolean; totalProcessed?: number; totalUpdated?: number; error?: string }>;
  checkThumbnailSync: () => Promise<any>;
  cleanupThumbnailSync: (options?: any) => Promise<any>;
  cleanupOrphanThumbnails: () => Promise<{
    success: boolean;
    scannedFiles: number;
    deletedFiles: number;
    preservedFiles: number;
    skippedRecentFiles: number;
    skippedSymbolicLinks: number;
    reclaimedBytes: number;
    errors: Array<{ path: string; error: string }>;
    error?: string;
  }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export interface TableData {
  columns: Array<{ name: string; hidden: boolean }>;
  rows: any[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  fields: Field[];
  createdAt: string;
  updatedAt: string;
}

export interface Field {
  id: string;
  name: string;
  type: 'text' | 'number' | 'percentage' | 'select' | 'relation' | 'date' | 'file' | 'checkbox' | 'longtext';
  required: boolean;
  unique: boolean;
  order: number;
  enableTranslation?: boolean;
  textPrefix?: string;
  textSuffix?: string;
  pathMode?: 'direct' | 'base';
  basePath?: string;
  thumbnailOnly?: boolean;
  multiple?: boolean;
  options?: string[];
  relationCategoryId?: string;
  displayFieldId?: string;
  subDisplayFieldId?: string;
}

export interface DataRecord {
  id: string;
  categoryId: string;
  data: { [key: string]: any };
  createdAt: string;
  updatedAt: string;
  duration?: number;
  thumbnailPath?: string;
  thumbnailTimestamp?: number;
}

export interface NewCategory {
  name: string;
  parentId?: string;
  fields: Field[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryUpdate {
  name: string;
  parentId?: string;
  fields: Field[];
  order?: number;
}

export interface NewRecord {
  categoryId: string;
  data: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface Profile {
  id: string;
  name: string;
  avatarColor?: string;
  createdAt: string;
  updatedAt: string;
}

export {}; 
