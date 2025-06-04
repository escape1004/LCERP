export interface FieldDefinition {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'longtext' | 'select' | 'relation';
  required: boolean;
  unique: boolean;
  order: number;
  multiSelect?: boolean;
  selectOptions?: string[];
  relationCategoryId?: string;
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

export interface NewCategory extends Omit<Category, 'id'> {}

export interface DataRecord {
  id: string;
  categoryId: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface NewRecord extends Omit<DataRecord, 'id'> {} 