import { ipcMain } from 'electron';
import { Database } from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

let db: Database;

export const registerCategoryHandlers = () => {
  console.log('Registering category handlers...');

  ipcMain.handle('getCategories', async () => {
    console.log('Getting categories...');
    const categories = db.prepare('SELECT * FROM categories ORDER BY order_num').all();
    console.log('Categories found:', { count: categories.length });
    return categories;
  });

  ipcMain.handle('addCategory', async (_, category) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO categories (id, name, parentId, fields, order_num, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      category.name,
      category.parentId || null,
      JSON.stringify(category.fields),
      category.order_num || 0,
      now,
      now
    );

    return id;
  });

  ipcMain.handle('updateCategory', async (_, id, updates) => {
    const now = new Date().toISOString();
    const fields = updates.fields ? JSON.stringify(updates.fields) : undefined;
    
    const updateFields = [];
    const values = [];
    
    if (updates.name !== undefined) {
      updateFields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.parentId !== undefined) {
      updateFields.push('parentId = ?');
      values.push(updates.parentId);
    }
    if (fields !== undefined) {
      updateFields.push('fields = ?');
      values.push(fields);
    }
    if (updates.order_num !== undefined) {
      updateFields.push('order_num = ?');
      values.push(updates.order_num);
    }
    
    updateFields.push('updatedAt = ?');
    values.push(now);
    values.push(id);
    
    const query = `
      UPDATE categories 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `;
    
    db.prepare(query).run(...values);
  });

  ipcMain.handle('deleteCategory', async (_, id) => {
    // 하위 카테고리 먼저 삭제
    db.prepare('DELETE FROM categories WHERE parentId = ?').run(id);
    
    // 카테고리에 속한 레코드 삭제
    db.prepare('DELETE FROM records WHERE categoryId = ?').run(id);
    
    // 카테고리 삭제
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  });

  console.log('Category handlers registered successfully');
}; 