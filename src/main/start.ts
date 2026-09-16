import { app, BrowserWindow } from 'electron';
import { db, migratePersistedOpenAiSecrets } from './store';
import { createWindow, registerProtocol } from './app/window';
import { initializeDatabase } from './database';
import { startAutomaticBackup, stopAutomaticBackup } from './services/backup';
import { registerLocalVideoProtocol, startVideoHttpServer } from './services/videoServer';
import { registerAllIpcHandlers } from './ipc';

export function focusExistingInstance() {
  const window = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed());
  if (!window) {
    if (app.isReady()) {
      createWindow();
    }
    return;
  }

  if (window.isMinimized()) {
    window.restore();
  }
  if (!window.isVisible()) {
    window.show();
  }
  window.focus();
}

export function startMainApp() {
  registerAllIpcHandlers();

  app.whenReady().then(() => {
    migratePersistedOpenAiSecrets();
    registerProtocol();
    initializeDatabase();
    startAutomaticBackup({ runImmediately: true });
    createWindow();
    startVideoHttpServer();
    registerLocalVideoProtocol();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      stopAutomaticBackup();
      db.close();
      app.quit();
    }
  });
}
