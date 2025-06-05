export interface TableInfo {
  name: string;
}

export interface TableData {
  columns: string[];
  rows: Record<string, any>[];
}

export interface Config {
  dbPath: string;
  backupDir: string;
  backupInterval: number;
}

export interface ApiResponse {
  success: boolean;
  error?: string;
  path?: string;
}

export interface ElectronAPI {
  // Database viewer APIs
  getTables: () => Promise<TableInfo[]>;
  getTableData: (tableName: string) => Promise<TableData>;
  getDbPath: () => Promise<string>;
  openDbFile: () => Promise<void>;
  backupDatabase: () => Promise<ApiResponse>;
  openBackupLocation: () => Promise<ApiResponse>;
  getConfig: () => Promise<Config>;
  setDbPath: () => Promise<ApiResponse>;
  setBackupDir: () => Promise<ApiResponse>;
  setBackupInterval: (minutes: number) => Promise<ApiResponse>;
  
  // Category APIs
  getCategories: () => Promise<any[]>;
  addCategory: (category: any) => Promise<any>;
  updateCategory: (id: string, updates: any) => Promise<any>;
  deleteCategory: (id: string) => Promise<any>;
  
  // Record APIs
  getRecords: (categoryId: string) => Promise<any[]>;
  addRecord: (record: any) => Promise<any>;
  updateRecord: (id: string, data: any) => Promise<any>;
  deleteRecord: (categoryId: string, id: string) => Promise<any>;
  
  // Utility APIs
  openExternal: (url: string) => Promise<ApiResponse>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {}; 