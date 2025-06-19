import { contextBridge, ipcRenderer } from 'electron';
import { NewCategory, CategoryUpdate, NewRecord } from '../src/types';
import { ElectronAPI } from '../src/types.d';

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

export {};

const api: ElectronAPI = {
  getTables: () => ipcRenderer.invoke('db:getTables'),
  getTableData: (tableName: string) => ipcRenderer.invoke('db:getTableData', tableName),
  getDbPath: () => ipcRenderer.invoke('db:getPath'),
  openDbFile: () => ipcRenderer.invoke('db:openFile'),
  addCategory: (category: NewCategory) => ipcRenderer.invoke('db:addCategory', category),
  updateCategory: (id: string, updates: CategoryUpdate) => ipcRenderer.invoke('db:updateCategory', id, updates),
  deleteCategory: (id: string) => ipcRenderer.invoke('db:deleteCategory', id),
  getRecords: (categoryId: string) => ipcRenderer.invoke('db:getRecords', categoryId),
  addRecord: (record: NewRecord) => ipcRenderer.invoke('db:addRecord', record),
  updateRecord: (id: string, data: Record<string, any>) => ipcRenderer.invoke('db:updateRecord', id, data),
  deleteRecord: (id: string) => ipcRenderer.invoke('db:deleteRecord', id),
  getCategories: () => ipcRenderer.invoke('db:getCategories'),
  backupDatabase: () => ipcRenderer.invoke('backupDatabase'),
  openBackupLocation: () => ipcRenderer.invoke('openBackupLocation'),
  getConfig: () => ipcRenderer.invoke('getConfig'),
  setDbPath: () => ipcRenderer.invoke('setDbPath'),
  setBackupDir: () => ipcRenderer.invoke('setBackupDir'),
  setBackupInterval: (minutes: number) => ipcRenderer.invoke('setBackupInterval', minutes),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  checkDuplicate: (categoryId: string, fieldId: string, value: any, recordId?: string) => ipcRenderer.invoke('db:checkDuplicate', categoryId, fieldId, value, recordId),
  checkFileExists: (filePath: string) => ipcRenderer.invoke('checkFileExists', filePath),
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  openFile: (filePath: string) => ipcRenderer.invoke('openFile', filePath),
  generateThumbnail: (filePath: string) => ipcRenderer.invoke('generateThumbnail', filePath),
  getThumbnailDataUrl: (filePath: string) => ipcRenderer.invoke('getThumbnailDataUrl', filePath),
  openFileDialog: () => ipcRenderer.invoke('openFileDialog'),
  getAppRoot: () => ipcRenderer.invoke('getAppRoot'),
};

contextBridge.exposeInMainWorld('electronAPI', api); 