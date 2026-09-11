import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

export function isInsideDir(parentDir: string, targetPath: string) {
  const relative = path.relative(path.resolve(parentDir), path.resolve(targetPath));
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeTempDir(dir: string) {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < 2000) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      sleep(50);
    }
  }
  if (lastError) throw lastError;
}

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
        database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      } catch {
        // Connection may already be closing.
      }
      try {
        database.close();
      } catch {
        // Already closed.
      }
      removeTempDir(dir);
    },
  };
}

export function withTempSqlite<T>(run: (temp: ReturnType<typeof openTempSqlite>) => T): T {
  const temp = openTempSqlite();
  try {
    return run(temp);
  } finally {
    temp.close();
  }
}
