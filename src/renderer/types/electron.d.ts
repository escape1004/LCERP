import { ElectronAPI } from '../../main/preload';

interface Config {
  dbPath: string;
  backupDir: string;
  backupInterval: number;
}

declare global {
  interface Window {
    electronAPI: {
      getTables: () => Promise<{ name: string }[]>;
      getTableData: (tableName: string) => Promise<TableData>;
      getDbPath: () => Promise<string>;
      openDbFile: () => Promise<void>;
      addCategory: (category: NewCategory) => Promise<string>;
      updateCategory: (id: string, updates: CategoryUpdate) => Promise<void>;
      deleteCategory: (id: string) => Promise<void>;
      getRecords: (categoryId: string) => Promise<any[]>;
      addRecord: (record: NewRecord) => Promise<string>;
      updateRecord: (id: string, data: any) => Promise<void>;
      deleteRecord: (id: string) => Promise<void>;
      getCategories: () => Promise<Category[]>;
      backupDatabase: () => Promise<{ success: boolean; path?: string; error?: string }>;
      openBackupLocation: () => Promise<{ success: boolean }>;
      getConfig: () => Promise<{ success: boolean; data: Config; error?: string }>;
      setDbPath: () => Promise<{ success: boolean; path?: string }>;
      setBackupDir: () => Promise<{ success: boolean; path?: string }>;
      setBackupInterval: (minutes: number) => Promise<{ success: boolean }>;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      resetDatabase: () => Promise<{ success: boolean; backupPath?: string; error?: string }>;
    }
  }
}

export {}; 