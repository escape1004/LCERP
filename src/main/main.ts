import { app, BrowserWindow } from 'electron';
import { db } from './store';
import { createWindow, registerProtocol } from './app/window';
import { initializeDatabase } from './database/migrations';
import { startAutomaticBackup, stopAutomaticBackup } from './services/backup';
import { registerLocalVideoProtocol, startVideoHttpServer } from './services/videoServer';
import { registerAllIpcHandlers } from './ipc';

registerAllIpcHandlers();

app.whenReady().then(() => {
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
