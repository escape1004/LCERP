import { contextBridge, ipcRenderer } from 'electron';

// API 정의
const api = {
  getTables: () => ipcRenderer.invoke('db:getTables'),
  getTableData: (tableName: string) => ipcRenderer.invoke('db:getTableData', tableName),
  getDbPath: () => ipcRenderer.invoke('db:getPath'),
  setDbPath: () => ipcRenderer.invoke('db:setDbPath'),
  openDbFile: () => ipcRenderer.invoke('db:openFile'),
  backupDatabase: () => ipcRenderer.invoke('db:backup'),
  openBackupLocation: () => ipcRenderer.invoke('db:openBackupLocation'),
  setBackupDir: () => ipcRenderer.invoke('db:setBackupDir'),
  getConfig: () => ipcRenderer.invoke('db:getConfig'),
  setBackupInterval: (minutes: number) => ipcRenderer.invoke('db:setBackupInterval', minutes),
};

// API를 window 객체에 노출
contextBridge.exposeInMainWorld('electron', api); 