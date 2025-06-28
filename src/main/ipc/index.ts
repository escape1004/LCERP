import { ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { getThumbnailHash } from '../../lib/fileHandler';
import Database from 'better-sqlite3';
import https from 'https';
import http from 'http';
import { URL } from 'url';

// 표준화된 응답 타입
interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// 에러 처리 유틸리티 함수
const handleIpcError = (error: any): IpcResponse => {
  return {
    success: false,
    error: error.message || '알 수 없는 오류가 발생했습니다.'
  };
};

// URL 메타 정보 가져오기 함수
const getUrlMetaInfo = async (urlString: string): Promise<{ title?: string; description?: string; image?: string; siteName?: string }> => {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlString);
      const client = url.protocol === 'https:' ? https : http;
      
      // 브라우저처럼 보이는 User-Agent 설정
      const options = {
        timeout: 10000, // 10초로 증가
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      };
      
      const req = client.get(urlString, options, (res) => {
        let data = '';
        
        // 리다이렉트 처리
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          if (location) {
            req.destroy();
            // 절대 URL로 변환
            const redirectUrl = location.startsWith('http') ? location : new URL(location, urlString).href;
            getUrlMetaInfo(redirectUrl).then(resolve).catch(reject);
            return;
          }
        }
        
        // 성공적인 응답이 아닌 경우
        if (res.statusCode < 200 || res.statusCode >= 300) {
          req.destroy();
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }
        
        res.on('data', (chunk) => {
          data += chunk;
          // 메타 태그를 찾기 위해 충분한 데이터만 수집 (50KB로 증가)
          if (data.length > 50000) {
            req.destroy();
            resolve(parseMetaTags(data));
          }
        });
        
        res.on('end', () => {
          resolve(parseMetaTags(data));
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    } catch (error) {
      reject(error);
    }
  });
};

// HTML에서 메타 태그 파싱
const parseMetaTags = (html: string) => {
  const meta: { title?: string; description?: string; image?: string; siteName?: string } = {};
  
  // title 태그 (더 정교한 정규식)
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    meta.title = titleMatch[1].trim();
  }
  
  // meta 태그들 (더 포괄적인 정규식)
  const metaTags = html.match(/<meta[^>]+>/gi) || [];
  
  metaTags.forEach((tag, index) => {
    const nameMatch = tag.match(/name=["']([^"']+)["']/i);
    const propertyMatch = tag.match(/property=["']([^"']+)["']/i);
    const contentMatch = tag.match(/content=["']([^"']+)["']/i);
    
    if (contentMatch) {
      const name = nameMatch?.[1] || propertyMatch?.[1];
      const content = contentMatch[1];
      
      if (name === 'description') {
        meta.description = content;
      } else if (name === 'og:title' && !meta.title) {
        meta.title = content;
      } else if (name === 'og:description' && !meta.description) {
        meta.description = content;
      } else if (name === 'og:image') {
        meta.image = content;
      } else if (name === 'og:site_name') {
        meta.siteName = content;
      } else if (name === 'twitter:title' && !meta.title) {
        meta.title = content;
      } else if (name === 'twitter:description' && !meta.description) {
        meta.description = content;
      } else if (name === 'twitter:image' && !meta.image) {
        meta.image = content;
      }
    }
  });
  
  // 메타 정보가 없는 경우 기본 정보 제공
  if (!meta.title && !meta.description) {
    meta.title = '웹페이지';
    meta.description = '메타 정보를 가져올 수 없습니다.';
  }
  
  return meta;
};

export const registerAllHandlers = (db: Database.Database) => {
  // Shell 관련 핸들러
  ipcMain.handle('shell:openExternal', async (_, url: string): Promise<IpcResponse> => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return handleIpcError(error);
    }
  });

  // 파일 시스템 관련 핸들러
  ipcMain.handle('fs:getThumbnailDataUrl', async (_, filePath: string): Promise<IpcResponse<string | null>> => {
    try {
      const thumbnailDir = path.join('save', 'thumbnails');
      const hash = getThumbnailHash(filePath);
      const thumbnailPath = path.join(thumbnailDir, `thumb_${hash}.jpg`);

      if (!fs.existsSync(thumbnailPath)) {
        return { success: true, data: null };
      }

      const data = fs.readFileSync(thumbnailPath);
      const dataUrl = `data:image/jpeg;base64,${data.toString('base64')}`;
      return { success: true, data: dataUrl };
    } catch (error) {
      return handleIpcError(error);
    }
  });

  // 데이터베이스 관련 핸들러
  ipcMain.handle('db:getCategories', async (): Promise<IpcResponse> => {
    try {
      const categories = db.prepare('SELECT * FROM categories').all();
      return { success: true, data: categories };
    } catch (error) {
      return handleIpcError(error);
    }
  });

  // URL 메타 정보 가져오기 핸들러
  ipcMain.handle('getUrlMetaInfo', async (_, url: string): Promise<IpcResponse> => {
    try {
      const metaInfo = await getUrlMetaInfo(url);
      return { success: true, data: metaInfo };
    } catch (error) {
      return handleIpcError(error);
    }
  });
}; 