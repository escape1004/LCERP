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
  updateCategory: (id: string, updates: Partial<NewCategory>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
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
    console.log('Loading records for category:', categoryId);
    try {
      const records = await window.electronAPI.getRecords(categoryId);
      console.log('Loaded records:', records);
      set(state => ({
        records: {
          ...state.records,
          [categoryId]: records
        }
      }));
    } catch (error) {
      console.error('Error loading records:', error);
      set(state => ({
        records: {
          ...state.records,
          [categoryId]: []
        }
      }));
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
    await window.electronAPI.deleteCategory(id);
    await get().loadCategories();
    set(state => {
      const { [id]: _, ...remainingRecords } = state.records;
      return {
        selectedCategoryId: state.selectedCategoryId === id ? null : state.selectedCategoryId,
        records: remainingRecords
      };
    });
  },

  reorderCategories: async (categories) => {
    for (const [index, category] of categories.entries()) {
      await window.electronAPI.updateCategory(category.id, { ...category, order: index });
    }
    await get().loadCategories();
  },

  addRecord: async (recordData: NewRecord) => {
    console.log('Adding record:', recordData);
    const id = Math.random().toString(36).substring(2);
    const record = {
      ...recordData,
      id
    };
    await window.electronAPI.addRecord(record);
    
    if (get().selectedCategoryId) {
      console.log('Reloading records after add');
      await get().loadRecords(get().selectedCategoryId);
    }
    return id;
  },

  updateRecord: async (id, data) => {
    await window.electronAPI.updateRecord(id, data);
    if (get().selectedCategoryId) {
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
    console.log('Selecting category:', id);
    if (id === null) {
      set({ selectedCategoryId: null });
      return;
    }
    
    set({ selectedCategoryId: id });
    
    try {
      const records = await window.electronAPI.getRecords(id);
      console.log('Loaded records for category:', { id, count: records.length });
      set(state => ({
        records: {
          ...state.records,
          [id]: records
        }
      }));
    } catch (error) {
      console.error('Error loading records for category:', { id, error });
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
    
    // 모든 카테고리를 순회하면서 참조 횟수 계산
    categories.forEach(category => {
      const categoryRecords = allRecords[category.id] || [];
      categoryRecords.forEach(record => {
        category.fields.forEach(field => {
          if (field.type === 'relation' && field.relationCategoryId === categoryId) {
            // 단일 참조인 경우
            if (!field.multiple && record.data[field.id] === recordId) {
              count++;
            }
            // 다중 참조인 경우
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
}));
