import { shell, app } from 'electron';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import AdmZip from 'adm-zip';
import * as path from 'path';
import * as fs from 'fs';
import crypto from 'crypto';
const ffmpegStatic = require('ffmpeg-static');
console.log('ffmpeg-static:', ffmpegStatic, fs.existsSync(ffmpegStatic));
if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
} else {
  throw new Error('ffmpeg-static 바이너리 경로를 찾을 수 없습니다: ' + ffmpegStatic);
}

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

export function getThumbnailHash(filePath: string): string {
  // 경로 표준화: 앞뒤 공백 제거, \를 /로 통일, 소문자 변환
  const normalizedPath = filePath.trim().replace(/\\/g, '/').toLowerCase();
  return crypto.createHash('sha1').update(normalizedPath).digest('hex');
}

export async function generateThumbnail(filePath: string, appInstance = app): Promise<string | null> {
  // 파일 경로 검증
  if (!isValidFilePath(filePath)) {
    throw new Error('Invalid or unauthorized file path');
  }

  if (!ffmpegStatic || !fs.existsSync(ffmpegStatic)) {
    throw new Error('ffmpeg-static 바이너리 경로를 찾을 수 없습니다. ffmpeg-static 패키지 설치 및 node_modules/ffmpeg-static 경로 확인 필요.');
  }

  const fileType = getFileType(filePath);
  const thumbnailDir = path.join(appInstance.getAppPath(), 'save', 'thumbnails');
  
  if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir, { recursive: true });
  }

  const hash = getThumbnailHash(filePath);
  console.log('[썸네일 생성용 해시]', filePath, hash);
  const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);

  try {
    switch (fileType) {
      case 'image':
        await sharp(filePath)
          .resize(400, 400, { fit: 'contain' })
          .toFile(thumbnailPath);
        return thumbnailPath;

      case 'video':
        return new Promise((resolve, reject) => {
          ffmpeg(filePath)
            .screenshots({
              timestamps: ['00:00:01'],
              filename: path.basename(thumbnailPath),
              folder: thumbnailDir,
              size: '400x400'
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
          if (buffer) {
            await sharp(buffer)
              .resize(400, 400, { fit: 'contain' })
              .toFile(thumbnailPath);
            return thumbnailPath;
          } else {
            console.error('압축파일에서 이미지를 읽지 못함:', imageEntry.entryName);
            return null;
          }
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