export function applyDatabaseSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE,
      avatarColor TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )
  `);

  database.exec(`
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

  database.exec(`
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

  database.exec(`
    CREATE TABLE IF NOT EXISTS record_view_counts (
      profileId TEXT NOT NULL,
      recordId TEXT NOT NULL,
      categoryId TEXT NOT NULL,
      viewCount INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (profileId, recordId)
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_record_view_counts_profile_category ON record_view_counts(profileId, categoryId)');

  const categoryColumns = database.prepare('PRAGMA table_info(categories)').all();
  if (!categoryColumns.some((col) => col.name === 'profileId')) {
    database.exec('ALTER TABLE categories ADD COLUMN profileId TEXT');
  }
  if (!categoryColumns.some((col) => col.name === 'itemType')) {
    database.exec("ALTER TABLE categories ADD COLUMN itemType TEXT DEFAULT 'category'");
    database.exec("UPDATE categories SET itemType = 'category' WHERE itemType IS NULL OR itemType = ''");
  }
  if (!categoryColumns.some((col) => col.name === 'memo')) {
    database.exec('ALTER TABLE categories ADD COLUMN memo TEXT');
  }

  const columns = database.prepare('PRAGMA table_info(records)').all();
  if (!columns.some((col) => col.name === 'duration')) {
    database.exec('ALTER TABLE records ADD COLUMN duration INTEGER');
  }
  if (!columns.some((col) => col.name === 'thumbnailPath')) {
    database.exec('ALTER TABLE records ADD COLUMN thumbnailPath TEXT');
  }
  if (!columns.some((col) => col.name === 'thumbnailTimestamp')) {
    database.exec('ALTER TABLE records ADD COLUMN thumbnailTimestamp REAL');
  }
  if (!columns.some((col) => col.name === 'profileId')) {
    database.exec('ALTER TABLE records ADD COLUMN profileId TEXT');
  }
}
