import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { log } from './store';

export let appUpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  latestVersion: null,
  updateAvailable: false,
  progress: 0,
  transferred: 0,
  total: 0,
  bytesPerSecond: 0,
  error: null
};
export let updateCheckPromise = null;
export let updateDownloadPromise = null;

export function broadcastAppUpdateState() {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('app-update:state', appUpdateState);
    }
  });
}

export function setAppUpdateState(updates) {
  appUpdateState = { ...appUpdateState, ...updates };
  broadcastAppUpdateState();
  return appUpdateState;
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;

autoUpdater.on('checking-for-update', () => {
  setAppUpdateState({ status: 'checking', error: null });
});

autoUpdater.on('update-available', (info) => {
  setAppUpdateState({
    status: 'available',
    latestVersion: info.version,
    updateAvailable: true,
    progress: 0,
    error: null
  });
});

autoUpdater.on('update-not-available', (info) => {
  setAppUpdateState({
    status: 'not-available',
    latestVersion: info?.version || app.getVersion(),
    updateAvailable: false,
    progress: 0,
    error: null
  });
});

autoUpdater.on('download-progress', (progress) => {
  setAppUpdateState({
    status: 'downloading',
    progress: Math.max(0, Math.min(100, progress.percent || 0)),
    transferred: progress.transferred || 0,
    total: progress.total || 0,
    bytesPerSecond: progress.bytesPerSecond || 0,
    error: null
  });
});

autoUpdater.on('update-downloaded', (info) => {
  setAppUpdateState({
    status: 'downloaded',
    latestVersion: info.version || appUpdateState.latestVersion,
    updateAvailable: true,
    progress: 100,
    error: null
  });
});

autoUpdater.on('error', (error) => {
  log('자동 업데이트 오류:', error?.message || error);
  setAppUpdateState({
    status: 'error',
    error: error?.message || '업데이트 처리 중 오류가 발생했습니다.'
  });
});

export async function checkForAppUpdates() {
  if (!app.isPackaged) {
    return setAppUpdateState({
      status: 'disabled',
      currentVersion: app.getVersion(),
      latestVersion: null,
      updateAvailable: false,
      error: null
    });
  }

  if (updateCheckPromise) return updateCheckPromise;
  updateCheckPromise = autoUpdater.checkForUpdates()
    .then(() => appUpdateState)
    .catch((error) => {
      log('업데이트 확인 실패:', error?.message || error);
      return setAppUpdateState({
        status: 'error',
        error: error?.message || '업데이트를 확인하지 못했습니다.'
      });
    })
    .finally(() => {
      updateCheckPromise = null;
    });
  return updateCheckPromise;
}

export async function downloadAppUpdate() {
  if (!appUpdateState.updateAvailable) {
    return appUpdateState;
  }
  if (appUpdateState.status === 'downloaded') {
    return appUpdateState;
  }
  if (updateDownloadPromise) return updateDownloadPromise;

  setAppUpdateState({ status: 'downloading', progress: 0, error: null });
  updateDownloadPromise = autoUpdater.downloadUpdate()
    .then(() => appUpdateState)
    .catch((error) => {
      log('업데이트 다운로드 실패:', error?.message || error);
      return setAppUpdateState({
        status: 'error',
        error: error?.message || '업데이트 파일을 다운로드하지 못했습니다.'
      });
    })
    .finally(() => {
      updateDownloadPromise = null;
    });
  return updateDownloadPromise;
}

export function registerUpdateIpc() {
  ipcMain.handle('app-update:get-state', () => appUpdateState);
  ipcMain.handle('app-update:check', () => checkForAppUpdates());
  ipcMain.handle('app-update:download', () => downloadAppUpdate());
  ipcMain.handle('app-update:install', () => {
    if (!app.isPackaged || appUpdateState.status !== 'downloaded') {
      return { success: false, error: '설치할 업데이트가 준비되지 않았습니다.' };
    }

    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { success: true };
  });
}
