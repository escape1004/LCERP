import crypto from 'crypto';

export const PASSWORD_SCRYPT_PREFIX = 'scrypt$v1';
export const PASSWORD_SCRYPT_KEY_LENGTH = 64;
export const PASSWORD_SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024
};

export function hashLegacyPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

export function derivePasswordKey(password, salt): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      String(password),
      salt,
      PASSWORD_SCRYPT_KEY_LENGTH,
      PASSWORD_SCRYPT_OPTIONS,
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

export async function createPasswordHash(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await derivePasswordKey(password, salt);
  return `${PASSWORD_SCRYPT_PREFIX}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export function timingSafeBufferEqual(actual, expected) {
  return actual.length === expected.length && crypto.timingSafeEqual(actual as Buffer, expected as Buffer);
}

export async function verifyStoredPassword(password, storedHash) {
  const normalizedHash = String(storedHash || '');
  if (normalizedHash.startsWith(`${PASSWORD_SCRYPT_PREFIX}$`)) {
    const parts = normalizedHash.split('$');
    if (
      parts.length !== 4
      || !/^[a-f0-9]{32}$/i.test(parts[2])
      || !/^[a-f0-9]{128}$/i.test(parts[3])
    ) {
      return { valid: false, needsUpgrade: false };
    }

    const salt = Buffer.from(parts[2], 'hex');
    const expectedKey = Buffer.from(parts[3], 'hex');
    const actualKey = await derivePasswordKey(password, salt);
    return {
      valid: timingSafeBufferEqual(actualKey, expectedKey),
      needsUpgrade: false
    };
  }

  if (/^[a-f0-9]{64}$/i.test(normalizedHash)) {
    const actualHash = Buffer.from(hashLegacyPassword(password), 'hex');
    const expectedHash = Buffer.from(normalizedHash, 'hex');
    return {
      valid: timingSafeBufferEqual(actualHash, expectedHash),
      needsUpgrade: true
    };
  }

  return { valid: false, needsUpgrade: false };
}
