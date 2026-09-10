import { db, ensureDefaultProfile, log } from './store';

export function initializeDatabase() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE,
        avatarColor TEXT,
        createdAt TEXT,
        updatedAt TEXT
      )
    `);

    // 카테고리 테이블
    db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        profileId TEXT,
        name TEXT NOT NULL COLLATE NOCASE,
        parentId TEXT,
        fields TEXT NOT NULL,
        order_num INTEGER,
        itemType TEXT DEFAULT 'category',
        memo TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        FOREIGN KEY (parentId) REFERENCES categories(id)
      )
    `);

    // 레코드 테이블
    db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        profileId TEXT,
        categoryId TEXT NOT NULL,
        data TEXT NOT NULL,
        createdAt TEXT,
        updatedAt TEXT,
        duration INTEGER,
        thumbnailTimestamp REAL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS record_view_counts (
        profileId TEXT NOT NULL,
        recordId TEXT NOT NULL,
        categoryId TEXT NOT NULL,
        viewCount INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (profileId, recordId)
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_record_view_counts_profile_category ON record_view_counts(profileId, categoryId)');

    // duration 필드가 없으면 추가 (마이그레이션)
    const categoryColumns = db.prepare("PRAGMA table_info(categories)").all();
    if (!categoryColumns.some(col => col.name === 'profileId')) {
      db.exec('ALTER TABLE categories ADD COLUMN profileId TEXT');
    }
    if (!categoryColumns.some(col => col.name === 'itemType')) {
      db.exec("ALTER TABLE categories ADD COLUMN itemType TEXT DEFAULT 'category'");
      db.exec("UPDATE categories SET itemType = 'category' WHERE itemType IS NULL OR itemType = ''");
    }
    if (!categoryColumns.some(col => col.name === 'memo')) {
      db.exec('ALTER TABLE categories ADD COLUMN memo TEXT');
    }

    const columns = db.prepare("PRAGMA table_info(records)").all();
    if (!columns.some(col => col.name === 'duration')) {
      db.exec('ALTER TABLE records ADD COLUMN duration INTEGER');
    }

    // thumbnailPath 필드가 없으면 추가 (새로운 마이그레이션)
    if (!columns.some(col => col.name === 'thumbnailPath')) {
      db.exec('ALTER TABLE records ADD COLUMN thumbnailPath TEXT');
    }

    if (!columns.some(col => col.name === 'thumbnailTimestamp')) {
      db.exec('ALTER TABLE records ADD COLUMN thumbnailTimestamp REAL');
    }

    if (!columns.some(col => col.name === 'profileId')) {
      db.exec('ALTER TABLE records ADD COLUMN profileId TEXT');
    }

    const defaultProfile = ensureDefaultProfile();
    db.prepare('UPDATE categories SET profileId = ? WHERE profileId IS NULL OR profileId = ?').run(defaultProfile.id, '');
    db.prepare('UPDATE records SET profileId = ? WHERE profileId IS NULL OR profileId = ?').run(defaultProfile.id, '');
  } catch (error) {
    log('Error initializing database:', error);
    throw error;
  }
}
