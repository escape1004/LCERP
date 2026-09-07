import type { Category, NewCategory, CategoryUpdate, DataRecord, NewRecord, TableData, Config, Profile, AppUpdateState } from './index';

export interface TranslateTextPayload {
  text: string;
  targetLanguage: string;
}

export interface TranslateTextResult {
  success: boolean;
  translatedText?: string;
  model?: string;
  error?: string;
  errorCode?: string;
  errorType?: string;
  status?: number;
}

export interface ElectronAPI {
  getAppUpdateState: () => Promise<AppUpdateState>;
  checkForAppUpdates: () => Promise<AppUpdateState>;
  downloadAppUpdate: () => Promise<AppUpdateState>;
  installAppUpdate: () => Promise<{ success: boolean; error?: string }>;
  onAppUpdateState: (callback: (state: AppUpdateState) => void) => () => void;
  // Database viewer methods
  getTables: () => Promise<{ name: string }[]>;
  getTableData: (tableName: string, options?: { page?: number; pageSize?: number }) => Promise<TableData>;
  getDbPath: () => Promise<string>;
  openDbFile: () => Promise<void>;
  
  // Category methods
  getCategories: () => Promise<Category[]>;
  addCategory: (category: NewCategory) => Promise<string>;
  updateCategory: (id: string, updates: CategoryUpdate) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  moveCategoryToProfile: (categoryId: string, targetProfileId: string) => Promise<{ success: boolean; error?: string }>;
  exportCategoryRecords: (categoryId: string, format: 'csv' | 'xlsx') => Promise<{ success: boolean; canceled?: boolean; path?: string; recordCount?: number; format?: 'csv' | 'xlsx'; error?: string }>;
  importCategoryRecords: (categoryId: string, format: 'csv' | 'xlsx') => Promise<{ success: boolean; canceled?: boolean; path?: string; importedCount?: number; duplicateCount?: number; skippedCount?: number; unresolvedRelationCount?: number; duplicateFields?: string[]; format?: 'csv' | 'xlsx'; error?: string }>;
  
  // Record methods
  getRecords: (categoryId: string) => Promise<DataRecord[]>;
  addRecord: (record: NewRecord) => Promise<string>;
  updateRecord: (id: string, data: any) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  
  // Backup methods
  backupDatabase: () => Promise<{ success: boolean; path?: string; error?: string }>;
  openBackupLocation: () => Promise<{ success: boolean; error?: string }>;
  resetDatabase: () => Promise<{ success: boolean; backupPath?: string; error?: string }>;
  
  // Config methods
  getConfig: () => Promise<Config>;
  setDbPath: () => Promise<{ success: boolean; path?: string; error?: string }>;
  setBackupDir: () => Promise<{ success: boolean; path?: string; error?: string }>;
  setBackupInterval: (minutes: number) => Promise<{ success: boolean; error?: string }>;
  setBackupEnabled: (enabled: boolean) => Promise<{ success: boolean; backupEnabled?: boolean; error?: string }>;
  setRememberWindowBounds: (enabled: boolean) => Promise<{ success: boolean }>;
  setMuteAudioWhenBackgrounded: (enabled: boolean) => Promise<{ success: boolean }>;
  setPictureInPictureActive: (active: boolean) => Promise<{ success: boolean }>;
  setZoomPercent: (percent: number) => Promise<{ success: boolean; error?: string }>;
  setAppPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  setPasswordLockSettings: (maxAttempts: number, durationMinutes: number) => Promise<{ success: boolean; passwordLockMaxAttempts?: number; passwordLockDurationMinutes?: number; error?: string }>;
  setIdleLockMinutes: (minutes: number) => Promise<{ success: boolean; idleLockMinutes?: number; error?: string }>;
  setDateParseFormats: (formats: string[]) => Promise<{ success: boolean; dateParseFormats?: string[]; error?: string }>;
  clearAppPassword: () => Promise<{ success: boolean; error?: string }>;
  verifyAppPassword: (password: string) => Promise<{ success: boolean; locked?: boolean; lockUntil?: number; remainingMs?: number; remainingAttempts?: number; error?: string }>;
  setVideoSeekSeconds: (seconds: number) => Promise<{ success: boolean; error?: string }>;
  setVideoAutoPlay: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  setListThumbnailFit: (fit: 'cover' | 'contain') => Promise<{ success: boolean; error?: string }>;
  setVideoHoverPreviewEnabled: (enabled: boolean) => Promise<{ success: boolean; videoHoverPreviewEnabled?: boolean; error?: string }>;
  setThumbnailPreviewScale: (scale: number) => Promise<{ success: boolean; error?: string }>;
  setDefaultGalleryZoom: (scale: number) => Promise<{ success: boolean; defaultGalleryZoom?: number; error?: string }>;
  setTranslationTargetLanguage: (language: string) => Promise<{ success: boolean; translationTargetLanguage?: string; error?: string }>;
  setTranslationModel: (model: string) => Promise<{ success: boolean; translationModel?: string; error?: string }>;
  setOpenAiApiKey: (apiKey: string) => Promise<{ success: boolean; hasOpenAiApiKey?: boolean; error?: string }>;
  clearOpenAiApiKey: () => Promise<{ success: boolean; hasOpenAiApiKey?: boolean; error?: string }>;
  translateText: (payload: TranslateTextPayload) => Promise<TranslateTextResult>;

  // Profile methods
  getProfiles: () => Promise<Profile[]>;
  getCurrentProfile: () => Promise<Profile | null>;
  selectProfile: (profileId: string) => Promise<{ success: boolean; profile?: Profile; error?: string }>;
  clearCurrentProfile: () => Promise<{ success: boolean }>;
  createProfile: (payload: { name: string; avatarColor?: string }) => Promise<{ success: boolean; profile?: Profile; error?: string }>;
  updateProfile: (profileId: string, updates: { name?: string; avatarColor?: string }) => Promise<{ success: boolean; profile?: Profile; error?: string }>;
  deleteProfile: (profileId: string) => Promise<{ success: boolean; error?: string }>;
  
  // File dialog methods
  openFileDialog: (defaultPath?: string) => Promise<{ canceled: boolean; filePaths: string[] }>;
  openDirectoryDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  openImageFileDialog: (defaultPath?: string) => Promise<{ canceled: boolean; filePaths: string[] }>;
  getAppRoot: () => Promise<string>;

  // Utility methods
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  getFileSize: (filePath: string) => Promise<{ success: boolean; size?: string; error?: string }>;
  getDashboardWarnings: (previewLimit?: number) => Promise<{
    totalCount: number;
    counts: {
      missingFiles: number;
      brokenRelations: number;
    };
    items: Array<{
      id: string;
      categoryId: string;
      recordId: string;
      title: string;
      description: string;
      type: 'missing-file' | 'broken-relation';
    }>;
  }>;
  incrementRecordViewCount: (categoryId: string, recordId: string) => Promise<{ success: boolean; error?: string }>;
  getRecordViewCounts: () => Promise<Array<{ recordId: string; categoryId: string; viewCount: number }>>;

  send: (channel: string, ...args: any[]) => void;
  onRandomRecordShortcut: (callback: () => void) => () => void;
  getVideoSubtitles: (filePath: string) => Promise<Array<{ id: string; name: string; content: string }>>;
  getVideoDuration: (filePath: string) => Promise<number | null>;
  getVideoCodecInfo: (filePath: string) => Promise<{ video?: { codec?: string; profile?: string; pix_fmt?: string }; audio?: { codec?: string; sample_rate?: string; channels?: number }; hasEmbeddedCover?: boolean; error?: string }>;
  removeCustomThumbnail: (filePath: string) => Promise<boolean>;

  // Bookmark methods
  getBookmarks: (categoryId: string, recordId: string) => Promise<{ success: boolean; bookmarks?: { time: number; createdAt: string }[]; error?: string }>;
  addBookmark: (categoryId: string, recordId: string, time: number) => Promise<{ success: boolean; bookmark?: { time: number; createdAt: string }; error?: string }>;
  removeBookmark: (categoryId: string, recordId: string, time: number) => Promise<{ success: boolean; error?: string }>;
  removeAllBookmarks: (categoryId: string, recordId: string) => Promise<{ success: boolean; error?: string }>;
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

export {};
