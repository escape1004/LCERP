import fs from 'fs';
import path from 'path';

export const electronDistDir = __dirname;

export function getUnpackedFfprobePath() {
  const base = path.join(process.resourcesPath, 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe');
  if (base.includes('app.asar')) {
    return base.replace('app.asar', 'app.asar.unpacked');
  }
  return base;
}

export function getFfmpegToolPaths() {
  const ffmpegCandidates = [
    path.join(process.resourcesPath, 'ffmpeg-static', 'ffmpeg.exe'),
    path.join(electronDistDir, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
    path.join(electronDistDir, '..', 'node_modules', '.bin', 'ffmpeg.exe')
  ];
  const ffprobeCandidates = [
    getUnpackedFfprobePath(),
    path.join(electronDistDir, '..', 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'),
    path.join(electronDistDir, '..', 'node_modules', '.bin', 'ffprobe.exe')
  ];

  return {
    ffmpegPath: ffmpegCandidates.find(fs.existsSync),
    ffprobePath: ffprobeCandidates.find(fs.existsSync)
  };
}
