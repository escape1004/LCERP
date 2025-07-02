import { ipcMain } from 'electron';

// 북마크 저장소 (앱 재시작 시 초기화됨)
const bookmarkStore: {
  [categoryId: string]: {
    [recordId: string]: { time: number; createdAt: string }[];
  };
} = {};

export const registerBookmarkHandlers = () => {
  console.log('[IPC] Registering bookmark handlers...');

  ipcMain.handle('getBookmarks', async (_event, categoryId: string, recordId: string) => {
    console.log('[IPC] getBookmarks called:', { categoryId, recordId });
    try {
      const bookmarks = bookmarkStore[categoryId]?.[recordId] || [];
      return { success: true, bookmarks };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('addBookmark', async (_event, categoryId: string, recordId: string, time: number) => {
    console.log('[IPC] addBookmark called:', { categoryId, recordId, time });
    try {
      if (!bookmarkStore[categoryId]) bookmarkStore[categoryId] = {};
      if (!bookmarkStore[categoryId][recordId]) bookmarkStore[categoryId][recordId] = [];
      // 중복 방지
      if (bookmarkStore[categoryId][recordId].some(b => b.time === time)) {
        return { success: false, error: '이미 해당 시간에 북마크가 존재합니다.' };
      }
      const bookmark = { time, createdAt: new Date().toISOString() };
      bookmarkStore[categoryId][recordId].push(bookmark);
      bookmarkStore[categoryId][recordId].sort((a, b) => a.time - b.time);
      return { success: true, bookmark };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('removeBookmark', async (_event, categoryId: string, recordId: string, time: number) => {
    console.log('[IPC] removeBookmark called:', { categoryId, recordId, time });
    try {
      if (!bookmarkStore[categoryId]?.[recordId]) {
        return { success: false, error: '해당 북마크가 없습니다.' };
      }
      bookmarkStore[categoryId][recordId] = bookmarkStore[categoryId][recordId].filter(b => b.time !== time);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  console.log('[IPC] bookmark handlers registered successfully');
}; 