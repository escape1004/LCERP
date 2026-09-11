import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'vitest';
import {
  hasDisallowedPathScheme,
  parseExternalHttpUrl,
  resolveUserFilePath,
  sanitizeArchiveEntryName
} from './security.ts';

test('parseExternalHttpUrl allows only http and https', () => {
  assert.equal(parseExternalHttpUrl('https://example.com/docs')?.hostname, 'example.com');
  assert.equal(parseExternalHttpUrl('http://127.0.0.1:8080/health')?.protocol, 'http:');
  assert.equal(parseExternalHttpUrl('file:///C:/Windows/notepad.exe'), null);
  assert.equal(parseExternalHttpUrl('javascript:alert(1)'), null);
  assert.equal(parseExternalHttpUrl('data:text/html,hi'), null);
  assert.equal(parseExternalHttpUrl('localvideo://clip'), null);
  assert.equal(parseExternalHttpUrl('blob:https://example.com/123'), null);
  assert.equal(parseExternalHttpUrl('https://user:secret@example.com'), null);
});

test('resolveUserFilePath rejects URL schemes and keeps Windows paths', () => {
  const rootDir = 'C:\\app-data';
  assert.equal(resolveUserFilePath('C:\\media\\clip.mp4', rootDir), path.win32.resolve('C:\\media\\clip.mp4'));
  assert.equal(
    resolveUserFilePath('relative\\cover.png', rootDir),
    path.win32.resolve(rootDir, 'relative\\cover.png')
  );
  assert.equal(resolveUserFilePath('file:///C:/secret.txt', rootDir), null);
  assert.equal(resolveUserFilePath('javascript:alert(1)', rootDir), null);
  assert.equal(resolveUserFilePath('http://example.com/a.mp4', rootDir), null);
  assert.equal(resolveUserFilePath('clip.mp4\0.exe', rootDir), null);
  assert.equal(hasDisallowedPathScheme('C:\\Users\\a.png'), false);
});

test('sanitizeArchiveEntryName blocks traversal', () => {
  assert.equal(sanitizeArchiveEntryName('folder\\inner.png'), 'folder/inner.png');
  assert.equal(sanitizeArchiveEntryName('../secret.txt'), null);
  assert.equal(sanitizeArchiveEntryName('/etc/passwd'), null);
  assert.equal(sanitizeArchiveEntryName('C:\\Windows\\win.ini'), null);
});
