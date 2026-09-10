import assert from 'node:assert/strict';
import test from 'node:test';
import { getSqlPlaceholders } from './sql.ts';

test('getSqlPlaceholders builds a comma-separated list', () => {
  assert.equal(getSqlPlaceholders(0), '');
  assert.equal(getSqlPlaceholders(1), '?');
  assert.equal(getSqlPlaceholders(3), '?, ?, ?');
});
