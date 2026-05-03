import type { Category, NewCategory, CategoryUpdate, DataRecord, NewRecord, TableData, Config, Profile } from './index';

export interface ElectronAPI {
  // Database viewer methods
  getTables: () => Promise<{ name: string }[]>;
  getTableData: (tableName: string) => Promise<TableData>;
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
  setRememberWindowBounds: (enabled: boolean) => Promise<{ success: boolean }>;
  setZoomPercent: (percent: number) => Promise<{ success: boolean; error?: string }>;
  setAppPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  setDateParseFormats: (formats: string[]) => Promise<{ success: boolean; dateParseFormats?: string[]; error?: string }>;
  clearAppPassword: () => Promise<{ success: boolean; error?: string }>;
  verifyAppPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  setVideoSeekSeconds: (seconds: number) => Promise<{ success: boolean; error?: string }>;
  setVideoAutoPlay: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  setListThumbnailFit: (fit: 'cover' | 'contain') => Promise<{ success: boolean; error?: string }>;
  setThumbnailPreviewScale: (scale: number) => Promise<{ success: boolean; error?: string }>;

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
  
  // New method
  send: (channel: string, ...args: any[]) => void;

  // New method
  getVideoDuration: (filePath: string) => Promise<number | null>;

  // New method
  getVideoCodecInfo: (filePath: string) => Promise<{ video?: { codec?: string; profile?: string; pix_fmt?: string }; audio?: { codec?: string; sample_rate?: string; channels?: number }; hasEmbeddedCover?: boolean; error?: string }>;
  removeCustomThumbnail: (filePath: string) => Promise<boolean>;

  // Bookmark methods
  getBookmarks: (categoryId: string, recordId: string) => Promise<{ success: boolean; bookmarks?: { time: number; createdAt: string }[]; error?: string }>;
  addBookmark: (categoryId: string, recordId: string, time: number) => Promise<{ success: boolean; bookmark?: { time: number; createdAt: string }; error?: string }>;
  removeBookmark: (categoryId: string, recordId: string, time: number) => Promise<{ success: boolean; error?: string }>;
  removeAllBookmarks: (categoryId: string, recordId: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
