import { app, BrowserWindow } from 'electron';
import { db } from './store';
import { registerUpdateIpc } from './updater';
import { createWindow, registerProtocol } from './window';
import { initializeDatabase } from './database';
import { startAutomaticBackup, stopAutomaticBackup } from './backup';
import { registerLocalVideoProtocol, startVideoHttpServer } from './media/video-server';
import { registerBookmarkHandlers } from './ipc/bookmarks';
import { registerIpcHandlers } from './ipc/register';

registerUpdateIpc();
registerBookmarkHandlers();
registerIpcHandlers();

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
