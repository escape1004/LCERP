import { contextBridge, ipcRenderer } from 'electron';

const api = {
  getTables: () => ipcRenderer.invoke('db:getTables'),
  getTableData: (tableName: string, options?: { page?: number; pageSize?: number }) => ipcRenderer.invoke('db:getTableData', tableName, options),
  getDbPath: () => ipcRenderer.invoke('db:getPath'),
  openDbFile: () => ipcRenderer.invoke('db:openFile'),
  backupDatabase: () => ipcRenderer.invoke('db:backup'),
  openBackupLocation: () => ipcRenderer.invoke('db:openBackupLocation'),
  setBackupDir: () => ipcRenderer.invoke('db:setBackupDir'),
  getConfig: () => ipcRenderer.invoke('db:getConfig'),
  setBackupInterval: (minutes: number) => ipcRenderer.invoke('db:setBackupInterval', minutes),
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  deleteThumbnail: (filePath: string) => ipcRenderer.invoke('deleteThumbnail', filePath),
  // 북마크 API
  getBookmarks: (categoryId: string, recordId: string) => ipcRenderer.invoke('getBookmarks', categoryId, recordId),
  addBookmark: (categoryId: string, recordId: string, time: number) => ipcRenderer.invoke('addBookmark', categoryId, recordId, time),
  removeBookmark: (categoryId: string, recordId: string, time: number) => ipcRenderer.invoke('removeBookmark', categoryId, recordId, time),
  removeAllBookmarks: (categoryId: string, recordId: string) => ipcRenderer.invoke('removeAllBookmarks', categoryId, recordId),
};

contextBridge.exposeInMainWorld('electronAPI', api);
