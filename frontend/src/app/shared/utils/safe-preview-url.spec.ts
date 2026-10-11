import { isSafePreviewUrl } from './safe-preview-url';

const API = 'https://api.example.org/api';

describe('isSafePreviewUrl', () => {
  it('accepts blob: URLs', () => {
    expect(isSafePreviewUrl('blob:https://app.example.org/1234-abcd', API)).toBe(true);
  });

  it('accepts upload URLs on the API origin, including the media token query', () => {
    expect(isSafePreviewUrl('https://api.example.org/uploads/a/b%20c.pdf', API)).toBe(true);
    expect(isSafePreviewUrl('https://api.example.org/uploads/doc.pdf?t=abc.def', API)).toBe(true);
  });

  it('rejects javascript: and data: URLs', () => {
    expect(isSafePreviewUrl('javascript:alert(1)', API)).toBe(false);
    expect(isSafePreviewUrl('JaVaScRiPt:alert(1)', API)).toBe(false);
    expect(isSafePreviewUrl('data:text/html,<script>alert(1)</script>', API)).toBe(false);
  });

  it('rejects external origins and lookalikes', () => {
    expect(isSafePreviewUrl('https://evil.example.com/uploads/x.pdf', API)).toBe(false);
    expect(isSafePreviewUrl('https://api.example.org.evil.com/x.pdf', API)).toBe(false);
    expect(isSafePreviewUrl('http://api.example.org/uploads/x.pdf', API)).toBe(false);
    expect(isSafePreviewUrl('//evil.example.com/x.pdf', API)).toBe(false);
  });

  it('rejects empty values', () => {
    expect(isSafePreviewUrl(null, API)).toBe(false);
    expect(isSafePreviewUrl(undefined, API)).toBe(false);
    expect(isSafePreviewUrl('', API)).toBe(false);
  });

  it('accepts same-origin URLs when apiBaseUrl is relative', () => {
    const origin = window.location.origin;
    expect(isSafePreviewUrl(`${origin}/uploads/x.pdf`, '/api')).toBe(true);
    expect(isSafePreviewUrl('https://evil.example.com/x.pdf', '/api')).toBe(false);
  });
});
