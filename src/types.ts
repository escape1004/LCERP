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

export interface FieldDefinition {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'relation' | 'longtext';
  order: number;
  required: boolean;
  unique: boolean;
  multiple?: boolean;
  options?: string[];
  relationCategoryId?: string;
}

export interface DataRecord {
  id: string;
  categoryId: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface NewRecord {
  id?: string;
  categoryId: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ElectronAPI {
  getCategories: () => Promise<Category[]>;
  addCategory: (category: Category) => Promise<string>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  
  getRecords: (categoryId: string) => Promise<DataRecord[]>;
  addRecord: (record: DataRecord) => Promise<string>;
  updateRecord: (id: string, data: Record<string, any>) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
}

// DB 뷰어 관련 타입
export interface TableData {
  columns: string[];
  rows: any[];
  total: number;
}

declare global {
  interface Window {
    electronAPI: {
      // ... existing API types ...
      
      // DB 뷰어 관련 API
      getTables: () => Promise<{ name: string }[]>;
      getTableData: (tableName: string) => Promise<TableData>;
      getDbPath: () => Promise<string>;
      openDbFile: () => Promise<void>;
    }
  }
} 