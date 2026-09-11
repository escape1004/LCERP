import { expect, test } from 'vitest';
import { applyDatabaseSchema, CURRENT_SCHEMA_VERSION } from './migrations';
import { getSchemaVersion, getTableColumns } from './schema';
import { withTempSqlite } from '../../test/temp-sqlite';

test('applyDatabaseSchema still produces the current tables without a backup', () => {
  withTempSqlite((temp) => {
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
});
