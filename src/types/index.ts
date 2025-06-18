export interface FieldDefinition {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'longtext' | 'select' | 'relation' | 'file';
  required: boolean;
  unique: boolean;
  order: number;
  multiSelect?: boolean;
  selectOptions?: string[];
  relationCategoryId?: string;
  displayFieldId?: string;
  description?: string;
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

export {}; 