export interface FieldDefinition {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'longtext' | 'select' | 'relation';
  required: boolean;
  unique: boolean;
  order: number;
  multiSelect?: boolean;
  selectOptions?: string[];
  relationCategoryId?: string;
}

export interface Category {
  id: string;
  name: string;
  parentId?: string;
  fields: FieldDefinition[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewCategory extends Omit<Category, 'id' | 'createdAt' | 'updatedAt'> {}

export interface CategoryUpdate extends Partial<NewCategory> {}

export interface DataRecord {
  id: string;
  categoryId: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface NewRecord extends Omit<DataRecord, 'id' | 'createdAt' | 'updatedAt'> {}

export interface TableData {
  columns: string[];
  rows: any[];
  total: number;
}

export interface Config {
  dbPath: string;
  backupDir: string;
  backupInterval: number;
}

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
  
  // Utility methods
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
} 