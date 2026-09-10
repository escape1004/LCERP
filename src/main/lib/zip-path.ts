export function normalizeZipPath(entryPath) {
  return String(entryPath || '').replace(/\\/g, '/');
}

export function isSameZipEntry(entryPath, requestedPath) {
  return normalizeZipPath(entryPath) === normalizeZipPath(requestedPath);
}
