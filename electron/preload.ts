import { contextBridge, ipcRenderer } from 'electron';
import { Category, NewCategory, CategoryUpdate, NewRecord } from '../src/types';

interface TableData {
  columns: string[];
  rows: any[];
  total: number;
}

interface Config {
  dbPath: string;
  backupDir: string;
  backupInterval: number;
}

declare global {
  interface Window {
    electronAPI: {
      getTables: () => Promise<{ name: string }[]>;
      getTableData: (tableName: string) => Promise<TableData>;
      getDbPath: () => Promise<string>;
      openDbFile: () => Promise<void>;
      addCategory: (category: NewCategory) => Promise<string>;
      updateCategory: (id: string, updates: CategoryUpdate) => Promise<void>;
      deleteCategory: (id: string) => Promise<void>;
      getRecords: (categoryId: string) => Promise<any[]>;
      addRecord: (record: NewRecord) => Promise<string>;
      updateRecord: (id: string, data: any) => Promise<void>;
      deleteRecord: (id: string) => Promise<void>;
      getCategories: () => Promise<Category[]>;
      backupDatabase: () => Promise<{ success: boolean; path?: string; error?: string }>;
      openBackupLocation: () => Promise<{ success: boolean }>;
      getConfig: () => Promise<Config>;
      setDbPath: () => Promise<{ success: boolean; path?: string }>;
      setBackupDir: () => Promise<{ success: boolean; path?: string }>;
      setBackupInterval: (minutes: number) => Promise<{ success: boolean }>;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

export {};

contextBridge.exposeInMainWorld('electronAPI', {
  getTables: () => ipcRenderer.invoke('db:getTables'),
  getTableData: (tableName: string) => ipcRenderer.invoke('db:getTableData', tableName),
  getDbPath: () => ipcRenderer.invoke('db:getPath'),
  openDbFile: () => ipcRenderer.invoke('db:openFile'),
  addCategory: (category: NewCategory) => ipcRenderer.invoke('db:addCategory', category),
  updateCategory: (id: string, updates: CategoryUpdate) => ipcRenderer.invoke('db:updateCategory', id, updates),
  deleteCategory: (id: string) => ipcRenderer.invoke('db:deleteCategory', id),
  getRecords: (categoryId: string) => ipcRenderer.invoke('db:getRecords', categoryId),
  addRecord: (record: NewRecord) => ipcRenderer.invoke('db:addRecord', record),
  updateRecord: (id: string, data: any) => ipcRenderer.invoke('db:updateRecord', id, data),
  deleteRecord: (id: string) => ipcRenderer.invoke('db:deleteRecord', id),
  getCategories: () => ipcRenderer.invoke('db:getCategories'),
  backupDatabase: () => ipcRenderer.invoke('backupDatabase'),
  openBackupLocation: () => ipcRenderer.invoke('openBackupLocation'),
  getConfig: () => ipcRenderer.invoke('getConfig'),
  setDbPath: () => ipcRenderer.invoke('setDbPath'),
  setBackupDir: () => ipcRenderer.invoke('setBackupDir'),
  setBackupInterval: (minutes: number) => ipcRenderer.invoke('setBackupInterval', minutes),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
}); 