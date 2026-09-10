import assert from 'node:assert/strict';
import test from 'node:test';
import { redactSensitive } from './redact.ts';

test('redactSensitive masks API keys, passwords, and authorization headers', () => {
  const redacted = redactSensitive({
    openAiApiKey: 'sk-live-secret',
    openAiApiKeyEncrypted: 'base64-ciphertext',
    apiKey: 'also-secret',
    password: 'hunter2',
    passwordHash: 'abc123',
    Authorization: 'Bearer sk-live-secret',
    nested: { token: 'keep-hidden', zoomPercent: 120 },
    backupDir: 'C:\\backups'
  });

  assert.equal(redacted.openAiApiKeyEncrypted, '[redacted]');
  assert.equal(redacted.openAiApiKey, '[redacted]');
  assert.equal(redacted.apiKey, '[redacted]');
  assert.equal(redacted.password, '[redacted]');
  assert.equal(redacted.passwordHash, '[redacted]');
  assert.equal(redacted.Authorization, '[redacted]');
  assert.equal(redacted.nested.token, '[redacted]');
  assert.equal(redacted.nested.zoomPercent, 120);
  assert.equal(redacted.backupDir, 'C:\\backups');
});

test('redactSensitive leaves primitives unchanged', () => {
  assert.equal(redactSensitive('plain'), 'plain');
  assert.equal(redactSensitive(null), null);
  assert.deepEqual(redactSensitive(['ok', { secret: 'nope' }]), ['ok', { secret: '[redacted]' }]);
});
