import { ElectronAPI } from '../../main/preload';

interface Config {
  dbPath: string;
  backupDir: string;
  backupInterval: number;
  backupEnabled?: boolean;
  translationModel?: string;
}

declare global {
  interface Window {
    electronAPI: {
      getTables: () => Promise<{ name: string }[]>;
      getTableData: (tableName: string, options?: { page?: number; pageSize?: number }) => Promise<TableData>;
      getDbPath: () => Promise<string>;
      openDbFile: () => Promise<void>;
      addCategory: (category: NewCategory) => Promise<string>;
      updateCategory: (id: string, updates: CategoryUpdate) => Promise<void>;
      deleteCategory: (id: string) => Promise<void>;
      moveCategoryToProfile: (categoryId: string, targetProfileId: string) => Promise<{ success: boolean; error?: string }>;
      getRecords: (categoryId: string) => Promise<any[]>;
      addRecord: (record: NewRecord) => Promise<string>;
      updateRecord: (id: string, data: any) => Promise<void>;
      deleteRecord: (id: string) => Promise<void>;
      exportCategory: (categoryId: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      importCategories: () => Promise<{ success: boolean; importedCount?: number; error?: string }>;
      getCategories: () => Promise<Category[]>;
      backupDatabase: () => Promise<{ success: boolean; path?: string; error?: string }>;
      openBackupLocation: () => Promise<{ success: boolean; error?: string }>;
      getConfig: () => Promise<Config>;
      setBackupDir: () => Promise<{ success: boolean; path?: string; error?: string }>;
      setBackupInterval: (minutes: number) => Promise<{ success: boolean; error?: string }>;
      setBackupEnabled: (enabled: boolean) => Promise<{ success: boolean; backupEnabled?: boolean; error?: string }>;
      setTranslationModel: (model: string) => Promise<{ success: boolean; translationModel?: string; error?: string }>;
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
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      resetDatabase: () => Promise<{ success: boolean; backupPath?: string; error?: string }>;
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
    }
  }
}

export {}; 
