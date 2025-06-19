import { ipcMain } from 'electron';
import { Database } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getThumbnailHash } from '../../lib/fileHandler';

let db: Database;

// 썸네일 파일 삭제 함수
const deleteThumbnail = (filePath: string) => {
  try {
    const thumbnailDir = path.join(process.cwd(), 'save', 'thumbnails');
    const hash = getThumbnailHash(filePath);
    const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
    
    if (fs.existsSync(thumbnailPath)) {
      fs.unlinkSync(thumbnailPath);
      console.log('썸네일 삭제됨:', thumbnailPath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('썸네일 삭제 실패:', error);
    return false;
  }
};

// 카테고리의 모든 레코드에서 썸네일 정리
const cleanupThumbnailsForCategory = (categoryId: string) => {
  try {
    const records = db.prepare('SELECT data FROM records WHERE categoryId = ?').all(categoryId);
    let deletedCount = 0;
    
    records.forEach(record => {
      const data = JSON.parse(record.data);
      
      // 파일 필드 찾기
      const category = db.prepare('SELECT fields FROM categories WHERE id = ?').get(categoryId);
      if (!category) return;
      
      const fields = JSON.parse(category.fields);
      const fileField = fields.find((f: any) => f.type === 'file');
      
      if (fileField && data[fileField.id]) {
        const filePath = data[fileField.id];
        if (deleteThumbnail(filePath)) {
          deletedCount++;
        }
      }
    });
    
    console.log(`카테고리 ${categoryId}에서 ${deletedCount}개 썸네일 정리됨`);
    return deletedCount;
  } catch (error) {
    console.error('썸네일 정리 중 오류:', error);
    return 0;
  }
};

// 관계형 데이터에서 참조 정리
const cleanupRelationReferences = (categoryId: string) => {
  try {
    // 모든 카테고리를 가져와서 relation 필드 확인
    const allCategories = db.prepare('SELECT id, fields FROM categories').all();
    let updatedCount = 0;
    
    allCategories.forEach(cat => {
      const fields = JSON.parse(cat.fields);
      const relationFields = fields.filter((f: any) => f.type === 'relation' && f.relationCategoryId === categoryId);
      
      if (relationFields.length > 0) {
        // 해당 카테고리의 모든 레코드 확인
        const records = db.prepare('SELECT id, data FROM records WHERE categoryId = ?').all(cat.id);
        
        records.forEach(record => {
          const data = JSON.parse(record.data);
          let hasChanges = false;
          
          relationFields.forEach((field: any) => {
            const value = data[field.id];
            
            if (field.multiple && Array.isArray(value)) {
              // 다중 선택인 경우 해당 카테고리 ID 제거
              const filteredValue = value.filter((id: string) => id !== categoryId);
              if (filteredValue.length !== value.length) {
                data[field.id] = filteredValue;
                hasChanges = true;
              }
            } else if (value === categoryId) {
              // 단일 선택인 경우 null로 설정
              data[field.id] = null;
              hasChanges = true;
            }
          });
          
          if (hasChanges) {
            db.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), record.id);
            updatedCount++;
          }
        });
      }
    });
    
    console.log(`관계형 참조 정리 완료: ${updatedCount}개 레코드 업데이트됨`);
    return updatedCount;
  } catch (error) {
    console.error('관계형 참조 정리 중 오류:', error);
    return 0;
  }
};

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
    if (updates.order_num !== undefined && updates.order_num !== null) {
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
    console.log('카테고리 삭제 시작:', id);
    
    // 1. 관계형 데이터에서 참조 정리
    const relationCleanupCount = cleanupRelationReferences(id);
    
    // 2. 하위 카테고리들의 썸네일 정리 및 삭제
    const childCategories = db.prepare('SELECT id FROM categories WHERE parentId = ?').all(id);
    let totalThumbnailCount = 0;
    
    childCategories.forEach(child => {
      totalThumbnailCount += cleanupThumbnailsForCategory(child.id);
    });
    
    // 3. 현재 카테고리의 썸네일 정리
    totalThumbnailCount += cleanupThumbnailsForCategory(id);
    
    // 4. 하위 카테고리 먼저 삭제
    db.prepare('DELETE FROM categories WHERE parentId = ?').run(id);
    
    // 5. 카테고리에 속한 레코드 삭제
    db.prepare('DELETE FROM records WHERE categoryId = ?').run(id);
    
    // 6. 카테고리 삭제
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    
    console.log(`카테고리 삭제 완료: ${totalThumbnailCount}개 썸네일 정리, ${relationCleanupCount}개 관계형 참조 정리`);
    
    return {
      success: true,
      thumbnailCleanupCount: totalThumbnailCount,
      relationCleanupCount: relationCleanupCount
    };
  });

  console.log('Category handlers registered successfully');
}; 