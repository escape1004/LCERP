import fs from 'fs';
import path from 'path';
import http from 'http';
import { protocol } from 'electron';
import { appDataDir, log } from '../store';
import { ensureArchiveVideoExtracted } from '../media/archives';
import {
  VIDEO_HTTP_HOST,
  VIDEO_HTTP_PORT_MAX,
  VIDEO_HTTP_PORT_MIN,
  resolveUserFilePath,
  sanitizeArchiveEntryName
} from '../lib/security';

export function serveLocalFileWithRange(req, res, filePath, mimeType) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const commonHeaders = {
    'Content-Type': mimeType,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD',
    'Access-Control-Allow-Headers': 'Range'
  };

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (Number.isNaN(start) || start >= fileSize || start < 0) {
      res.writeHead(416, {
        ...commonHeaders,
        'Content-Range': `bytes */${fileSize}`
      });
      res.end();
      return;
    }

    const safeEnd = Math.min(end, fileSize - 1);
    const chunkSize = (safeEnd - start) + 1;
    res.writeHead(206, {
      ...commonHeaders,
      'Content-Range': `bytes ${start}-${safeEnd}/${fileSize}`,
      'Content-Length': chunkSize
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath, { start, end: safeEnd }).pipe(res);
    return;
  }

  res.writeHead(200, {
    ...commonHeaders,
    'Content-Length': fileSize
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

export let videoServerPort = VIDEO_HTTP_PORT_MIN;
globalThis.videoServerPort = videoServerPort;
export function startVideoHttpServer() {
  const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url, `http://${VIDEO_HTTP_HOST}:${videoServerPort}`);
    if (urlObj.pathname === '/video') {
      const filePath = resolveUserFilePath(decodeURIComponent(urlObj.searchParams.get('path') || ''), appDataDir);
      if (!filePath) {
        res.writeHead(400);
        res.end('Invalid path');
        return;
      }
      const resolvedPath = filePath;
      const ext = path.extname(resolvedPath).toLowerCase();
      const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(ext);
      if (!isVideo || !fs.existsSync(resolvedPath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.mov': 'video/quicktime',
        '.wmv': 'video/x-ms-wmv',
        '.flv': 'video/x-flv',
        '.m4v': 'video/x-m4v',
        '.3gp': 'video/3gpp',
        '.ts': 'video/mp2t'
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      serveLocalFileWithRange(req, res, resolvedPath, mimeType);
    } else if (urlObj.pathname === '/archive-video') {
      const archivePath = resolveUserFilePath(decodeURIComponent(urlObj.searchParams.get('archive') || ''), appDataDir);
      const fileName = sanitizeArchiveEntryName(decodeURIComponent(urlObj.searchParams.get('file') || ''));

      if (!archivePath || !fileName) {
        res.writeHead(400);
        res.end('Missing parameters');
        return;
      }

      const resolvedArchivePath = archivePath;

      if (!fs.existsSync(resolvedArchivePath)) {
        res.writeHead(404);
        res.end('Archive not found');
        return;
      }

      const fileExt = path.extname(fileName).toLowerCase();
      const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(fileExt);

      if (!isVideo) {
        res.writeHead(400);
        res.end('Not a video file');
        return;
      }

      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.mov': 'video/quicktime',
        '.wmv': 'video/x-ms-wmv',
        '.flv': 'video/x-flv',
        '.m4v': 'video/x-m4v',
        '.3gp': 'video/3gpp',
        '.ts': 'video/mp2t'
      };
      const mimeType = mimeTypes[fileExt] || 'application/octet-stream';

      ensureArchiveVideoExtracted(resolvedArchivePath, fileName)
        .then((extractedPath) => {
          if (!extractedPath || !fs.existsSync(extractedPath)) {
            if (!res.headersSent) {
              res.writeHead(404);
              res.end('File not found in archive');
            }
            return;
          }
          serveLocalFileWithRange(req, res, extractedPath, mimeType);
        })
        .catch((error) => {
          log('Error streaming archive video:', error);
          if (!res.headersSent) {
            res.writeHead(500);
            res.end('Error reading archive');
          }
        });
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  server.listen(videoServerPort, VIDEO_HTTP_HOST, () => {
    globalThis.videoServerPort = videoServerPort;
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && videoServerPort < VIDEO_HTTP_PORT_MAX) {
      videoServerPort++;
      startVideoHttpServer();
    } else {
      throw err;
    }
  });
}

export function registerLocalVideoProtocol() {
  protocol.registerStreamProtocol('localvideo', (request, callback) => {
    try {
      const parsedUrl = new URL(request.url);
      const filePath = resolveUserFilePath(decodeURIComponent(parsedUrl.searchParams.get('path') || ''), appDataDir);
      if (!filePath) {
        callback({ statusCode: 400 });
        return;
      }
      const resolvedPath = filePath;
      const ext = path.extname(resolvedPath).toLowerCase();
      const isVideo = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(ext);

      if (!isVideo || !fs.existsSync(resolvedPath)) {
        callback({ statusCode: 404 });
        return;
      }
      // 확장자별 MIME 타입 매핑
      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.mov': 'video/quicktime',
        '.wmv': 'video/x-ms-wmv',
        '.flv': 'video/x-flv',
        '.m4v': 'video/x-m4v',
        '.3gp': 'video/3gpp',
        '.ts': 'video/mp2t'
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      callback({
        statusCode: 200,
        headers: { 'Content-Type': mimeType },
        data: fs.createReadStream(resolvedPath)
      });
    } catch (e) {
      callback({ statusCode: 500 });
    }
  });
}
