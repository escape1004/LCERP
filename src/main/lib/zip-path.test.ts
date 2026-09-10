import assert from 'node:assert/strict';
import { test } from 'vitest';
import { isSameZipEntry, normalizeZipPath } from './zip-path.ts';

test('normalizeZipPath converts Windows separators', () => {
  assert.equal(normalizeZipPath('folder\\inner\\clip.mp4'), 'folder/inner/clip.mp4');
  assert.equal(normalizeZipPath(null), '');
});

test('isSameZipEntry compares normalized archive paths', () => {
  assert.equal(isSameZipEntry('a\\b.mp4', 'a/b.mp4'), true);
  assert.equal(isSameZipEntry('a/b.mp4', 'a/c.mp4'), false);
});
