import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { log } from '../store';
import { getFfmpegToolPaths } from '../ffmpeg-paths';
import { removeFileWithRetry, renameFileWithRetry } from '../fs-retry';

export const hasEmbeddedVideoCover = async (filePath) => {
  try {
    const { ffmpegPath, ffprobePath } = getFfmpegToolPaths();
    if (!ffmpegPath || !ffprobePath) {
      return false;
    }

    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);

    return await new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err || !metadata?.streams) {
          return resolve(false);
        }

        resolve(metadata.streams.some((stream) => stream?.disposition?.attached_pic === 1));
      });
    });
  } catch (error) {
    return false;
  }
};

export const extractEmbeddedVideoCover = async (filePath, outputPath) => {
  try {
    const { ffmpegPath, ffprobePath } = getFfmpegToolPaths();

    if (!ffmpegPath || !ffprobePath) {
      return null;
    }

    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);

    const attachedPicStreamIndex = await new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err || !metadata?.streams) {
          return resolve(null);
        }

        const stream = metadata.streams.find((item) => item?.disposition?.attached_pic === 1);
        resolve(stream?.index ?? null);
      });
    });

    if (attachedPicStreamIndex === null || attachedPicStreamIndex === undefined) {
      return null;
    }

    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .outputOptions([`-map 0:${attachedPicStreamIndex}`, '-frames:v 1'])
        .save(outputPath)
        .on('end', resolve)
        .on('error', reject);
    });

    return fs.existsSync(outputPath) ? outputPath : null;
  } catch (error) {
    log('비디오 메타데이터 커버 추출 실패:', { filePath, outputPath, error: error.message });
    return null;
  }
};

export const persistCustomThumbnailToVideoMetadata = async (targetFilePath, imagePath) => {
  let tempOutputPath = null;
  let backupPath = null;
  try {
    const ext = path.extname(targetFilePath).toLowerCase();
    const supportedFormats = ['.mp4', '.m4v', '.mov', '.mkv'];
    if (!supportedFormats.includes(ext)) {
      return false;
    }

    const { ffmpegPath, ffprobePath } = getFfmpegToolPaths();
    if (!ffmpegPath || !ffprobePath) {
      return false;
    }

    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);

    const metadata: any = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(targetFilePath, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
    });
    const attachedPicStreamIndexes = (metadata?.streams || [])
      .filter((stream) => stream?.disposition?.attached_pic === 1)
      .map((stream) => stream.index)
      .filter((index) => index !== null && index !== undefined);
    const retainedVideoStreamCount = (metadata?.streams || [])
      .filter((stream) => (
        stream?.codec_type === 'video' &&
        stream?.disposition?.attached_pic !== 1
      ))
      .length;

    const uniqueSuffix = `${process.pid}-${Date.now()}`;
    tempOutputPath = `${targetFilePath}.cover-tmp-${uniqueSuffix}${ext}`;
    backupPath = `${targetFilePath}.cover-backup-${uniqueSuffix}`;

    const legacyTempOutputPath = `${targetFilePath}.cover-tmp${ext}`;
    if (fs.existsSync(legacyTempOutputPath)) {
      await removeFileWithRetry(legacyTempOutputPath).catch((cleanupError) => {
        log('기존 커버 임시 파일 정리 실패:', {
          legacyTempOutputPath,
          error: cleanupError.message
        });
      });
    }

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(targetFilePath)
        .input(imagePath)
        .outputOptions([
          '-map 0',
          ...attachedPicStreamIndexes.map((index) => `-map -0:${index}`),
          '-map 1:v:0',
          '-c copy',
          `-c:v:${retainedVideoStreamCount} mjpeg`,
          `-disposition:v:${retainedVideoStreamCount} attached_pic`,
          '-y'
        ])
        .save(tempOutputPath)
        .on('end', resolve)
        .on('error', reject);
    });

    if (!fs.existsSync(tempOutputPath)) {
      return false;
    }

    if (!await hasEmbeddedVideoCover(tempOutputPath)) {
      throw new Error('생성된 영상에서 커스텀 썸네일 스트림을 확인하지 못했습니다.');
    }

    await renameFileWithRetry(targetFilePath, backupPath);
    try {
      await renameFileWithRetry(tempOutputPath, targetFilePath);
    } catch (swapError) {
      await renameFileWithRetry(backupPath, targetFilePath);
      throw swapError;
    }

    await removeFileWithRetry(backupPath);
    return true;
  } catch (error) {
    log('비디오 메타데이터 커버 저장 실패:', { targetFilePath, imagePath, error: error.message });
    return false;
  } finally {
    if (tempOutputPath) {
      await removeFileWithRetry(tempOutputPath).catch((cleanupError) => {
        log('커버 임시 파일 정리 실패:', { tempOutputPath, error: cleanupError.message });
      });
    }

    if (backupPath && fs.existsSync(backupPath)) {
      if (!fs.existsSync(targetFilePath)) {
        await renameFileWithRetry(backupPath, targetFilePath).catch((restoreError) => {
          log('원본 영상 복구 실패:', { backupPath, targetFilePath, error: restoreError.message });
        });
      } else {
        await removeFileWithRetry(backupPath).catch((cleanupError) => {
          log('커버 백업 파일 정리 실패:', { backupPath, error: cleanupError.message });
        });
      }
    }
  }
};

export const removeEmbeddedVideoCover = async (targetFilePath) => {
  try {
    const ext = path.extname(targetFilePath).toLowerCase();
    const supportedFormats = ['.mp4', '.m4v', '.mov', '.mkv'];
    if (!supportedFormats.includes(ext)) {
      return false;
    }

    const { ffmpegPath, ffprobePath } = getFfmpegToolPaths();
    if (!ffmpegPath || !ffprobePath) {
      return false;
    }

    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);

    const attachedPicStreamIndexes: any = await new Promise((resolve) => {
      ffmpeg.ffprobe(targetFilePath, (err, metadata) => {
        if (err || !metadata?.streams) {
          return resolve([]);
        }

        const indexes = metadata.streams
          .filter((stream) => stream?.disposition?.attached_pic === 1)
          .map((stream) => stream.index)
          .filter((index) => index !== null && index !== undefined);

        resolve(indexes);
      });
    });

    if (!attachedPicStreamIndexes.length) {
      return false;
    }

    const tempOutputPath = `${targetFilePath}.cover-remove-tmp${ext}`;
    const outputOptions = ['-map 0', ...attachedPicStreamIndexes.map((index) => `-map -0:${index}`), '-c copy'];

    await new Promise((resolve, reject) => {
      ffmpeg(targetFilePath)
        .outputOptions(outputOptions)
        .save(tempOutputPath)
        .on('end', resolve)
        .on('error', reject);
    });

    if (!fs.existsSync(tempOutputPath)) {
      return false;
    }

    const backupPath = `${targetFilePath}.cover-remove-backup`;
    try {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      fs.renameSync(targetFilePath, backupPath);
      fs.renameSync(tempOutputPath, targetFilePath);
      fs.unlinkSync(backupPath);
    } catch (swapError) {
      if (fs.existsSync(tempOutputPath)) {
        fs.unlinkSync(tempOutputPath);
      }
      if (fs.existsSync(backupPath) && !fs.existsSync(targetFilePath)) {
        fs.renameSync(backupPath, targetFilePath);
      }
      throw swapError;
    }

    return true;
  } catch (error) {
    log('임베디드 커버 제거 실패:', { targetFilePath, error: error.message });
    return false;
  }
};
