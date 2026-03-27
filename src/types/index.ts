export interface FieldDefinition {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'relation' | 'file' | 'checkbox';
  required: boolean;
  unique: boolean;
  order: number;
  pathMode?: 'direct' | 'base';
  basePath?: string;
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
  data: { [key: string]: any };
  createdAt: string;
  updatedAt: string;
  duration?: number;
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
  rememberWindowBounds?: boolean;
  hasAppPassword?: boolean;
  videoSeekSeconds?: number;
  videoAutoPlay?: boolean;
  listThumbnailFit?: 'cover' | 'contain';
}

export {}; 
