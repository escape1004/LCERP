import type { ElectronAPI } from './types.d';

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
  order?: number;
  order_num?: number;
}

export interface FieldDefinition {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'relation' | 'file' | 'checkbox' | 'longtext';
  required: boolean;
  unique: boolean;
  order: number;
  options?: string[];
  relationCategoryId?: string;
  multiple?: boolean;
  isAddingOption?: boolean;
  newOption?: string;
  hidden?: boolean;
  displayFieldId?: string;
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