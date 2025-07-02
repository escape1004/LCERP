"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getThumbnailHash = getThumbnailHash;
exports.generateThumbnail = generateThumbnail;
exports.getFileType = getFileType;
exports.openFile = openFile;
exports.getThumbnailPathHybrid = getThumbnailPathHybrid;
const electron_1 = require("electron");
const sharp_1 = __importDefault(require("sharp"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const ffmpegStatic = require('ffmpeg-static');
// ffmpeg 경로 설정
if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    fluent_ffmpeg_1.default.setFfmpegPath(ffmpegStatic);
}
// 허용된 파일 확장자 목록
const ALLOWED_EXTENSIONS = {
    image: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    video: ['.mp4', '.avi', '.mkv', '.mov'],
    archive: ['.zip', '.7z']
};
// 파일 경로 보안 검증
function isValidFilePath(filePath) {
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
    }
    catch (error) {
        return false;
    }
}
function getThumbnailHash(filePath) {
    // 경로 표준화: 앞뒤 공백 제거, \를 /로 통일, 소문자 변환
    const normalizedPath = filePath.trim().replace(/\\/g, '/').toLowerCase();
    return crypto_1.default.createHash('sha1').update(normalizedPath).digest('hex');
}
async function generateThumbnail(filePath) {
    // 파일 경로 검증
    if (!isValidFilePath(filePath)) {
        throw new Error('Invalid or unauthorized file path');
    }
    if (!ffmpegStatic || !fs.existsSync(ffmpegStatic)) {
        throw new Error('ffmpeg-static 바이너리 경로를 찾을 수 없습니다. ffmpeg-static 패키지 설치 및 node_modules/ffmpeg-static 경로 확인 필요.');
    }
    const fileType = getFileType(filePath);
    const thumbnailDir = path.join('save', 'thumbnails');
    if (!fs.existsSync(thumbnailDir)) {
        fs.mkdirSync(thumbnailDir, { recursive: true });
    }
    const hash = getThumbnailHash(filePath);
    const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);
    try {
        switch (fileType) {
            case 'image':
                await (0, sharp_1.default)(filePath)
                    .resize(400, 400, { fit: 'contain' })
                    .toFile(thumbnailPath);
                return thumbnailPath;
            case 'video':
                return new Promise((resolve, reject) => {
                    (0, fluent_ffmpeg_1.default)(filePath)
                        .screenshots({
                        timestamps: ['00:00:01'],
                        filename: path.basename(thumbnailPath),
                        folder: thumbnailDir,
                        size: '400x400'
                    })
                        .on('end', () => resolve(thumbnailPath))
                        .on('error', (err) => {
                        reject(err);
                    });
                });
            case 'archive':
                const zip = new adm_zip_1.default(filePath);
                const zipEntries = zip.getEntries();
                const imageEntry = zipEntries.find(entry => /\.(jpg|jpeg|png|gif)$/i.test(entry.entryName));
                if (imageEntry) {
                    const buffer = zip.readFile(imageEntry);
                    if (buffer) {
                        await (0, sharp_1.default)(buffer)
                            .resize(400, 400, { fit: 'contain' })
                            .toFile(thumbnailPath);
                        return thumbnailPath;
                    }
                    else {
                        return null;
                    }
                }
                return null;
            default:
                return null;
        }
    }
    catch (error) {
        return null;
    }
}
function getFileType(filePath) {
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
async function openFile(filePath) {
    // 파일 경로 검증
    if (!isValidFilePath(filePath)) {
        throw new Error('Invalid or unauthorized file path');
    }
    try {
        await electron_1.shell.openPath(filePath);
    }
    catch (error) {
        throw error;
    }
}
// 하이브리드 썸네일 경로 결정 함수
function getThumbnailPathHybrid(record, filePath) {
  // 1. DB에 저장된 썸네일 경로가 있으면 우선 사용
  if (record && record.thumbnailPath && fs.existsSync(record.thumbnailPath)) {
    return record.thumbnailPath;
  }
  
  // 2. 해시 기반 경로 (기존 시스템)
  const hash = getThumbnailHash(filePath);
  const hashPath = path.join('save', 'thumbnails', `thumb_${hash}.jpg`);
  
  if (fs.existsSync(hashPath)) {
    return hashPath;
  }
  
  // 3. 둘 다 없으면 null
  return null;
}
