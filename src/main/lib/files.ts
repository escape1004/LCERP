import path from 'path';
import crypto from 'crypto';

export const FILE_EXTENSIONS = {
  image: new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']),
  video: new Set(['.mp4', '.avi', '.mkv', '.mov']),
  archive: new Set(['.zip', '.7z'])
};

export function getFileTypeFromPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return 'other';

  const extension = path.extname(filePath).toLowerCase();
  if (FILE_EXTENSIONS.image.has(extension)) return 'image';
  if (FILE_EXTENSIONS.video.has(extension)) return 'video';
  if (FILE_EXTENSIONS.archive.has(extension)) return 'archive';
  return 'other';
}

export function getThumbnailHash(filePath) {
  const normalizedPath = filePath.trim().replace(/\\/g, '/').toLowerCase();
  return crypto.createHash('sha1').update(normalizedPath).digest('hex');
}
