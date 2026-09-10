import { isolatedRendererUrl } from '../store';
import { videoHttpOrigins } from '../lib/security';

export function buildContentSecurityPolicy() {
  const videoOrigins = videoHttpOrigins().join(' ');
  const isViteDev = Boolean(process.env.VITE_DEV_SERVER_URL);
  const isIsolatedPage = Boolean(isolatedRendererUrl);
  const scriptSrc = isViteDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : isIsolatedPage
      ? "'self' 'unsafe-inline'"
      : "'self'";
  const styleSrc = isViteDev || isIsolatedPage
    ? "'self' 'unsafe-inline' https://fonts.googleapis.com"
    : "'self' https://fonts.googleapis.com";
  const connectSrc = [
    "'self'",
    videoOrigins,
    isViteDev ? 'http://localhost:5174 ws://localhost:5174 ws://127.0.0.1:5174' : ''
  ].filter(Boolean).join(' ');

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `script-src-attr 'none'`,
    `style-src ${styleSrc}`,
    `style-src-attr 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `media-src 'self' data: blob: localvideo: ${videoOrigins}`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `connect-src ${connectSrc}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`
  ].join('; ');
}
