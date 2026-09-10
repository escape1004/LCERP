const SENSITIVE_KEY_PATTERN = /(api[_-]?key|password|authorization|secret|token|credential)/i;

function isSensitiveKey(key: string) {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function redactSensitive(value) {
  if (value == null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }

  const redacted = {};
  Object.keys(value).forEach((key) => {
    redacted[key] = isSensitiveKey(key) ? '[redacted]' : redactSensitive(value[key]);
  });
  return redacted;
}
