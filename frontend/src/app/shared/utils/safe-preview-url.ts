import { environment } from '../../../environments/environment';

/**
 * Whether a URL may be embedded in a preview iframe via
 * `DomSanitizer.bypassSecurityTrustResourceUrl`. Only same-document blob: URLs
 * (created by AttachmentService downloads) and URLs on the backend uploads/API
 * origin are allowed; javascript:, data: and arbitrary external URLs are rejected.
 */
export function isSafePreviewUrl(
  url: string | null | undefined,
  apiBaseUrl: string = environment.apiBaseUrl,
): boolean {
  if (!url) return false;
  const base = typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
  let parsed: URL;
  let allowedOrigin: string;
  try {
    parsed = new URL(url, base);
    // Same derivation as toFileUrl(): apiBaseUrl without the `/api` suffix.
    allowedOrigin = new URL(apiBaseUrl.replace(/\/api\/?$/, '') || '/', base).origin;
  } catch {
    return false;
  }
  if (parsed.protocol === 'blob:') return true;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return parsed.origin === allowedOrigin;
}
