import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeSubtitleBuffer } from './subtitles.ts';

test('decodeSubtitleBuffer reads UTF-8 subtitles', () => {
  assert.equal(decodeSubtitleBuffer(Buffer.from('한글', 'utf8')), '한글');
});

test('decodeSubtitleBuffer falls back to EUC-KR for legacy bytes', () => {
  const eucKrHello = Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]);
  assert.equal(decodeSubtitleBuffer(eucKrHello), '한글');
});
