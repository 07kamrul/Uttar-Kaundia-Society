import { describePhone, formatPhone } from './phone-format';

describe('formatPhone', () => {
  it.each([
    ['E.164', '+8801712345678'],
    ['legacy 01… value (default region BD)', '01712345678'],
    ['calling code without plus', '8801712345678'],
    ['Bangla digits', '০১৭১২৩৪৫৬৭৮'],
  ])('shows the international format for a %s', (_label, value) => {
    expect(formatPhone(value, 'en')).toBe('+880 1712 345678');
  });

  it('uses Bangla digits in bn mode', () => {
    expect(formatPhone('+8801712345678', 'bn')).toBe('+৮৮০ ১৭১২ ৩৪৫৬৭৮');
  });

  it('formats other countries', () => {
    expect(formatPhone('+966501234567', 'en')).toBe('+966 50 123 4567');
    expect(formatPhone('+447911123456', 'en')).toBe('+44 7911 123456');
  });

  it('returns unparseable values as typed (trimmed) so nothing is hidden', () => {
    expect(formatPhone('  call after 5  ', 'en')).toBe('call after 5');
  });

  it.each([null, undefined, '', '   '])('returns an empty string for %j', (value) => {
    expect(formatPhone(value, 'bn')).toBe('');
  });
});

describe('describePhone', () => {
  it('builds E.164, tel and WhatsApp links from any stored shape', () => {
    for (const value of ['01712345678', '+8801712345678', '8801712345678', '০১৭১২৩৪৫৬৭৮']) {
      expect(describePhone(value)).toMatchObject({
        e164: '+8801712345678',
        telHref: 'tel:+8801712345678',
        whatsAppHref: 'https://wa.me/8801712345678',
        international: '+880 1712 345678',
      });
    }
  });

  it('gives no tel/WhatsApp links for possible-but-unrecognised numbers (parity with the app)', () => {
    // One digit short: possible length, not a valid BD mobile. A typo must not
    // open a stranger's dialler, but the number still displays and copies.
    const phone = describePhone('0171234567');
    expect(phone).not.toBeNull();
    expect(phone?.e164).toBe('+880171234567');
    expect(phone?.telHref).toBeNull();
    expect(phone?.whatsAppHref).toBeNull();
  });

  it('returns null when the value cannot be dialled', () => {
    expect(describePhone('not a number')).toBeNull();
    expect(describePhone('')).toBeNull();
    expect(describePhone(null)).toBeNull();
    expect(describePhone('123')).toBeNull();
  });
});
