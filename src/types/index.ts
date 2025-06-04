
export interface FieldDefinition {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'longtext' | 'select' | 'relation';
  required?: boolean;
  order: number;
  selectOptions?: string[];
  relationCategoryId?: string;
  multiSelect?: boolean;
}

export interface Category {
  id: string;
  name: string;
  parentId?: string;
  fields: FieldDefinition[];
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataRecord {
  id: string;
  categoryId: string;
  data: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ERPState {
  categories: Category[];
  records: DataRecord[];
  selectedCategoryId?: string;
  searchTerm: string;
  currentPage: number;
  itemsPerPage: number;
}
