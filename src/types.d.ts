import type { ElectronAPI } from './main/preload';

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
  type: 'text' | 'longtext' | 'number' | 'select' | 'relation' | 'date';
  multiple?: boolean;
  options?: string[];
  relationCategoryId?: string;
}

export interface DataRecord {
  id: string;
  categoryId: string;
  data: { [key: string]: any };
  createdAt: string;
  updatedAt: string;
}

export {}; 