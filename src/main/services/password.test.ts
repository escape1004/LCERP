import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  createPasswordHash,
  hashLegacyPassword,
  verifyStoredPassword
} from './password.ts';

test('createPasswordHash round-trips without storing the password', async () => {
  const password = 'correct horse battery staple';
  const storedHash = await createPasswordHash(password);

  assert.equal(storedHash.includes(password), false);
  assert.equal((await verifyStoredPassword(password, storedHash)).valid, true);
  assert.equal((await verifyStoredPassword(password, storedHash)).needsUpgrade, false);
  assert.equal((await verifyStoredPassword('wrong-password', storedHash)).valid, false);
});

test('legacy SHA-256 hashes still verify and request an upgrade', async () => {
  const password = 'legacy-pass';
  const storedHash = hashLegacyPassword(password);
  const result = await verifyStoredPassword(password, storedHash);

  assert.equal(result.valid, true);
  assert.equal(result.needsUpgrade, true);
  assert.equal((await verifyStoredPassword('nope', storedHash)).valid, false);
});

test('corrupt or incomplete stored hashes do not verify', async () => {
  const password = 'secret';

  assert.deepEqual(await verifyStoredPassword(password, ''), { valid: false, needsUpgrade: false });
  assert.deepEqual(await verifyStoredPassword(password, null), { valid: false, needsUpgrade: false });
  assert.deepEqual(await verifyStoredPassword(password, 'scrypt$v1$not-hex$also-not-hex'), { valid: false, needsUpgrade: false });
  assert.deepEqual(await verifyStoredPassword(password, 'scrypt$v1$aabbcc'), { valid: false, needsUpgrade: false });
  assert.deepEqual(await verifyStoredPassword(password, 'totally-not-a-hash'), { valid: false, needsUpgrade: false });
});
