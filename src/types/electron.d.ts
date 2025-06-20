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
  
  // File dialog methods
  openFileDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  getAppRoot: () => Promise<string>;

  // Utility methods
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  
  // New method
  send: (channel: string, ...args: any[]) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};