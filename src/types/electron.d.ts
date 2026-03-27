import type { Category, NewCategory, CategoryUpdate, DataRecord, NewRecord, TableData, Config } from './index';

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
  
  // Record methods
  getRecords: (categoryId: string) => Promise<DataRecord[]>;
  addRecord: (record: NewRecord) => Promise<string>;
  updateRecord: (id: string, data: any) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  
  // Backup methods
  backupDatabase: () => Promise<{ success: boolean; path?: string; error?: string }>;
  openBackupLocation: () => Promise<{ success: boolean }>;
  
  // Config methods
  getConfig: () => Promise<Config>;
  setDbPath: () => Promise<{ success: boolean; path?: string }>;
  setBackupDir: () => Promise<{ success: boolean; path?: string }>;
  setBackupInterval: (minutes: number) => Promise<{ success: boolean }>;
  setRememberWindowBounds: (enabled: boolean) => Promise<{ success: boolean }>;
  setAppPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  clearAppPassword: () => Promise<{ success: boolean; error?: string }>;
  verifyAppPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  setVideoSeekSeconds: (seconds: number) => Promise<{ success: boolean; error?: string }>;
  setVideoAutoPlay: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  setListThumbnailFit: (fit: 'cover' | 'contain') => Promise<{ success: boolean; error?: string }>;
  
  // File dialog methods
  openFileDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  openDirectoryDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  getAppRoot: () => Promise<string>;

  // Utility methods
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  
  // New method
  send: (channel: string, ...args: any[]) => void;

  // New method
  getVideoDuration: (filePath: string) => Promise<number | null>;

  // New method
  getVideoCodecInfo: (filePath: string) => Promise<{ video?: { codec?: string; profile?: string; pix_fmt?: string }; audio?: { codec?: string; sample_rate?: string; channels?: number }; error?: string }>;

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
