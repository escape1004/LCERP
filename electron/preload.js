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
  
  // 설정 관련 API
  getConfig: () => ipcRenderer.invoke('getConfig'),
  setDbPath: () => ipcRenderer.invoke('setDbPath'),
  setBackupDir: () => ipcRenderer.invoke('setBackupDir'),
  setBackupInterval: (minutes) => ipcRenderer.invoke('setBackupInterval', minutes),
  
  // 백업 관련 API
  backupDatabase: () => ipcRenderer.invoke('backupDatabase'),
  openBackupLocation: () => ipcRenderer.invoke('openBackupLocation'),
  
  // 외부 링크 열기
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
});

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron',
  {
    send: (channel, data) => {
      // whitelist channels
      const validChannels = ['window-control'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    on: (channel, func) => {
      const validChannels = ['window-state-change'];
      if (validChannels.includes(channel)) {
        // Strip event as it includes `sender` 
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    }
  }
); 