import assert from 'node:assert/strict';
import { test } from 'vitest';
import { getAutoThumbnailTimestamp } from './media-time.ts';

test('getAutoThumbnailTimestamp uses the midpoint for longer videos', () => {
  assert.equal(getAutoThumbnailTimestamp(Number.NaN), 1);
  assert.equal(getAutoThumbnailTimestamp(0.5), 0);
  assert.equal(getAutoThumbnailTimestamp(1), 0);
  assert.equal(getAutoThumbnailTimestamp(10), 5);
});
