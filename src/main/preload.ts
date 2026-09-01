import { contextBridge, ipcRenderer } from 'electron';
import { NewCategory, CategoryUpdate, NewRecord, ElectronAPI } from '../types.d';

// 전역 마우스 4번 버튼(뒤로가기) 기본 동작 방지
// DOM이 로드되면 이벤트 리스너 추가
const setupMouseBackButtonPrevention = () => {
  const handleAuxClick = (e: MouseEvent) => {
    // 마우스 4번 버튼(뒤로가기) = button 3
    if (e.button === 3) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      // 히스토리도 즉시 복원
      const currentPath = window.location.hash || '#/dashboard';
      window.history.pushState({ preventBack: true }, '', currentPath);
      return false;
    }
  };

  const handleMouseDown = (e: MouseEvent) => {
    // 마우스 4번 버튼(뒤로가기) = button 3
    if (e.button === 3) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      // 히스토리도 즉시 복원
      const currentPath = window.location.hash || '#/dashboard';
      window.history.pushState({ preventBack: true }, '', currentPath);
      return false;
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    // 마우스 4번 버튼(뒤로가기) = button 3
    if (e.button === 3) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      // 히스토리도 즉시 복원
      const currentPath = window.location.hash || '#/dashboard';
      window.history.pushState({ preventBack: true }, '', currentPath);
      return false;
    }
  };

  // 캡처 단계에서 이벤트 처리 (다른 리스너보다 먼저)
  document.addEventListener('auxclick', handleAuxClick, true);
  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('mouseup', handleMouseUp, true);
};

// DOM이 준비되면 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupMouseBackButtonPrevention);
} else {
  setupMouseBackButtonPrevention();
}

// API 정의
const api: ElectronAPI = {
  getTables: () => ipcRenderer.invoke('db:getTables'),
  getTableData: (tableName: string) => ipcRenderer.invoke('db:getTableData', tableName),
  getDbPath: () => ipcRenderer.invoke('db:getPath'),
  openDbFile: () => ipcRenderer.invoke('db:openFile'),
  getCategories: () => ipcRenderer.invoke('db:getCategories'),
  getRecords: (categoryId: string) => ipcRenderer.invoke('db:getRecords', categoryId),
  addCategory: (category: NewCategory) => ipcRenderer.invoke('db:addCategory', category),
  updateCategory: (id: string, updates: CategoryUpdate) => ipcRenderer.invoke('db:updateCategory', id, updates),
  deleteCategory: (id: string) => ipcRenderer.invoke('db:deleteCategory', id),
  moveCategoryToProfile: (categoryId: string, targetProfileId: string) => ipcRenderer.invoke('db:moveCategoryToProfile', categoryId, targetProfileId),
  exportCategoryRecords: (categoryId: string, format: 'csv' | 'xlsx') => ipcRenderer.invoke('category:exportRecords', categoryId, format),
  importCategoryRecords: (categoryId: string, format: 'csv' | 'xlsx') => ipcRenderer.invoke('category:importRecords', categoryId, format),
  addRecord: (record: NewRecord) => ipcRenderer.invoke('db:addRecord', record),
  updateRecord: (id: string, data: Record<string, any>) => ipcRenderer.invoke('db:updateRecord', id, data),
  deleteRecord: (id: string) => ipcRenderer.invoke('db:deleteRecord', id),
  exportCategory: (categoryId: string) => ipcRenderer.invoke('category:export', categoryId),
  importCategories: () => ipcRenderer.invoke('category:import'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  openFileDialog: (defaultPath?: string) => ipcRenderer.invoke('openFileDialog', defaultPath),
  openDirectoryDialog: () => ipcRenderer.invoke('openDirectoryDialog'),
  openImageFileDialog: (defaultPath?: string) => ipcRenderer.invoke('openImageFileDialog', defaultPath),
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  openFile: (filePath: string) => ipcRenderer.invoke('openFile', filePath),
  checkFileExists: (filePath: string) => ipcRenderer.invoke('checkFileExists', filePath),
  getDashboardWarnings: (previewLimit?: number) => ipcRenderer.invoke('dashboard:getWarnings', previewLimit),
  generateThumbnail: (filePath: string) => ipcRenderer.invoke('generateThumbnail', filePath),
  getThumbnailDataUrl: (filePath: string) => ipcRenderer.invoke('getThumbnailDataUrl', filePath),
  getFileDataUrl: (filePath: string) => ipcRenderer.invoke('getFileDataUrl', filePath),
  getVideoBlobUrl: (filePath: string) => ipcRenderer.invoke('getVideoBlobUrl', filePath),
  getVideoStream: (filePath: string) => ipcRenderer.invoke('getVideoStream', filePath),
  getArchiveFiles: (filePath: string) => ipcRenderer.invoke('getArchiveFiles', filePath),
  getArchiveFileDataUrl: (filePath: string, fileName: string) => ipcRenderer.invoke('getArchiveFileDataUrl', filePath, fileName),
  getArchiveFileText: (filePath: string, fileName: string) => ipcRenderer.invoke('getArchiveFileText', filePath, fileName),
  getArchiveFileStreamInfo: (filePath: string, fileName: string) => ipcRenderer.invoke('getArchiveFileStreamInfo', filePath, fileName),
  getConfig: () => ipcRenderer.invoke('getConfig'),
  openBackupLocation: () => ipcRenderer.invoke('openBackupLocation'),
  backupDatabase: () => ipcRenderer.invoke('backupDatabase'),
  resetDatabase: () => ipcRenderer.invoke('resetDatabase'),
  setDbPath: () => ipcRenderer.invoke('setDbPath'),
  setBackupDir: () => ipcRenderer.invoke('setBackupDir'),
  setBackupInterval: (minutes: number) => ipcRenderer.invoke('setBackupInterval', minutes),
  setRememberWindowBounds: (enabled: boolean) => ipcRenderer.invoke('setRememberWindowBounds', enabled),
  setZoomPercent: (percent: number) => ipcRenderer.invoke('setZoomPercent', percent),
  setThumbnailPreviewScale: (scale: number) => ipcRenderer.invoke('setThumbnailPreviewScale', scale),
  setDefaultGalleryZoom: (scale: number) => ipcRenderer.invoke('setDefaultGalleryZoom', scale),
  setDateParseFormats: (formats: string[]) => ipcRenderer.invoke('setDateParseFormats', formats),
  setAppPassword: (password: string) => ipcRenderer.invoke('setAppPassword', password),
  clearAppPassword: () => ipcRenderer.invoke('clearAppPassword'),
  verifyAppPassword: (password: string) => ipcRenderer.invoke('verifyAppPassword', password),
  getProfiles: () => ipcRenderer.invoke('profiles:getAll'),
  getCurrentProfile: () => ipcRenderer.invoke('profiles:getCurrent'),
  selectProfile: (profileId: string) => ipcRenderer.invoke('profiles:select', profileId),
  clearCurrentProfile: () => ipcRenderer.invoke('profiles:clearCurrent'),
  createProfile: (payload: { name: string; avatarColor?: string }) => ipcRenderer.invoke('profiles:create', payload),
  updateProfile: (profileId: string, updates: { name?: string; avatarColor?: string }) => ipcRenderer.invoke('profiles:update', profileId, updates),
  deleteProfile: (profileId: string) => ipcRenderer.invoke('profiles:delete', profileId),
  setVideoSeekSeconds: (seconds: number) => ipcRenderer.invoke('setVideoSeekSeconds', seconds),
  setVideoAutoPlay: (enabled: boolean) => ipcRenderer.invoke('setVideoAutoPlay', enabled),
  setListThumbnailFit: (fit: 'cover' | 'contain') => ipcRenderer.invoke('setListThumbnailFit', fit),
  checkDuplicate: (categoryId: string, fieldId: string, value: any, recordId?: string) => ipcRenderer.invoke('db:checkDuplicate', categoryId, fieldId, value, recordId),
  getAppRoot: () => ipcRenderer.invoke('getAppRoot'),
  getFileType: (filePath: string) => ipcRenderer.invoke('db:getFileType', filePath),
  getFileSize: (filePath: string) => ipcRenderer.invoke('getFileSize', filePath),
  getVideoServerPort: () => ipcRenderer.invoke('getVideoServerPort'),
  deleteThumbnail: (filePath: string, context?: { recordId?: string; categoryId?: string; profileId?: string }) => ipcRenderer.invoke('deleteThumbnail', filePath, context),
  generateThumbnailWithTime: (filePath: string, timestampSec: number, context?: { recordId?: string; categoryId?: string; profileId?: string }) => ipcRenderer.invoke('generateThumbnailWithTime', filePath, timestampSec, context),
  regenerateThumbnail: (filePath: string, context?: { recordId?: string; categoryId?: string; profileId?: string }) => ipcRenderer.invoke('regenerateThumbnail', filePath, context),
  setCustomThumbnail: (filePath: string, imagePath: string, context?: { recordId?: string; categoryId?: string; profileId?: string }) => ipcRenderer.invoke('setCustomThumbnail', filePath, imagePath, context),
  removeCustomThumbnail: (filePath: string, context?: { recordId?: string; categoryId?: string; profileId?: string }) => ipcRenderer.invoke('removeCustomThumbnail', filePath, context),
  getVideoDuration: (filePath: string) => ipcRenderer.invoke('getVideoDuration', filePath),
  getVideoCodecInfo: (filePath: string) => ipcRenderer.invoke('getVideoCodecInfo', filePath),
  getBookmarks: (categoryId, recordId) => ipcRenderer.invoke('getBookmarks', categoryId, recordId),
  addBookmark: (categoryId, recordId, time) => ipcRenderer.invoke('addBookmark', categoryId, recordId, time),
  removeBookmark: (categoryId, recordId, time) => ipcRenderer.invoke('removeBookmark', categoryId, recordId, time),
  getThumbnailDataUrlHybrid: (record, filePath) => ipcRenderer.invoke('getThumbnailDataUrlHybrid', record, filePath),
  migrateThumbnailPaths: () => ipcRenderer.invoke('migrateThumbnailPaths'),
  checkThumbnailSync: () => ipcRenderer.invoke('checkThumbnailSync'),
  cleanupThumbnailSync: (options) => ipcRenderer.invoke('cleanupThumbnailSync', options),
};

// API를 window 객체에 노출
contextBridge.exposeInMainWorld('electronAPI', api); 
