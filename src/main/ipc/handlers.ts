import { ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { getThumbnailHash } from '../../lib/fileHandler';

export const registerIpcHandlers = (db: any) => {
  ipcMain.handle('openExternal', async (event, url) => {
    return shell.openExternal(url);
  });

  ipcMain.handle('getCategories', async (event) => {
    return db.prepare('SELECT * FROM categories').all();
  });

  ipcMain.handle('getThumbnailDataUrl', async (event, filePath) => {
    const thumbnailDir = path.join(process.cwd(), 'save', 'thumbnails');
    const hash = getThumbnailHash(filePath);
    const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
    try {
      if (!fs.existsSync(thumbnailPath)) {
        return null;
      }
      const data = fs.readFileSync(thumbnailPath);
      const dataUrl = `data:image/jpeg;base64,${data.toString('base64')}`;
      return dataUrl;
    } catch (e) {
      return null;
    }
  });
}; 