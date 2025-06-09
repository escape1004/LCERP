import { contextBridge, ipcRenderer } from 'electron';

// API 정의
const electronAPI = {
  getTables: () => ipcRenderer.invoke('getTables'),
  getTableData: (tableName: string) => ipcRenderer.invoke('getTableData', tableName),
  getDbPath: () => ipcRenderer.invoke('getDbPath'),
  openDbFile: () => ipcRenderer.invoke('openDbFile'),
  getCategories: () => ipcRenderer.invoke('getCategories'),
  getRecords: (categoryId: string) => ipcRenderer.invoke('getRecords', categoryId),
  addCategory: (category: any) => ipcRenderer.invoke('addCategory', category),
  updateCategory: (id: string, category: any) => ipcRenderer.invoke('updateCategory', id, category),
  deleteCategory: (id: string) => ipcRenderer.invoke('deleteCategory', id),
  addRecord: (record: any) => ipcRenderer.invoke('addRecord', record),
  updateRecord: (id: string, data: any) => ipcRenderer.invoke('updateRecord', id, data),
  deleteRecord: (categoryId: string, id: string) => ipcRenderer.invoke('deleteRecord', categoryId, id),
  openExternal: (url: string) => ipcRenderer.invoke('openExternal', url),
} as const;

// API를 window 객체에 노출
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript 타입 체크를 위한 export
export type ElectronAPI = typeof electronAPI; 