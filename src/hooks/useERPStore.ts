
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Category, DataRecord, FieldDefinition, ERPState } from '../types';

interface ERPStore extends ERPState {
  // Category actions
  addCategory: (category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  reorderCategories: (categories: Category[]) => void;
  
  // Record actions
  addRecord: (record: Omit<DataRecord, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateRecord: (id: string, data: Record<string, any>) => void;
  deleteRecord: (id: string) => void;
  
  // UI actions
  selectCategory: (id: string) => void;
  setSearchTerm: (term: string) => void;
  setCurrentPage: (page: number) => void;
  
  // Utility functions
  getCategoryRecords: (categoryId: string) => DataRecord[];
  getFilteredRecords: (categoryId: string) => DataRecord[];
}

const generateId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

export const useERPStore = create<ERPStore>()(
  persist(
    (set, get) => ({
      categories: [],
      records: [],
      selectedCategoryId: undefined,
      searchTerm: '',
      currentPage: 1,
      itemsPerPage: 20,

      addCategory: (categoryData) => {
        const id = generateId();
        const category: Category = {
          ...categoryData,
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        set((state) => ({
          categories: [...state.categories, category],
        }));
        
        return id;
      },

      updateCategory: (id, updates) => {
        set((state) => ({
          categories: state.categories.map((cat) =>
            cat.id === id 
              ? { ...cat, ...updates, updatedAt: new Date() }
              : cat
          ),
        }));
      },

      deleteCategory: (id) => {
        set((state) => ({
          categories: state.categories.filter((cat) => cat.id !== id && cat.parentId !== id),
          records: state.records.filter((record) => record.categoryId !== id),
          selectedCategoryId: state.selectedCategoryId === id ? undefined : state.selectedCategoryId,
        }));
      },

      reorderCategories: (categories) => {
        set({ categories });
      },

      addRecord: (recordData) => {
        const id = generateId();
        const record: DataRecord = {
          ...recordData,
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        set((state) => ({
          records: [...state.records, record],
        }));
        
        return id;
      },

      updateRecord: (id, data) => {
        set((state) => ({
          records: state.records.map((record) =>
            record.id === id
              ? { ...record, data, updatedAt: new Date() }
              : record
          ),
        }));
      },

      deleteRecord: (id) => {
        set((state) => ({
          records: state.records.filter((record) => record.id !== id),
        }));
      },

      selectCategory: (id) => {
        set({ selectedCategoryId: id, currentPage: 1, searchTerm: '' });
      },

      setSearchTerm: (term) => {
        set({ searchTerm: term, currentPage: 1 });
      },

      setCurrentPage: (page) => {
        set({ currentPage: page });
      },

      getCategoryRecords: (categoryId) => {
        const state = get();
        return state.records.filter((record) => record.categoryId === categoryId);
      },

      getFilteredRecords: (categoryId) => {
        const state = get();
        const records = state.getCategoryRecords(categoryId);
        
        if (!state.searchTerm) return records;
        
        return records.filter((record) =>
          Object.values(record.data).some((value) =>
            String(value).toLowerCase().includes(state.searchTerm.toLowerCase())
          )
        );
      },
    }),
    {
      name: 'erp-storage',
    }
  )
);
