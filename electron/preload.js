const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 카테고리 관련 API
  getCategories: () => ipcRenderer.invoke('db:getCategories'),
  addCategory: (category) => ipcRenderer.invoke('db:addCategory', category),
  updateCategory: (id, updates) => ipcRenderer.invoke('db:updateCategory', id, updates),
  deleteCategory: (id) => ipcRenderer.invoke('db:deleteCategory', id),
  
  // 레코드 관련 API
  getRecords: (categoryId) => ipcRenderer.invoke('db:getRecords', categoryId),
  addRecord: (record) => ipcRenderer.invoke('db:addRecord', record),
  updateRecord: (id, data) => ipcRenderer.invoke('db:updateRecord', id, data),
  deleteRecord: (id) => ipcRenderer.invoke('db:deleteRecord', id),
  
  // DB 뷰어 관련 API
  getTables: () => ipcRenderer.invoke('db:getTables'),
  getTableData: (tableName) => ipcRenderer.invoke('db:getTableData', tableName),
  getDbPath: () => ipcRenderer.invoke('db:getPath'),
  openDbFile: () => ipcRenderer.invoke('db:openFile'),
  
  // 외부 링크 열기
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
}); 