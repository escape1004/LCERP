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
  textPrefix?: string;
  textSuffix?: string;
  pathMode?: 'direct' | 'base';
  basePath?: string;
  options?: string[];
  relationCategoryId?: string;
  multiple?: boolean;
  isAddingOption?: boolean;
  newOption?: string;
  hidden?: boolean;
  displayFieldId?: string;
  subDisplayFieldId?: string;
}

export interface DataRecord {
  id: string;
  categoryId: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  duration?: number;
  thumbnailPath?: string;
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

// 썸네일 동기화 관련 타입
export interface ThumbnailSyncCheckResult {
  totalRecords: number;
  dbOnly: Array<{
    recordId: string;
    dbPath: string;
    filePath: string;
  }>;
  fileOnly: Array<{
    recordId: string;
    hashPath: string;
    filePath: string;
  }>;
  bothExist: number;
  neitherExist: number;
}

export interface ThumbnailSyncCleanupOptions {
  removeDbOnly?: boolean; // DB에만 있고 파일이 없으면 DB에서 제거
  addFileOnly?: boolean;  // 파일만 있고 DB에 없으면 DB에 추가
  dryRun?: boolean;       // 실제 변경하지 않고 시뮬레이션만
}

export interface ThumbnailSyncCleanupResult {
  removedFromDb: number;
  addedToDb: number;
  errors: Array<{
    recordId: string;
    error: string;
  }>;
}

export interface Config {
  dbPath: string;
  backupDir: string;
  backupInterval: number;
  rememberWindowBounds?: boolean;
  zoomPercent?: number;
  hasAppPassword?: boolean;
  videoSeekSeconds?: number;
  videoAutoPlay?: boolean;
  listThumbnailFit?: 'cover' | 'contain';
}
