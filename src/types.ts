export interface Category {
  id: string;
  name: string;
  parentId?: string;
  fields: FieldDefinition[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewCategory {
  name: string;
  parentId?: string;
  fields: FieldDefinition[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryUpdate {
  name: string;
  parentId?: string;
  fields: FieldDefinition[];
  order: number;
}

export interface FieldDefinition {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'relation' | 'longtext' | 'file';
  required: boolean;
  unique: boolean;
  order: number;
  options?: string[];
  relationCategoryId?: string;
  multiple?: boolean;
  isAddingOption?: boolean;
  newOption?: string;
}

export interface DataRecord {
  id: string;
  categoryId: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface NewRecord {
  categoryId: string;
  data: any;
  createdAt?: string;
  updatedAt?: string;
}

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
  generateThumbnail: (filePath: string) => Promise<{ success: boolean; thumbnailPath?: string; error?: string }>;
  getThumbnailDataUrl: (filePath: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
}

// DB 뷰어 관련 타입
export interface TableData {
  columns: string[];
  rows: any[];
  total: number;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
} 