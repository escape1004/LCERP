import { ipcMain } from 'electron';
import { Database } from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

const dbPath = path.join(app.getPath('userData'), 'data.db');
const db = new Database(dbPath);

export const registerCategoryHandlers = () => {
  ipcMain.handle('getCategories', async () => {
    return db.prepare('SELECT * FROM categories').all();
  });

  ipcMain.handle('addCategory', async (_, category) => {
    const result = db.prepare(
      'INSERT INTO categories (id, name, parentId) VALUES (?, ?, ?)'
    ).run(category.id, category.name, category.parentId);
    return result.lastInsertRowid;
  });

  ipcMain.handle('updateCategory', async (_, id, updates) => {
    const sets = Object.keys(updates)
      .map(key => `${key} = ?`)
      .join(', ');
    const values = Object.values(updates);
    
    db.prepare(
      `UPDATE categories SET ${sets} WHERE id = ?`
    ).run(...values, id);
  });

  ipcMain.handle('deleteCategory', async (_, id) => {
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  });
}; 