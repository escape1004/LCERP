import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Category APIs
  getCategories: () => ipcRenderer.invoke('getCategories'),
  addCategory: (category) => ipcRenderer.invoke('addCategory', category),
  updateCategory: (id, updates) => ipcRenderer.invoke('updateCategory', id, updates),
  deleteCategory: (id) => ipcRenderer.invoke('deleteCategory', id),
  
  // Record APIs
  getRecords: (categoryId) => ipcRenderer.invoke('getRecords', categoryId),
  addRecord: (record) => ipcRenderer.invoke('addRecord', record),
  updateRecord: (id, data) => ipcRenderer.invoke('updateRecord', id, data),
  deleteRecord: (categoryId, id) => ipcRenderer.invoke('deleteRecord', categoryId, id),
  
  // Database APIs
  getTables: () => ipcRenderer.invoke('getTables'),
  getTableData: (tableName) => ipcRenderer.invoke('getTableData', tableName),
  getDbPath: () => ipcRenderer.invoke('getDbPath'),
  openDbFile: () => ipcRenderer.invoke('openDbFile'),
  
  // Utility APIs
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  
  backupDatabase: () => ipcRenderer.invoke('backupDatabase'),
  openBackupLocation: () => ipcRenderer.invoke('openBackupLocation'),
}); 