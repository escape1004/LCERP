import assert from 'node:assert/strict';
import test from 'node:test';
import { getFileTypeFromPath, getThumbnailHash } from './files.ts';

test('getFileTypeFromPath classifies known extensions', () => {
  assert.equal(getFileTypeFromPath('C:\\media\\cover.PNG'), 'image');
  assert.equal(getFileTypeFromPath('/tmp/clip.mkv'), 'video');
  assert.equal(getFileTypeFromPath('archive.ZIP'), 'archive');
  assert.equal(getFileTypeFromPath('notes.txt'), 'other');
  assert.equal(getFileTypeFromPath(''), 'other');
  assert.equal(getFileTypeFromPath(null), 'other');
});

test('getThumbnailHash normalizes slashes and case', () => {
  assert.equal(
    getThumbnailHash('C:\\Media\\File.MP4'),
    getThumbnailHash('c:/media/file.mp4')
  );
  assert.notEqual(
    getThumbnailHash('C:\\Media\\File.MP4'),
    getThumbnailHash('C:\\Media\\other.MP4')
  );
});
