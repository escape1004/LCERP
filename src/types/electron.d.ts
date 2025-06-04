interface TableData {
  columns: string[];
  rows: Record<string, any>[];
}

interface ElectronAPI {
  // Category APIs
  getCategories: () => Promise<Category[]>;
  addCategory: (category: NewCategory & { id: string }) => Promise<string>;
  updateCategory: (id: string, updates: Partial<NewCategory>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  
  // Record APIs
  getRecords: (categoryId: string) => Promise<DataRecord[]>;
  addRecord: (record: NewRecord & { id: string }) => Promise<string>;
  updateRecord: (id: string, data: Record<string, any>) => Promise<void>;
  deleteRecord: (categoryId: string, id: string) => Promise<void>;
  
  // Database APIs
  getTables: () => Promise<{ name: string }[]>;
  getTableData: (tableName: string) => Promise<TableData>;
  getDbPath: () => Promise<string>;
  openDbFile: () => Promise<void>;
  
  // Utility APIs
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
} 