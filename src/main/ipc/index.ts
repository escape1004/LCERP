import { ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { getThumbnailHash } from '../../lib/fileHandler';
import Database from 'better-sqlite3';

// 표준화된 응답 타입
interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// 에러 처리 유틸리티 함수
const handleIpcError = (error: any): IpcResponse => {
  console.error('[IPC Error]', error);
  return {
    success: false,
    error: error.message || '알 수 없는 오류가 발생했습니다.'
  };
};

export const registerAllHandlers = (db: Database.Database) => {
  // Shell 관련 핸들러
  ipcMain.handle('shell:openExternal', async (_, url: string): Promise<IpcResponse> => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return handleIpcError(error);
    }
  });

  // 파일 시스템 관련 핸들러
  ipcMain.handle('fs:getThumbnailDataUrl', async (_, filePath: string): Promise<IpcResponse<string | null>> => {
    try {
      const thumbnailDir = path.join('save', 'thumbnails');
      const hash = getThumbnailHash(filePath);
      const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);

      if (!fs.existsSync(thumbnailPath)) {
        return { success: true, data: null };
      }

      const data = fs.readFileSync(thumbnailPath);
      const dataUrl = `data:image/jpeg;base64,${data.toString('base64')}`;
      return { success: true, data: dataUrl };
    } catch (error) {
      return handleIpcError(error);
    }
  });

  // 데이터베이스 관련 핸들러
  ipcMain.handle('db:getCategories', async (): Promise<IpcResponse> => {
    try {
      const categories = db.prepare('SELECT * FROM categories').all();
      return { success: true, data: categories };
    } catch (error) {
      return handleIpcError(error);
    }
  });

  // 이전 버전 호환성을 위한 핸들러 (deprecated)
  ipcMain.handle('openExternal', async (_, url: string) => {
    console.warn('Deprecated: Use shell:openExternal instead');
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return handleIpcError(error);
    }
  });
}; 