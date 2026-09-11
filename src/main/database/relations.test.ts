import { expect, test } from 'vitest';
import { cleanupRelationReferencesForDatabase } from './relations';
import { applyDatabaseSchema } from './migrations';
import { withTempSqlite } from '../../test/temp-sqlite';

function seedRelationDb(database) {
  applyDatabaseSchema(database);

  database.prepare(
    'INSERT INTO profiles (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)'
  ).run('profile-1', 'Default', '2024-01-01', '2024-01-01');

  const insertCategory = database.prepare(`
    INSERT INTO categories (id, profileId, name, parentId, fields, order_num, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCategory.run(
    'cat-deleted',
    'profile-1',
    'Actors',
    null,
    '[]',
    0,
    '2024-01-01',
    '2024-01-01'
  );
  insertCategory.run(
    'cat-source',
    'profile-1',
    'Movies',
    null,
    JSON.stringify([
      { id: 'actor', type: 'relation', relationCategoryId: 'cat-deleted' },
      { id: 'actors', type: 'relation', multiple: true, relationCategoryId: 'cat-deleted' },
      { id: 'studio', type: 'relation', relationCategoryId: 'other-cat' },
    ]),
    1,
    '2024-01-01',
    '2024-01-01'
  );
  insertCategory.run(
    'cat-corrupt-fields',
    'profile-1',
    'Broken',
    null,
    '{not-json',
    2,
    '2024-01-01',
    '2024-01-01'
  );

  const insertRecord = database.prepare(`
    INSERT INTO records (id, profileId, categoryId, data, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertRecord.run('rec-single', 'profile-1', 'cat-source', JSON.stringify({ actor: 'cat-deleted', studio: 'cat-deleted' }), '2024-01-01', '2024-01-01');
  insertRecord.run('rec-multi', 'profile-1', 'cat-source', JSON.stringify({ actors: ['cat-deleted', 'keep-me'] }), '2024-01-01', '2024-01-01');
  insertRecord.run('rec-unrelated', 'profile-1', 'cat-source', JSON.stringify({ actor: 'missing-record-id' }), '2024-01-01', '2024-01-01');
  insertRecord.run('rec-corrupt', 'profile-1', 'cat-source', '{not-json', '2024-01-01', '2024-01-01');
}

test('clears relation values that point at the deleted category id', () => {
  withTempSqlite((temp) => {
    seedRelationDb(temp.database);
    const updated = cleanupRelationReferencesForDatabase(temp.database, 'cat-deleted');

    expect(updated).toBe(2);
    expect(JSON.parse(temp.database.prepare('SELECT data FROM records WHERE id = ?').get('rec-single').data)).toEqual({
      actor: null,
      studio: 'cat-deleted',
    });
    expect(JSON.parse(temp.database.prepare('SELECT data FROM records WHERE id = ?').get('rec-multi').data)).toEqual({
      actors: ['keep-me'],
    });
    expect(JSON.parse(temp.database.prepare('SELECT data FROM records WHERE id = ?').get('rec-unrelated').data)).toEqual({
      actor: 'missing-record-id',
    });
    expect(temp.database.prepare('SELECT data FROM records WHERE id = ?').get('rec-corrupt').data).toBe('{not-json');
  });
});

test('returns zero for missing categories and does not throw on corrupt category JSON', () => {
  withTempSqlite((temp) => {
    seedRelationDb(temp.database);
    expect(cleanupRelationReferencesForDatabase(temp.database, 'does-not-exist')).toBe(0);
    expect(cleanupRelationReferencesForDatabase(temp.database, 'cat-corrupt-fields')).toBe(0);
  });
});
