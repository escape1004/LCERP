export const OPENAI_API_KEY_FIELD = 'openAiApiKey';
export const OPENAI_API_KEY_ENCRYPTED_FIELD = 'openAiApiKeyEncrypted';

export function decodeEncryptedBase64(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 16384) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) return null;

  try {
    const buffer = Buffer.from(trimmed, 'base64');
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

export function encodeEncryptedBase64(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return '';
  return buffer.toString('base64');
}

export function stripPlaintextApiKey(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {};
  }

  const persisted = { ...config };
  delete persisted[OPENAI_API_KEY_FIELD];
  if (!String(persisted[OPENAI_API_KEY_ENCRYPTED_FIELD] || '').trim()) {
    delete persisted[OPENAI_API_KEY_ENCRYPTED_FIELD];
  }
  return persisted;
}

export function decryptStoredApiKey(encrypted, crypto) {
  try {
    if (!crypto || typeof crypto.isEncryptionAvailable !== 'function' || !crypto.isEncryptionAvailable()) {
      return '';
    }

    const buffer = decodeEncryptedBase64(encrypted);
    if (!buffer) return '';

    const decrypted = crypto.decryptString(buffer);
    return typeof decrypted === 'string' ? decrypted.trim() : '';
  } catch {
    return '';
  }
}

export function persistApiKey(plaintext, crypto) {
  const normalized = String(plaintext || '').trim();
  if (!normalized) {
    return { success: false, error: 'OpenAI API 키를 입력해주세요.' };
  }

  try {
    if (!crypto || typeof crypto.isEncryptionAvailable !== 'function' || !crypto.isEncryptionAvailable()) {
      return { success: false, error: '이 환경에서는 API 키를 안전하게 저장할 수 없습니다.' };
    }

    const encryptedBuffer = crypto.encryptString(normalized);
    const encrypted = encodeEncryptedBase64(
      Buffer.isBuffer(encryptedBuffer) ? encryptedBuffer : Buffer.from(encryptedBuffer)
    );
    if (!encrypted) {
      return { success: false, error: 'API 키를 암호화하지 못했습니다.' };
    }
    return { success: true, encrypted };
  } catch {
    return { success: false, error: 'API 키를 암호화하지 못했습니다.' };
  }
}

export function migratePlaintextApiKey({ plaintext, encrypted, crypto }) {
  const normalizedPlaintext = String(plaintext || '').trim();
  const normalizedEncrypted = String(encrypted || '').trim();
  let memoryKey = decryptStoredApiKey(normalizedEncrypted, crypto);
  let nextEncrypted = normalizedEncrypted;
  let didMigrate = false;

  if (normalizedPlaintext) {
    const persisted = persistApiKey(normalizedPlaintext, crypto);
    if (persisted.success) {
      nextEncrypted = persisted.encrypted;
      memoryKey = normalizedPlaintext;
      didMigrate = true;
    } else {
      memoryKey = memoryKey || normalizedPlaintext;
    }
  }

  return {
    encrypted: nextEncrypted,
    memoryKey,
    didMigrate,
    plaintextRemoved: didMigrate || !normalizedPlaintext,
    shouldSave: didMigrate
  };
}
