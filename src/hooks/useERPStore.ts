import { create } from 'zustand';
import { Category, DataRecord, NewCategory, NewRecord } from '@/types';

declare global {
  interface Window {
    electronAPI: {
      getCategories: () => Promise<Category[]>;
      addCategory: (category: NewCategory & { id: string }) => Promise<string>;
      updateCategory: (id: string, updates: Partial<NewCategory>) => Promise<void>;
      deleteCategory: (id: string) => Promise<void>;
      getRecords: (categoryId: string) => Promise<DataRecord[]>;
      addRecord: (record: NewRecord & { id: string }) => Promise<string>;
      updateRecord: (id: string, data: Record<string, any>) => Promise<void>;
      deleteRecord: (id: string) => Promise<void>;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

interface ERPStore {
  categories: Category[];
  recordsByCategory: Record<string, DataRecord[]>;
  selectedCategoryId?: string;
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
  selectCategory: (id: string) => void;
  setSearchTerm: (term: string) => void;
  setCurrentPage: (page: number) => void;
  getCategoryRecords: (categoryId: string) => DataRecord[];
  setShowDbViewer: (show: boolean) => void;
}

export const useERPStore = create<ERPStore>((set, get) => ({
  categories: [],
  recordsByCategory: {},
  selectedCategoryId: undefined,
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
        recordsByCategory: {
          ...state.recordsByCategory,
          [categoryId]: records
        }
      }));
    } catch (error) {
      console.error('Error loading records:', error);
      set(state => ({
        recordsByCategory: {
          ...state.recordsByCategory,
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
      const { [id]: _, ...remainingRecords } = state.recordsByCategory;
      return {
        selectedCategoryId: state.selectedCategoryId === id ? undefined : state.selectedCategoryId,
        recordsByCategory: remainingRecords
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
    const record = {
      ...recordData,
      id: recordData.id || Math.random().toString(36).substring(2)
    };
    await window.electronAPI.addRecord(record);
    
    if (get().selectedCategoryId) {
      console.log('Reloading records after add');
      await get().loadRecords(get().selectedCategoryId);
    }
    return record.id;
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
    try {
      const records = await window.electronAPI.getRecords(id);
      console.log('Loaded records for category:', { id, count: records.length });
      set(state => ({
        selectedCategoryId: id,
        recordsByCategory: {
          ...state.recordsByCategory,
          [id]: records
        }
      }));
    } catch (error) {
      console.error('Error loading records for category:', { id, error });
      set(state => ({
        selectedCategoryId: id,
        recordsByCategory: {
          ...state.recordsByCategory,
          [id]: []
        }
      }));
    }
  },

  setSearchTerm: (term) => set({ searchTerm: term }),

  setCurrentPage: (page) => set({ currentPage: page }),

  getCategoryRecords: (categoryId) => {
    return get().recordsByCategory[categoryId] || [];
  },

  setShowDbViewer: (show) => set({ showDbViewer: show }),
}));
