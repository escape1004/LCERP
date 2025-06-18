import { shell } from 'electron';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';

interface FileInfo {
  path: string;
  type: 'image' | 'video' | 'archive' | 'other';
  thumbnailPath?: string;
}

// 허용된 파일 확장자 목록
const ALLOWED_EXTENSIONS = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  video: ['.mp4', '.avi', '.mkv', '.mov'],
  archive: ['.zip', '.7z']
};

// 파일 경로 보안 검증
function isValidFilePath(filePath: string): boolean {
  try {
    // 경로가 실제로 존재하는지 확인
    if (!fs.existsSync(filePath)) {
      return false;
    }

    // 심볼릭 링크 확인 (선택적)
    const stats = fs.lstatSync(filePath);
    if (stats.isSymbolicLink()) {
      return false;
    }

    // 파일 확장자 확인
    const ext = path.extname(filePath).toLowerCase();
    const allowedExts = [
      ...ALLOWED_EXTENSIONS.image,
      ...ALLOWED_EXTENSIONS.video,
      ...ALLOWED_EXTENSIONS.archive
    ];
    
    return allowedExts.includes(ext);
  } catch (error) {
    console.error('Error validating file path:', error);
    return false;
  }
}

export async function generateThumbnail(filePath: string): Promise<string | null> {
  // 파일 경로 검증
  if (!isValidFilePath(filePath)) {
    throw new Error('Invalid or unauthorized file path');
  }

  const fileType = getFileType(filePath);
  const thumbnailDir = path.join(process.cwd(), 'thumbnails');
  
  if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir);
  }

  const thumbnailPath = path.join(thumbnailDir, `thumb_${path.basename(filePath)}.jpg`);

  try {
    switch (fileType) {
      case 'image':
        await sharp(filePath)
          .resize(200, 200, { fit: 'contain' })
          .toFile(thumbnailPath);
        return thumbnailPath;

      case 'video':
        return new Promise((resolve, reject) => {
          ffmpeg(filePath)
            .screenshots({
              timestamps: ['00:00:01'],
              filename: path.basename(thumbnailPath),
              folder: thumbnailDir,
              size: '200x200'
            })
            .on('end', () => resolve(thumbnailPath))
            .on('error', (err) => {
              console.error('ffmpeg 썸네일 생성 에러:', err, '파일:', filePath);
              reject(err);
            });
        });

      case 'archive':
        const zip = new AdmZip(filePath);
        const zipEntries = zip.getEntries();
        const imageEntry = zipEntries.find(entry => 
          /\.(jpg|jpeg|png|gif)$/i.test(entry.entryName)
        );

        if (imageEntry) {
          const buffer = zip.readFile(imageEntry);
          await sharp(buffer)
            .resize(200, 200, { fit: 'contain' })
            .toFile(thumbnailPath);
          return thumbnailPath;
        }
        return null;

      default:
        return null;
    }
  } catch (error) {
    console.error('Error generating thumbnail:', error, '파일:', filePath);
    return null;
  }
}

export function getFileType(filePath: string): FileInfo['type'] {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ALLOWED_EXTENSIONS.image.includes(ext)) {
    return 'image';
  }
  if (ALLOWED_EXTENSIONS.video.includes(ext)) {
    return 'video';
  }
  if (ALLOWED_EXTENSIONS.archive.includes(ext)) {
    return 'archive';
  }
  return 'other';
}

export async function openFile(filePath: string): Promise<void> {
  // 파일 경로 검증
  if (!isValidFilePath(filePath)) {
    throw new Error('Invalid or unauthorized file path');
  }

  try {
    await shell.openPath(filePath);
  } catch (error) {
    console.error('Error opening file:', error);
    throw error;
  }
} 