import { contextBridge, ipcRenderer } from 'electron';

// API 정의
const electronAPI = {
  getTables: () => ipcRenderer.invoke('getTables'),
  getTableData: (tableName: string) => ipcRenderer.invoke('getTableData', tableName),
  getDbPath: () => ipcRenderer.invoke('getDbPath'),
  openDbFile: () => ipcRenderer.invoke('openDbFile'),
  getCategories: () => ipcRenderer.invoke('db:getCategories'),
  getRecords: (categoryId: string) => ipcRenderer.invoke('db:getRecords', categoryId),
  addCategory: (category: any) => ipcRenderer.invoke('db:addCategory', category),
  updateCategory: (id: string, category: any) => ipcRenderer.invoke('db:updateCategory', id, category),
  deleteCategory: (id: string) => ipcRenderer.invoke('db:deleteCategory', id),
  addRecord: (record: any) => ipcRenderer.invoke('db:addRecord', record),
  updateRecord: (id: string, data: any) => ipcRenderer.invoke('db:updateRecord', id, data),
  deleteRecord: (categoryId: string, id: string) => ipcRenderer.invoke('db:deleteRecord', categoryId, id),
  openExternal: (url: string) => ipcRenderer.invoke('openExternal', url),
  openFileDialog: () => ipcRenderer.invoke('openFileDialog'),
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  openFile: (filePath: string) => ipcRenderer.invoke('openFile', filePath),
} as const;

// API를 window 객체에 노출
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript 타입 체크를 위한 export
export type ElectronAPI = typeof electronAPI; 