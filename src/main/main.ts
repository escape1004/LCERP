import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { registerCategoryHandlers } from './ipc/category';
import { registerRecordHandlers } from './ipc/record';
import { registerDatabaseHandlers } from './ipc/database';

const isDevelopment = process.env.NODE_ENV === 'development';

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, isDevelopment ? '../src/main/preload.ts' : '../dist/preload.js')
    }
  });

  if (isDevelopment) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  return win;
};

const registerShellHandlers = () => {
  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
};

app.whenReady().then(() => {
  registerCategoryHandlers();
  registerRecordHandlers();
  registerDatabaseHandlers();
  registerShellHandlers();
  
  const mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
}); 