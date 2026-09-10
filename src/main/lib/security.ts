import path from 'path';

export const VIDEO_HTTP_HOST = '127.0.0.1';
export const VIDEO_HTTP_PORT_MIN = 17345;
export const VIDEO_HTTP_PORT_MAX = 17354;

const WINDOWS_DRIVE_RE = /^[a-zA-Z]:[\\/]/;
const URL_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export function videoHttpOrigins() {
  const origins = [];
  for (let port = VIDEO_HTTP_PORT_MIN; port <= VIDEO_HTTP_PORT_MAX; port += 1) {
    origins.push(`http://${VIDEO_HTTP_HOST}:${port}`);
  }
  return origins;
}

export function hasDisallowedPathScheme(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return true;
  if (WINDOWS_DRIVE_RE.test(trimmed)) return false;
  if (trimmed.startsWith('\\\\')) return false;
  return URL_SCHEME_RE.test(trimmed);
}

export function resolveUserFilePath(input, rootDir) {
  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 4096 || trimmed.includes('\0')) return null;
  if (hasDisallowedPathScheme(trimmed)) return null;

  const resolved = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(String(rootDir || ''), trimmed);

  if (!resolved || resolved.includes('\0')) return null;
  return resolved;
}

export function parseExternalHttpUrl(input) {
  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password) return null;
  if (!parsed.hostname) return null;

  return parsed;
}

export function sanitizeArchiveEntryName(input) {
  if (typeof input !== 'string') return null;

  const normalized = input.replace(/\\/g, '/').trim();
  if (!normalized || normalized.length > 1024 || normalized.includes('\0')) return null;
  if (normalized.startsWith('/') || WINDOWS_DRIVE_RE.test(normalized)) return null;
  if (normalized.split('/').some((part) => part === '..')) return null;

  return normalized;
}

export function asFiniteNumber(value, fallback = null) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

export function asBoundedInteger(value, min, max) {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) && !Number.isFinite(numericValue)) return null;
  const rounded = Math.trunc(numericValue);
  if (!Number.isFinite(rounded)) return null;
  if (rounded < min || rounded > max) return null;
  return rounded;
}
