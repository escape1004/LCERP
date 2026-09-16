import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'vitest';
import { getFileTypeFromPath, getThumbnailHash, resolveRecordFileSystemPath, resolveRecordStoredFilePath } from './files.ts';

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

test('resolveRecordStoredFilePath joins base-mode filenames and skips placeholders', () => {
  assert.equal(resolveRecordStoredFilePath('-', { pathMode: 'direct' }), null);
  assert.equal(resolveRecordStoredFilePath('C:\\media\\clip.mp4', { pathMode: 'direct' }), 'C:\\media\\clip.mp4');
  assert.equal(
    resolveRecordStoredFilePath('clip.mp4', { pathMode: 'base', basePath: 'D:\\library\\' }),
    'D:\\library\\clip.mp4'
  );
  assert.equal(
    resolveRecordStoredFilePath('old\\clip.mp4', { pathMode: 'base', basePath: 'D:\\library' }),
    'D:\\library\\clip.mp4'
  );
});

test('resolveRecordFileSystemPath resolves relative files against app data like the viewer', () => {
  const rootDir = 'C:\\app-data';
  assert.equal(
    resolveRecordFileSystemPath('photos\\cover.png', { pathMode: 'direct' }, rootDir),
    path.win32.resolve(rootDir, 'photos\\cover.png')
  );
  assert.equal(
    resolveRecordFileSystemPath('cover.png', { pathMode: 'base', basePath: 'E:\\media' }, rootDir),
    path.win32.resolve('E:\\media\\cover.png')
  );
});
