import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../src/types/electron.d';

export {};

const api: ElectronAPI = {
  getAppUpdateState: () => ipcRenderer.invoke('app-update:get-state'),
  checkForAppUpdates: () => ipcRenderer.invoke('app-update:check'),
  downloadAppUpdate: () => ipcRenderer.invoke('app-update:download'),
  installAppUpdate: () => ipcRenderer.invoke('app-update:install'),
  onAppUpdateState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]) => callback(state);
    ipcRenderer.on('app-update:state', listener);
    return () => ipcRenderer.removeListener('app-update:state', listener);
  },
  getTables: () => ipcRenderer.invoke('db:getTables'),
  getTableData: (tableName: string, options?: { page?: number; pageSize?: number }) => ipcRenderer.invoke('db:getTableData', tableName, options),
  getDbPath: () => ipcRenderer.invoke('db:getPath'),
  openDbFile: () => ipcRenderer.invoke('db:openFile'),
  getCategories: () => ipcRenderer.invoke('db:getCategories'),
  addCategory: (category: any) => ipcRenderer.invoke('db:addCategory', category),
  updateCategory: (id: string, updates: any) => ipcRenderer.invoke('db:updateCategory', id, updates),
  deleteCategory: (id: string) => ipcRenderer.invoke('db:deleteCategory', id),
  moveCategoryToProfile: (categoryId: string, targetProfileId: string) => ipcRenderer.invoke('db:moveCategoryToProfile', categoryId, targetProfileId),
  exportCategoryRecords: (categoryId: string, format: 'csv' | 'xlsx') => ipcRenderer.invoke('category:exportRecords', categoryId, format),
  importCategoryRecords: (categoryId: string, format: 'csv' | 'xlsx') => ipcRenderer.invoke('category:importRecords', categoryId, format),
  getRecords: (categoryId: string) => ipcRenderer.invoke('db:getRecords', categoryId),
  addRecord: (record: any) => ipcRenderer.invoke('db:addRecord', record),
  updateRecord: (id: string, data: any) => ipcRenderer.invoke('db:updateRecord', id, data),
  deleteRecord: (id: string) => ipcRenderer.invoke('db:deleteRecord', id),
  backupDatabase: () => ipcRenderer.invoke('backupDatabase'),
  openBackupLocation: () => ipcRenderer.invoke('openBackupLocation'),
  getConfig: () => ipcRenderer.invoke('getConfig'),
  setBackupDir: () => ipcRenderer.invoke('setBackupDir'),
  setBackupInterval: (minutes: number) => ipcRenderer.invoke('setBackupInterval', minutes),
  setBackupEnabled: (enabled: boolean) => ipcRenderer.invoke('setBackupEnabled', enabled),
  setRememberWindowBounds: (enabled: boolean) => ipcRenderer.invoke('setRememberWindowBounds', enabled),
  setMuteAudioWhenBackgrounded: (enabled: boolean) => ipcRenderer.invoke('setMuteAudioWhenBackgrounded', enabled),
  setPictureInPictureActive: (active: boolean) => ipcRenderer.invoke('setPictureInPictureActive', active),
  setVideoHoverPreviewEnabled: (enabled: boolean) => ipcRenderer.invoke('setVideoHoverPreviewEnabled', enabled),
  setZoomPercent: (percent: number) => ipcRenderer.invoke('setZoomPercent', percent),
  setThumbnailPreviewScale: (scale: number) => ipcRenderer.invoke('setThumbnailPreviewScale', scale),
  setDateParseFormats: (formats: string[]) => ipcRenderer.invoke('setDateParseFormats', formats),
  setTranslationTargetLanguage: (language: string) => ipcRenderer.invoke('setTranslationTargetLanguage', language),
  setTranslationModel: (model: string) => ipcRenderer.invoke('setTranslationModel', model),
  setOpenAiApiKey: (apiKey: string) => ipcRenderer.invoke('setOpenAiApiKey', apiKey),
  clearOpenAiApiKey: () => ipcRenderer.invoke('clearOpenAiApiKey'),
  translateText: (payload: { text: string; targetLanguage: string }) => ipcRenderer.invoke('translateText', payload),
  setAppPassword: (password: string) => ipcRenderer.invoke('setAppPassword', password),
  setPasswordLockSettings: (maxAttempts: number, durationMinutes: number) => ipcRenderer.invoke('setPasswordLockSettings', maxAttempts, durationMinutes),
  setIdleLockMinutes: (minutes: number) => ipcRenderer.invoke('setIdleLockMinutes', minutes),
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
  openFileDialog: () => ipcRenderer.invoke('openFileDialog'),
  openDirectoryDialog: () => ipcRenderer.invoke('openDirectoryDialog'),
  getAppRoot: () => ipcRenderer.invoke('getAppRoot'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  onRandomRecordShortcut: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('shortcut:random-record', listener);
    return () => ipcRenderer.removeListener('shortcut:random-record', listener);
  },
  getDashboardWarnings: (previewLimit?: number) => ipcRenderer.invoke('dashboard:getWarnings', previewLimit),
  incrementRecordViewCount: (categoryId: string, recordId: string) => ipcRenderer.invoke('record:incrementViewCount', categoryId, recordId),
  getRecordViewCounts: () => ipcRenderer.invoke('dashboard:getRecordViewCounts'),
  getVideoDuration: (filePath: string) => ipcRenderer.invoke('getVideoDuration', filePath),
  getVideoCodecInfo: (filePath: string) => ipcRenderer.invoke('getVideoCodecInfo', filePath),
  getBookmarks: (categoryId: string, recordId: string) => ipcRenderer.invoke('getBookmarks', categoryId, recordId),
  addBookmark: (categoryId: string, recordId: string, time: number) => ipcRenderer.invoke('addBookmark', categoryId, recordId, time),
  removeBookmark: (categoryId: string, recordId: string, time: number) => ipcRenderer.invoke('removeBookmark', categoryId, recordId, time),
  removeAllBookmarks: (categoryId: string, recordId: string) => ipcRenderer.invoke('removeAllBookmarks', categoryId, recordId),
  checkThumbnailSync: () => ipcRenderer.invoke('checkThumbnailSync'),
  cleanupThumbnailSync: (options?: any) => ipcRenderer.invoke('cleanupThumbnailSync', options),
  cleanupOrphanThumbnails: () => ipcRenderer.invoke('cleanupOrphanThumbnails'),
};

contextBridge.exposeInMainWorld('electronAPI', api); 
