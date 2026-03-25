export interface ElectronAPI {
  getTables: () => Promise<{ name: string }[]>;
  getTableData: (tableName: string) => Promise<TableData>;
  getDbPath: () => Promise<string>;
  openDbFile: () => Promise<void>;
  addCategory: (category: NewCategory) => Promise<string>;
  updateCategory: (id: string, updates: CategoryUpdate) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  getRecords: (categoryId: string) => Promise<DataRecord[]>;
  addRecord: (record: NewRecord) => Promise<string>;
  updateRecord: (id: string, data: Record<string, any>) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  exportCategory: (categoryId: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  importCategories: () => Promise<{ success: boolean; importedCount?: number; error?: string }>;
  getCategories: () => Promise<Category[]>;
  backupDatabase: () => Promise<{ success: boolean; path?: string; error?: string }>;
  resetDatabase: () => Promise<{ success: boolean; backupPath?: string; error?: string }>;
  openBackupLocation: () => Promise<{ success: boolean }>;
  getConfig: () => Promise<any>;
  setDbPath: () => Promise<{ success: boolean; path?: string }>;
  setBackupDir: () => Promise<{ success: boolean; path?: string }>;
  setBackupInterval: (minutes: number) => Promise<{ success: boolean }>;
  setRememberWindowBounds: (enabled: boolean) => Promise<{ success: boolean }>;
  setAppPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  clearAppPassword: () => Promise<{ success: boolean; error?: string }>;
  verifyAppPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  setVideoSeekSeconds: (seconds: number) => Promise<{ success: boolean; error?: string }>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  checkFileExists: (filePath: string) => Promise<boolean>;
  checkDuplicate: (categoryId: string, fieldId: string, value: any, recordId?: string) => Promise<{ isDuplicate: boolean }>;
  send: (channel: string, ...args: any[]) => void;
  openFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  generateThumbnail: (filePath: string) => Promise<string | null>;
  getThumbnailDataUrl: (filePath: string) => Promise<string | null>;
  getThumbnailDataUrlHybrid: (record: any, filePath: string) => Promise<string | null>;
  getFileDataUrl: (filePath: string) => Promise<string | null>;
  getVideoStream: (filePath: string) => Promise<string | null>;
  getArchiveFiles: (filePath: string) => Promise<Array<{ name: string; size: number; isDirectory: boolean; comment: string }>>;
  getArchiveFileDataUrl: (filePath: string, fileName: string) => Promise<string | null>;
  getArchiveFileStreamInfo: (filePath: string, fileName: string) => Promise<string | null>;
  getArchiveFileText: (filePath: string, fileName: string) => Promise<string | null>;
  openFileDialog: () => Promise<Electron.OpenDialogReturnValue>;
  openDirectoryDialog: () => Promise<Electron.OpenDialogReturnValue>;
  openImageFileDialog: () => Promise<Electron.OpenDialogReturnValue>;
  getFileType: (filePath: string) => Promise<'image' | 'video' | 'archive' | 'other'>;
  getAppRoot: () => Promise<string>;
  getVideoBlobUrl: (filePath: string) => Promise<{ base64: string; mimeType: string } | null>;
  getVideoServerPort: () => Promise<number>;
  getFileSize: (filePath: string) => Promise<{ success: boolean; size?: string; error?: string }>;
  deleteThumbnail: (filePath: string) => Promise<boolean>;
  generateThumbnailWithTime: (filePath: string, timestampSec: number) => Promise<string | null>;
  regenerateThumbnail: (filePath: string) => Promise<string | null>;
  setCustomThumbnail: (filePath: string, imagePath: string) => Promise<string | null>;
  getVideoDuration: (filePath: string) => Promise<number | null>;
  getVideoCodecInfo: (filePath: string) => Promise<{ video?: { codec?: string; profile?: string; pix_fmt?: string }; audio?: { codec?: string; sample_rate?: string; channels?: number }; error?: string }>;
  getBookmarks: (categoryId: string, recordId: string) => Promise<{ success: boolean; bookmarks: { time: number; createdAt: string }[]; error?: string }>;
  addBookmark: (categoryId: string, recordId: string, time: number) => Promise<{ success: boolean; bookmark?: { time: number; createdAt: string }; error?: string }>;
  removeBookmark: (categoryId: string, recordId: string, time: number) => Promise<{ success: boolean; error?: string }>;
  migrateThumbnailPaths: () => Promise<{ success: boolean; totalProcessed?: number; totalUpdated?: number; error?: string }>;
  checkThumbnailSync: () => Promise<any>;
  cleanupThumbnailSync: (options?: any) => Promise<any>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export interface TableData {
  columns: string[];
  rows: any[];
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
  type: 'text' | 'number' | 'select' | 'relation' | 'date' | 'file' | 'checkbox' | 'longtext';
  required: boolean;
  unique: boolean;
  order: number;
  pathMode?: 'direct' | 'base';
  basePath?: string;
  multiple?: boolean;
  options?: string[];
  relationCategoryId?: string;
  displayFieldId?: string;
}

export interface DataRecord {
  id: string;
  categoryId: string;
  data: { [key: string]: any };
  createdAt: string;
  updatedAt: string;
  duration?: number;
  thumbnailPath?: string;
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

export {}; 
