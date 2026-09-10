import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

export function openTempSqlite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-erp-test-'));
  const file = path.join(dir, 'test.db');
  const database = new Database(file);

  return {
    database,
    dir,
    file,
    close() {
      try {
        database.close();
      } catch {
        // Already closed.
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
