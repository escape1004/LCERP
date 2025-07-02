import { ipcMain } from 'electron';
import Database from 'better-sqlite3';

export const registerBookmarkHandlers = (db: Database.Database) => {
  console.log('=== Registering bookmark handlers ===');
  
  ipcMain.handle('getBookmarks', async (_event, categoryId: string, recordId: string) => {
    console.log('=== getBookmarks called with:', categoryId, recordId);
    const record = db.prepare("SELECT data FROM records WHERE categoryId = ? AND id = ?").get(categoryId, recordId) as { data: string } | undefined;
    if (!record) return { success: false, error: "Record not found" };
    const data = JSON.parse(record.data);
    return { success: true, bookmarks: data.bookmarks || [] };
  });

  ipcMain.handle('addBookmark', async (_event, categoryId: string, recordId: string, time: number) => {
    console.log('=== addBookmark called with:', categoryId, recordId, time);
    const record = db.prepare("SELECT data FROM records WHERE categoryId = ? AND id = ?").get(categoryId, recordId) as { data: string } | undefined;
    if (!record) return { success: false, error: "Record not found" };
    const data = JSON.parse(record.data);
    if (!data.bookmarks) data.bookmarks = [];
    if (data.bookmarks.find((b: any) => Math.abs(b.time - time) < 1)) {
      return { success: false, error: "이미 해당 시간에 북마크가 있습니다." };
    }
    const newBookmark = { time, createdAt: new Date().toISOString() };
    data.bookmarks.push(newBookmark);
    data.bookmarks.sort((a: any, b: any) => a.time - b.time);
    db.prepare("UPDATE records SET data = ?, updatedAt = ? WHERE categoryId = ? AND id = ?")
      .run(JSON.stringify(data), new Date().toISOString(), categoryId, recordId);
    return { success: true, bookmark: newBookmark };
  });

  ipcMain.handle('removeBookmark', async (_event, categoryId: string, recordId: string, time: number) => {
    console.log('=== removeBookmark called with:', categoryId, recordId, time);
    const record = db.prepare("SELECT data FROM records WHERE categoryId = ? AND id = ?").get(categoryId, recordId) as { data: string } | undefined;
    if (!record) return { success: false, error: "Record not found" };
    const data = JSON.parse(record.data);
    if (!data.bookmarks) return { success: false, error: "북마크가 없습니다." };
    const idx = data.bookmarks.findIndex((b: any) => Math.abs(b.time - time) < 1);
    if (idx === -1) return { success: false, error: "해당 시간의 북마크를 찾을 수 없습니다." };
    data.bookmarks.splice(idx, 1);
    db.prepare("UPDATE records SET data = ?, updatedAt = ? WHERE categoryId = ? AND id = ?")
      .run(JSON.stringify(data), new Date().toISOString(), categoryId, recordId);
    return { success: true };
  });
}; 