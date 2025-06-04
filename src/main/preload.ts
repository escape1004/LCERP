import { contextBridge, ipcRenderer } from 'electron';

// API 정의를 먼저 객체로 만들어서 타입 체크가 가능하도록 함
const electronAPI = {
  // Category APIs
  getCategories: () => ipcRenderer.invoke('getCategories'),
  addCategory: (category: any) => ipcRenderer.invoke('addCategory', category),
  updateCategory: (id: string, updates: any) => ipcRenderer.invoke('updateCategory', id, updates),
  deleteCategory: (id: string) => ipcRenderer.invoke('deleteCategory', id),
  
  // Record APIs
  getRecords: (categoryId: string) => ipcRenderer.invoke('getRecords', categoryId),
  addRecord: (record: any) => ipcRenderer.invoke('addRecord', record),
  updateRecord: (id: string, data: any) => ipcRenderer.invoke('updateRecord', id, data),
  deleteRecord: (categoryId: string, id: string) => ipcRenderer.invoke('deleteRecord', categoryId, id),
  
  // Database APIs
  getTables: () => ipcRenderer.invoke('getTables'),
  getTableData: (tableName: string) => ipcRenderer.invoke('getTableData', tableName),
  getDbPath: () => ipcRenderer.invoke('getDbPath'),
  openDbFile: () => ipcRenderer.invoke('openDbFile'),
  
  // Backup APIs
  backupDatabase: () => ipcRenderer.invoke('backupDatabase'),
  openBackupLocation: () => ipcRenderer.invoke('openBackupLocation'),
  
  // Configuration APIs
  getConfig: () => ipcRenderer.invoke('getConfig'),
  setDbPath: () => ipcRenderer.invoke('setDbPath'),
  setBackupDir: () => ipcRenderer.invoke('setBackupDir'),
  setBackupInterval: (minutes: number) => ipcRenderer.invoke('setBackupInterval', minutes),
  
  // Utility APIs
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
};

// API를 window 객체에 노출
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript 타입 체크를 위한 export
export type ElectronAPI = typeof electronAPI; 