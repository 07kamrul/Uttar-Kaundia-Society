import { withExtension } from './my-data-panel.component';

describe('withExtension', () => {
  it('appends .jpg for a JPEG blob', () => {
    expect(withExtension('member_photo', 'image/jpeg')).toBe('member_photo.jpg');
  });

  it('appends .png and ignores MIME parameters', () => {
    expect(withExtension('receipt_photo', 'image/png; charset=binary')).toBe('receipt_photo.png');
  });

  it('appends .pdf for a PDF blob', () => {
    expect(withExtension('PR-2026-0001 NID', 'application/pdf')).toBe('PR-2026-0001 NID.pdf');
  });

  it('does not duplicate an existing extension', () => {
    expect(withExtension('photo.jpg', 'image/jpeg')).toBe('photo.jpg');
  });

  it('keeps the name unchanged when the MIME type is empty or unknown', () => {
    expect(withExtension('member_photo', '')).toBe('member_photo');
    expect(withExtension('member_photo', 'application/octet-stream')).toBe('member_photo');
  });
});
