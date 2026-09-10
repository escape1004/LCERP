import { afterEach, expect, test } from 'vitest';
import { applyDatabaseSchema, CURRENT_SCHEMA_VERSION } from './migrations';
import { getSchemaVersion, getTableColumns } from './schema';
import { openTempSqlite } from '../../test/temp-sqlite';

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

test('applyDatabaseSchema still produces the current tables without a backup', () => {
  const temp = openTempSqlite();
  cleanup = temp.close;

  const result = applyDatabaseSchema(temp.database);

  expect(result.backupPath).toBeNull();
  expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
  expect(getSchemaVersion(temp.database)).toBe(CURRENT_SCHEMA_VERSION);
  expect(getTableColumns(temp.database, 'records')).toEqual(expect.arrayContaining([
    'profileId',
    'duration',
    'thumbnailPath',
    'thumbnailTimestamp',
  ]));
});
