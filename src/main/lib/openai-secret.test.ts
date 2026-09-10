import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeEncryptedBase64,
  decryptStoredApiKey,
  migratePlaintextApiKey,
  persistApiKey,
  stripPlaintextApiKey
} from './openai-secret.ts';

function createFakeSafeStorage({ available = true } = {}) {
  return {
    isEncryptionAvailable: () => available,
    encryptString(plaintext) {
      return Buffer.from(`enc:${plaintext}`, 'utf8');
    },
    decryptString(buffer) {
      const text = Buffer.from(buffer).toString('utf8');
      if (!text.startsWith('enc:')) {
        throw new Error('Unable to decrypt');
      }
      return text.slice(4);
    }
  };
}

test('persistApiKey stores a base64 ciphertext and never returns the key', () => {
  const crypto = createFakeSafeStorage();
  const result = persistApiKey('sk-live-secret', crypto);

  assert.equal(result.success, true);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'error'), false);
  assert.equal(result.encrypted.includes('sk-live-secret'), false);
  assert.equal(decodeEncryptedBase64(result.encrypted)?.toString('utf8'), 'enc:sk-live-secret');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'memoryKey'), false);
});

test('decryptStoredApiKey round-trips an encrypted key', () => {
  const crypto = createFakeSafeStorage();
  const stored = persistApiKey('sk-roundtrip', crypto);
  assert.equal(stored.success, true);
  const decrypted = decryptStoredApiKey(stored.encrypted, crypto);

  assert.equal(decrypted, 'sk-roundtrip');
});

test('migratePlaintextApiKey encrypts legacy plaintext and removes it from persisted config', () => {
  const crypto = createFakeSafeStorage();
  const migrated = migratePlaintextApiKey({
    plaintext: 'sk-legacy',
    encrypted: '',
    crypto
  });
  const persisted = stripPlaintextApiKey({
    openAiApiKey: 'sk-legacy',
    openAiApiKeyEncrypted: migrated.encrypted,
    zoomPercent: 100
  });

  assert.equal(migrated.didMigrate, true);
  assert.equal(migrated.shouldSave, true);
  assert.equal(migrated.plaintextRemoved, true);
  assert.equal(migrated.memoryKey, 'sk-legacy');
  assert.equal(decryptStoredApiKey(migrated.encrypted, crypto), 'sk-legacy');
  assert.equal(Object.prototype.hasOwnProperty.call(persisted, 'openAiApiKey'), false);
  assert.equal(persisted.openAiApiKeyEncrypted, migrated.encrypted);
});

test('clearing a key drops ciphertext from persisted config', () => {
  const persisted = stripPlaintextApiKey({
    openAiApiKey: 'sk-should-go',
    openAiApiKeyEncrypted: '',
    translationModel: 'gpt-5.6-luna'
  });

  assert.equal(Object.prototype.hasOwnProperty.call(persisted, 'openAiApiKey'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(persisted, 'openAiApiKeyEncrypted'), false);
  assert.equal(persisted.translationModel, 'gpt-5.6-luna');
});

test('unavailable encryption does not persist plaintext and keeps the key in memory until migration', () => {
  const crypto = createFakeSafeStorage({ available: false });
  const stored = persistApiKey('sk-cannot-save', crypto);
  const migrated = migratePlaintextApiKey({
    plaintext: 'sk-cannot-save',
    encrypted: '',
    crypto
  });

  assert.equal(stored.success, false);
  assert.equal(stored.error.includes('sk-cannot-save'), false);
  assert.equal(migrated.didMigrate, false);
  assert.equal(migrated.shouldSave, false);
  assert.equal(migrated.memoryKey, 'sk-cannot-save');
  assert.equal(migrated.encrypted, '');
});

test('persisted JSON never contains plaintext after migrate, save, or clear', () => {
  const crypto = createFakeSafeStorage();
  const migrated = migratePlaintextApiKey({
    plaintext: 'sk-legacy',
    encrypted: '',
    crypto
  });
  const saved = JSON.parse(JSON.stringify(stripPlaintextApiKey({
    openAiApiKey: 'sk-legacy',
    openAiApiKeyEncrypted: migrated.encrypted,
    zoomPercent: 110
  })));

  assert.equal(Object.prototype.hasOwnProperty.call(saved, 'openAiApiKey'), false);
  assert.equal(JSON.stringify(saved).includes('sk-legacy'), false);
  assert.equal(decryptStoredApiKey(saved.openAiApiKeyEncrypted, crypto), 'sk-legacy');

  const stored = persistApiKey('sk-to-delete', crypto);
  assert.equal(stored.success, true);
  if (!stored.success) return;
  const afterSave = stripPlaintextApiKey({
    openAiApiKeyEncrypted: stored.encrypted,
    zoomPercent: 110
  });
  assert.equal(decryptStoredApiKey(afterSave.openAiApiKeyEncrypted, crypto), 'sk-to-delete');

  const afterClear = stripPlaintextApiKey({
    openAiApiKey: 'sk-to-delete',
    openAiApiKeyEncrypted: '',
    zoomPercent: 110
  });
  assert.equal(Object.prototype.hasOwnProperty.call(afterClear, 'openAiApiKey'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(afterClear, 'openAiApiKeyEncrypted'), false);
  assert.equal(afterClear.zoomPercent, 110);
});

test('migrate prefers remaining plaintext over corrupt ciphertext without throwing', () => {
  const crypto = createFakeSafeStorage();
  const migrated = migratePlaintextApiKey({
    plaintext: 'sk-new',
    encrypted: Buffer.from('nope').toString('base64'),
    crypto
  });

  assert.equal(migrated.didMigrate, true);
  assert.equal(migrated.memoryKey, 'sk-new');
  assert.equal(decryptStoredApiKey(migrated.encrypted, crypto), 'sk-new');
});

test('corrupt ciphertext does not throw and yields an empty key', () => {
  const crypto = createFakeSafeStorage();
  assert.equal(decryptStoredApiKey('%%%not-base64%%%', crypto), '');
  assert.equal(decryptStoredApiKey(Buffer.from('nope').toString('base64'), crypto), '');
});

test('encrypt failures do not include the key in the error', () => {
  const crypto = {
    isEncryptionAvailable: () => true,
    encryptString() {
      throw new Error('failed for sk-secret');
    },
    decryptString() {
      return '';
    }
  };
  const result = persistApiKey('sk-secret', crypto);
  assert.equal(result.success, false);
  assert.equal(result.error.includes('sk-secret'), false);
});
