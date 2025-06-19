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
    console.log('[썸네일 조회용 해시]', filePath, hash);
    const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
    try {
      console.log('[썸네일 폴더 경로]', thumbnailDir);
      console.log('[찾으려는 썸네일 파일]', `thumb_${hash}.jpg`);
      console.log('[폴더 내 실제 파일들]', fs.readdirSync(thumbnailDir));
      console.log('[파일 존재 여부]', fs.existsSync(thumbnailPath));
      if (!fs.existsSync(thumbnailPath)) {
        console.log('[썸네일이 존재하지 않음]', thumbnailPath);
        return null;
      }
      const data = fs.readFileSync(thumbnailPath);
      const dataUrl = `data:image/jpeg;base64,${data.toString('base64')}`;
      console.log('[썸네일 dataUrl 길이]', dataUrl.length);
      return dataUrl;
    } catch (e) {
      console.error('[썸네일 조회 에러]', e);
      return null;
    }
  });
}; 