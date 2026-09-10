export const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';

export function applyConnectionPragmas(database) {
  database.exec('PRAGMA encoding = "UTF-8"');
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA journal_mode = WAL');
}

export function tableExists(database, tableName) {
  const row = database.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(tableName);
  return Boolean(row);
}

export function columnExists(database, tableName, columnName) {
  return getTableColumns(database, tableName).includes(columnName);
}

export function indexExists(database, indexName) {
  const row = database.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1"
  ).get(indexName);
  return Boolean(row);
}

export function getTableColumns(database, tableName) {
  if (!tableExists(database, tableName)) return [];
  return database.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

export function addColumnIfMissing(database, tableName, columnName, definition) {
  if (columnExists(database, tableName, columnName)) return false;
  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  return true;
}

export function ensureSchemaMigrationsTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      appliedAt TEXT NOT NULL
    )
  `);
}

export function getSchemaVersion(database) {
  if (!tableExists(database, SCHEMA_MIGRATIONS_TABLE)) return 0;
  const row = database.prepare(
    `SELECT MAX(version) AS version FROM ${SCHEMA_MIGRATIONS_TABLE}`
  ).get();
  return Number(row?.version) || 0;
}

export function recordSchemaMigration(database, version, name) {
  database.prepare(
    `INSERT INTO ${SCHEMA_MIGRATIONS_TABLE} (version, name, appliedAt) VALUES (?, ?, ?)`
  ).run(version, name, new Date().toISOString());
}
