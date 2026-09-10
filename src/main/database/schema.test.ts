import { afterEach, expect, test } from 'vitest';
import { applyDatabaseSchema } from './schema';
import { openTempSqlite } from '../../test/temp-sqlite';

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

test('creates the current schema on a temporary sqlite file', () => {
  const temp = openTempSqlite();
  cleanup = temp.close;

  applyDatabaseSchema(temp.database);

  const tables = temp.database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row: { name: string }) => row.name);

  expect(tables).toEqual(expect.arrayContaining([
    'categories',
    'profiles',
    'record_view_counts',
    'records',
  ]));

  const recordColumns = temp.database
    .prepare('PRAGMA table_info(records)')
    .all()
    .map((row: { name: string }) => row.name);

  expect(recordColumns).toEqual(expect.arrayContaining([
    'id',
    'profileId',
    'categoryId',
    'data',
    'duration',
    'thumbnailPath',
    'thumbnailTimestamp',
  ]));
});

test('adds missing columns when migrating an older sqlite file', () => {
  const temp = openTempSqlite();
  cleanup = temp.close;

  temp.database.exec(`
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parentId TEXT,
      fields TEXT NOT NULL,
      order_num INTEGER,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE TABLE records (
      id TEXT PRIMARY KEY,
      categoryId TEXT NOT NULL,
      data TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);
  temp.database.prepare(
    'INSERT INTO records (id, categoryId, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
  ).run('rec-1', 'cat-1', '{"title":"kept"}', '2024-01-01', '2024-01-01');

  applyDatabaseSchema(temp.database);

  const categoryColumns = temp.database
    .prepare('PRAGMA table_info(categories)')
    .all()
    .map((row: { name: string }) => row.name);
  const recordColumns = temp.database
    .prepare('PRAGMA table_info(records)')
    .all()
    .map((row: { name: string }) => row.name);
  const preserved = temp.database.prepare('SELECT data FROM records WHERE id = ?').get('rec-1') as { data: string };

  expect(categoryColumns).toEqual(expect.arrayContaining(['profileId', 'itemType', 'memo']));
  expect(recordColumns).toEqual(expect.arrayContaining([
    'profileId',
    'duration',
    'thumbnailPath',
    'thumbnailTimestamp',
  ]));
  expect(JSON.parse(preserved.data)).toEqual({ title: 'kept' });
});
