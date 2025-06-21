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
  getCategories: () => Promise<Category[]>;
  backupDatabase: () => Promise<{ success: boolean; path?: string; error?: string }>;
  openBackupLocation: () => Promise<{ success: boolean }>;
  getConfig: () => Promise<any>;
  setDbPath: () => Promise<{ success: boolean; path?: string }>;
  setBackupDir: () => Promise<{ success: boolean; path?: string }>;
  setBackupInterval: (minutes: number) => Promise<{ success: boolean }>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  checkFileExists: (filePath: string) => Promise<boolean>;
  checkDuplicate: (categoryId: string, fieldId: string, value: any, recordId?: string) => Promise<{ isDuplicate: boolean }>;
  send: (channel: string, ...args: any[]) => void;
  openFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  generateThumbnail: (filePath: string) => Promise<string | null>;
  getThumbnailDataUrl: (filePath: string) => Promise<string | null>;
  getFileDataUrl: (filePath: string) => Promise<string | null>;
  getArchiveFiles: (filePath: string) => Promise<Array<{ name: string; size: number; isDirectory: boolean; comment: string }>>;
  getArchiveFileDataUrl: (filePath: string, fileName: string) => Promise<string | null>;
  getArchiveFileText: (filePath: string, fileName: string) => Promise<string | null>;
  openFileDialog: () => Promise<{ canceled: boolean; filePaths?: string[] }>;
  getFileType: (filePath: string) => Promise<'image' | 'video' | 'archive' | 'other'>;
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