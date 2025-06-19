import { ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { getThumbnailHash } from '../../lib/fileHandler';
import Database from 'better-sqlite3';

export const registerBasicHandlers = (db: Database.Database) => {
  ipcMain.handle('openExternal', async (_, url: string) => {
    return shell.openExternal(url);
  });

  ipcMain.handle('getCategories', async () => {
    return db.prepare('SELECT * FROM categories').all();
  });

  ipcMain.handle('getThumbnailDataUrl', async (_, filePath: string) => {
    const thumbnailDir = path.join('save', 'thumbnails');
    const hash = getThumbnailHash(filePath);
    const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
    try {
      if (!fs.existsSync(thumbnailPath)) {
        return null;
      }
      const data = fs.readFileSync(thumbnailPath);
      return `data:image/jpeg;base64,${data.toString('base64')}`;
    } catch (e) {
      console.error('[썸네일 조회 에러]', e);
      return null;
    }
  });
}; 