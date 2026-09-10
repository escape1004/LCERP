import { ipcMain } from 'electron';
import {
  db,
  ensureCategoryBelongsToCurrentProfile,
  getCurrentProfileIdOrThrow,
  log,
} from '../store';

export function registerBookmarkHandlers() {
  try {
    ipcMain.handle('getBookmarks', async (_event, categoryId, recordId) => {
      const profileId = getCurrentProfileIdOrThrow();
      ensureCategoryBelongsToCurrentProfile(categoryId);
      const record = db.prepare("SELECT data FROM records WHERE categoryId = ? AND id = ? AND profileId = ?").get(categoryId, recordId, profileId);
      if (!record) return { success: false, error: "Record not found" };
      const data = JSON.parse(record.data);
      return { success: true, bookmarks: data.bookmarks || [] };
    });

    ipcMain.handle('addBookmark', async (_event, categoryId, recordId, time) => {
      const profileId = getCurrentProfileIdOrThrow();
      ensureCategoryBelongsToCurrentProfile(categoryId);
      const record = db.prepare("SELECT data FROM records WHERE categoryId = ? AND id = ? AND profileId = ?").get(categoryId, recordId, profileId);
      if (!record) return { success: false, error: "Record not found" };
      const data = JSON.parse(record.data);
      if (!data.bookmarks) data.bookmarks = [];
      if (data.bookmarks.find((b) => Math.abs(b.time - time) < 1)) {
        return { success: false, error: "이미 해당 시간에 북마크가 있습니다." };
      }
      const newBookmark = { time, createdAt: new Date().toISOString() };
      data.bookmarks.push(newBookmark);
      data.bookmarks.sort((a, b) => a.time - b.time);
      db.prepare("UPDATE records SET data = ?, updatedAt = ? WHERE categoryId = ? AND id = ? AND profileId = ?")
        .run(JSON.stringify(data), new Date().toISOString(), categoryId, recordId, profileId);
      return { success: true, bookmark: newBookmark };
    });

    ipcMain.handle('removeBookmark', async (_event, categoryId, recordId, time) => {
      const profileId = getCurrentProfileIdOrThrow();
      ensureCategoryBelongsToCurrentProfile(categoryId);
      const record = db.prepare("SELECT data FROM records WHERE categoryId = ? AND id = ? AND profileId = ?").get(categoryId, recordId, profileId);
      if (!record) return { success: false, error: "Record not found" };
      const data = JSON.parse(record.data);
      if (!data.bookmarks) return { success: false, error: "북마크가 없습니다." };
      const idx = data.bookmarks.findIndex((b) => Math.abs(b.time - time) < 1);
      if (idx === -1) return { success: false, error: "해당 시간의 북마크를 찾을 수 없습니다." };
      data.bookmarks.splice(idx, 1);
      db.prepare("UPDATE records SET data = ?, updatedAt = ? WHERE categoryId = ? AND id = ? AND profileId = ?")
        .run(JSON.stringify(data), new Date().toISOString(), categoryId, recordId, profileId);
      return { success: true };
    });

    ipcMain.handle('removeAllBookmarks', async (_event, categoryId, recordId) => {
      try {
        const profileId = getCurrentProfileIdOrThrow();
        ensureCategoryBelongsToCurrentProfile(categoryId);
        const record = db.prepare("SELECT data FROM records WHERE categoryId = ? AND id = ? AND profileId = ?").get(categoryId, recordId, profileId);
        if (!record) return { success: false, error: "Record not found" };

        const data = JSON.parse(record.data);
        if (data.bookmarks && data.bookmarks.length > 0) {
          data.bookmarks = [];
          db.prepare("UPDATE records SET data = ?, updatedAt = ? WHERE categoryId = ? AND id = ? AND profileId = ?")
            .run(JSON.stringify(data), new Date().toISOString(), categoryId, recordId, profileId);
        }
        return { success: true };
      } catch (error) {
        console.error('Failed to remove all bookmarks:', error);
        return { success: false, error: error.message };
      }
    });

    log('Bookmark handlers registered');
  } catch (e) {
    log('Bookmark handler registration failed', e);
  }
}
