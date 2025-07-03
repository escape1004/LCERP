import { create } from 'zustand';
import { Category, DataRecord, NewCategory, NewRecord } from '@/types';

interface ERPStore {
  categories: Category[];
  records: Record<string, DataRecord[]>;
  selectedCategoryId: string | null;
  searchTerm: string;
  currentPage: number;
  itemsPerPage: number;
  showDbViewer: boolean;

  loadCategories: () => Promise<void>;
  loadRecords: (categoryId: string) => Promise<void>;
  addCategory: (category: NewCategory) => Promise<string>;
  updateCategory: (id: string, updates: any) => Promise<void>;
  deleteCategory: (id: string) => Promise<{ success: boolean; thumbnailCleanupCount: number; relationCleanupCount: number }>;
  reorderCategories: (categories: Category[]) => Promise<void>;
  addRecord: (record: NewRecord) => Promise<string>;
  updateRecord: (id: string, data: Record<string, any>) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  selectCategory: (id: string | null) => void;
  setSearchTerm: (term: string) => void;
  setCurrentPage: (page: number) => void;
  getCategoryRecords: (categoryId: string) => DataRecord[];
  setShowDbViewer: (show: boolean) => void;
  getRecordReferenceCount: (recordId: string, categoryId: string) => number;
  toggleDbViewer: () => void;
  checkDuplicate: (categoryId: string, fieldId: string, value: any, recordId?: string) => Promise<boolean>;
  invalidateCache: (categoryId?: string) => void;
}

export const useERPStore = create<ERPStore>((set, get) => ({
  categories: [],
  records: {},
  selectedCategoryId: null,
  searchTerm: '',
  currentPage: 1,
  itemsPerPage: 20,
  showDbViewer: false,

  loadCategories: async () => {
    const categories = await window.electronAPI.getCategories();
    set({ categories });
  },

  loadRecords: async (categoryId: string) => {
    try {
      // 로컬 스토리지에서 캐시된 데이터 확인
      const cacheKey = `records_${categoryId}`;
      const cachedData = localStorage.getItem(cacheKey);
      const cacheTimestamp = localStorage.getItem(`${cacheKey}_timestamp`);
      
      // 캐시가 5분 이내인지 확인 (5분 = 300000ms)
      const isCacheValid = cacheTimestamp && (Date.now() - parseInt(cacheTimestamp)) < 300000;
      
      if (cachedData && isCacheValid) {
        try {
          const records = JSON.parse(cachedData);
          set(state => ({
            records: {
              ...state.records,
              [categoryId]: records
            }
          }));
          return; // 캐시된 데이터 사용
        } catch (error) {
          console.warn('캐시된 데이터 파싱 실패:', error);
        }
      }
      
      // 캐시가 없거나 만료된 경우 서버에서 로드
      const records = await window.electronAPI.getRecords(categoryId);
      
      // 로컬 스토리지에 캐시 저장
      try {
        localStorage.setItem(cacheKey, JSON.stringify(records));
        localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());
      } catch (error) {
        console.warn('캐시 저장 실패:', error);
      }
      
      set(state => ({
        records: {
          ...state.records,
          [categoryId]: records
        }
      }));
    } catch (error) {
      set(state => ({
        records: {
          ...state.records,
          [categoryId]: []
        }
      }));
    }
  },

  // 캐시 무효화 함수
  invalidateCache: (categoryId?: string) => {
    if (categoryId) {
      // 특정 카테고리 캐시만 무효화
      localStorage.removeItem(`records_${categoryId}`);
      localStorage.removeItem(`records_${categoryId}_timestamp`);
    } else {
      // 모든 캐시 무효화
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('records_')) {
          localStorage.removeItem(key);
        }
      });
    }
  },

  addCategory: async (categoryData: NewCategory) => {
    const id = Math.random().toString(36).substring(2);
    await window.electronAPI.addCategory({
      id,
      ...categoryData,
    });
    await get().loadCategories();
    return id;
  },

  updateCategory: async (id, updates) => {
    await window.electronAPI.updateCategory(id, updates);
    await get().loadCategories();
  },

  deleteCategory: async (id) => {
    const result = await window.electronAPI.deleteCategory(id);
    set(state => {
      const { [id]: _, ...remainingRecords } = state.records;
      return {
        selectedCategoryId: state.selectedCategoryId === id ? null : state.selectedCategoryId,
        records: remainingRecords
      };
    });
    await get().loadCategories();
    return result;
  },

  reorderCategories: async (categories) => {
    set({ categories });
    
    for (const [index, category] of categories.entries()) {
      await window.electronAPI.updateCategory(category.id, {
        name: category.name,
        parentId: category.parentId,
        fields: category.fields,
        order: category.order
      });
    }
  },

  addRecord: async (recordData: NewRecord) => {
    const id = Math.random().toString(36).substring(2);
    const record = {
      ...recordData,
      id
    };
    await window.electronAPI.addRecord(record);
    
    if (get().selectedCategoryId) {
      await get().loadRecords(get().selectedCategoryId);
    }
    return id;
  },

  updateRecord: async (id, data) => {
    await window.electronAPI.updateRecord(id, data);
    if (get().selectedCategoryId) {
      // 캐시 무효화 후 새로 로드
      get().invalidateCache(get().selectedCategoryId);
      await get().loadRecords(get().selectedCategoryId);
    }
  },

  deleteRecord: async (id) => {
    await window.electronAPI.deleteRecord(id);
    if (get().selectedCategoryId) {
      await get().loadRecords(get().selectedCategoryId);
    }
  },

  selectCategory: async (id) => {
    if (id === null) {
      set({ selectedCategoryId: null });
      return;
    }
    
    set({ selectedCategoryId: id });
    
    try {
      const records = await window.electronAPI.getRecords(id);
      set(state => ({
        records: {
          ...state.records,
          [id]: records
        }
      }));
    } catch (error) {
      set(state => ({
        records: {
          ...state.records,
          [id]: []
        }
      }));
    }
  },

  setSearchTerm: (term) => set({ searchTerm: term }),

  setCurrentPage: (page) => set({ currentPage: page }),

  getCategoryRecords: (categoryId) => {
    return get().records[categoryId] || [];
  },

  setShowDbViewer: (show) => set({ showDbViewer: show }),

  getRecordReferenceCount: (recordId: string, categoryId: string) => {
    let count = 0;
    const { categories, records: allRecords } = get();
    
    categories.forEach(category => {
      const categoryRecords = allRecords[category.id] || [];
      categoryRecords.forEach(record => {
        category.fields.forEach(field => {
          if (field.type === 'relation' && field.relationCategoryId === categoryId) {
            if (!field.multiple && record.data[field.id] === recordId) {
              count++;
            }
            if (field.multiple && Array.isArray(record.data[field.id])) {
              count += record.data[field.id].filter((id: string) => id === recordId).length;
            }
          }
        });
      });
    });
    return count;
  },

  toggleDbViewer: () => {
    set(state => ({ showDbViewer: !state.showDbViewer }));
  },

  checkDuplicate: async (categoryId: string, fieldId: string, value: any, recordId?: string) => {
    try {
      const category = get().categories.find(c => c.id === categoryId);
      if (!category) return false;

      const field = category.fields.find(f => f.id === fieldId);
      if (!field || !field.unique) return false;

      if (value === undefined || value === null || value === '') return false;

      const records = get().getCategoryRecords(categoryId);

      const duplicate = records.some(record => {
        if (recordId && record.id === recordId) return false;
        return record.data[fieldId] === value;
      });

      return duplicate;
    } catch (error) {
      return false;
    }
  },
}));
