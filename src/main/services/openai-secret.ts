import { app, safeStorage } from 'electron';
import {
  decryptStoredApiKey,
  migratePlaintextApiKey,
  persistApiKey,
  stripPlaintextApiKey
} from '../lib/openai-secret';

let memoryKey = '';
let pendingPlaintext = '';
let encryptedValue = '';

function getSafeStorageCrypto() {
  // Windows: DPAPI after app.ready(). macOS: Keychain. Linux: desktop keyring.
  // Do not call safeStorage.setUsePlainTextEncryption().
  try {
    if (typeof app.isReady === 'function' && !app.isReady()) {
      return null;
    }
    if (typeof safeStorage.isEncryptionAvailable !== 'function' || !safeStorage.isEncryptionAvailable()) {
      return null;
    }
    return safeStorage;
  } catch {
    return null;
  }
}

export function ingestSavedOpenAiSecrets(savedConfig) {
  const saved = savedConfig && typeof savedConfig === 'object' && !Array.isArray(savedConfig)
    ? savedConfig
    : {};
  pendingPlaintext = String(saved.openAiApiKey || '').trim();
  encryptedValue = String(saved.openAiApiKeyEncrypted || '').trim();
  memoryKey = '';
}

export function omitOpenAiSecretsFromConfig(config) {
  const persisted = stripPlaintextApiKey({
    ...config,
    openAiApiKeyEncrypted: encryptedValue
  });
  delete persisted.openAiApiKey;
  return persisted;
}

export function hasOpenAiApiKey() {
  return Boolean(getOpenAiApiKey());
}

export function getOpenAiApiKey() {
  try {
    if (memoryKey) return memoryKey;

    const decrypted = decryptStoredApiKey(encryptedValue, getSafeStorageCrypto());
    if (decrypted) {
      memoryKey = decrypted;
      return memoryKey;
    }

    return pendingPlaintext;
  } catch {
    return memoryKey || pendingPlaintext;
  }
}

export function migrateOpenAiSecrets() {
  try {
    const result = migratePlaintextApiKey({
      plaintext: pendingPlaintext,
      encrypted: encryptedValue,
      crypto: getSafeStorageCrypto()
    });

    encryptedValue = result.encrypted;
    memoryKey = result.memoryKey;
    if (result.plaintextRemoved) {
      pendingPlaintext = '';
    }
    return result;
  } catch {
    return {
      encrypted: encryptedValue,
      memoryKey,
      didMigrate: false,
      plaintextRemoved: false,
      shouldSave: false
    };
  }
}

export function setStoredOpenAiApiKey(apiKey) {
  const result = persistApiKey(apiKey, getSafeStorageCrypto());
  if (!result.success) {
    return { success: false, error: result.error };
  }

  encryptedValue = result.encrypted;
  memoryKey = String(apiKey || '').trim();
  pendingPlaintext = '';
  return { success: true, hasOpenAiApiKey: true };
}

export function clearStoredOpenAiApiKey() {
  encryptedValue = '';
  memoryKey = '';
  pendingPlaintext = '';
  return { success: true, hasOpenAiApiKey: false };
}
