export function getAutoThumbnailTimestamp(duration) {
  if (!Number.isFinite(duration)) {
    return 1;
  }
  if (duration <= 1) {
    return 0;
  }
  return duration / 2;
}
