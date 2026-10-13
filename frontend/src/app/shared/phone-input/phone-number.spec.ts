import { FormControl } from '@angular/forms';
import {
  PINNED_PHONE_COUNTRY_CODES,
  composePhoneNumber,
  filterPhoneCountries,
  internationalPhoneValidator,
  isPossibleInternationalPhone,
  listPhoneCountries,
  listPinnedPhoneCountries,
  phoneStatus,
  splitPhoneNumber,
} from './phone-number';

describe('composePhoneNumber (normalisation to E.164)', () => {
  it.each([
    ['national with leading 0', '01712345678'],
    ['E.164', '+8801712345678'],
    ['calling code without plus', '8801712345678'],
    ['Bangla digits', '০১৭১২৩৪৫৬৭৮'],
    ['Bangla digits with plus', '+৮৮০১৭১২৩৪৫৬৭৮'],
    ['spaces and dashes', '017-1234 5678'],
    ['00 international prefix', '00 880 1712-345678'],
    ['padded', '  +880 1712-345678 '],
  ])('turns the %s form into +8801712345678 for Bangladesh', (_label, input) => {
    expect(composePhoneNumber('BD', input)).toBe('+8801712345678');
  });

  it('reads a +966 number whatever country is picked', () => {
    expect(composePhoneNumber('BD', '+966 50 123 4567')).toBe('+966501234567');
  });

  it('reads a 00-prefixed number whatever country is picked', () => {
    expect(composePhoneNumber('BD', '0044 7911 123456')).toBe('+447911123456');
    expect(composePhoneNumber('US', '0044 7911 123456')).toBe('+447911123456');
  });

  it('drops the national leading 0 using the picked country (UK)', () => {
    expect(composePhoneNumber('GB', '07911123456')).toBe('+447911123456');
  });

  it('adds the picked country calling code to a national number (SA)', () => {
    expect(composePhoneNumber('SA', '050 123 4567')).toBe('+966501234567');
  });

  it('returns an empty string for empty or non-numeric input', () => {
    expect(composePhoneNumber('BD', '')).toBe('');
    expect(composePhoneNumber('BD', '   ')).toBe('');
  });

  it('keeps an unparseable international number as +digits so it is flagged, not hidden', () => {
    expect(composePhoneNumber('BD', '+1')).toBe('+1');
  });
});

describe('splitPhoneNumber', () => {
  it('reads a legacy national value as Bangladeshi', () => {
    expect(splitPhoneNumber('01712345678')).toEqual({ country: 'BD', nationalNumber: '1712345678' });
  });

  it('reads Bangla digit legacy values', () => {
    expect(splitPhoneNumber('০১৭১২৩৪৫৬৭৮')).toEqual({ country: 'BD', nationalNumber: '1712345678' });
  });

  it('shows UK numbers under the pinned United Kingdom, not Guernsey', () => {
    expect(splitPhoneNumber('+447911123456')).toEqual({ country: 'GB', nationalNumber: '7911123456' });
  });

  it('shows +1 numbers under the pinned United States', () => {
    expect(splitPhoneNumber('+12025550123').country).toBe('US');
  });

  it('is empty on Bangladesh for blank values', () => {
    expect(splitPhoneNumber(null)).toEqual({ country: 'BD', nationalNumber: '' });
    expect(splitPhoneNumber('  ')).toEqual({ country: 'BD', nationalNumber: '' });
  });
});

describe('phoneStatus (two-tier validation)', () => {
  it('is empty for blank values', () => {
    expect(phoneStatus('')).toBe('empty');
    expect(phoneStatus(null)).toBe('empty');
  });

  it.each(['+8801712345678', '01712345678', '+966501234567', '+447911123456'])(
    'treats %s as valid',
    (value) => {
      expect(phoneStatus(value)).toBe('valid');
    },
  );

  it('flags a possible-but-unrecognised number as a warning, not an error', () => {
    // 10 digits after 880: possible length for BD but not a real numbering plan match.
    expect(phoneStatus('+880171234567')).toBe('unrecognised');
    expect(isPossibleInternationalPhone('+880171234567')).toBe(true);
  });

  it.each(['+88017', '123', '+8801712345678912345', 'abc', '+'])(
    'treats %s as impossible',
    (value) => {
      expect(phoneStatus(value)).toBe('impossible');
      expect(isPossibleInternationalPhone(value)).toBe(false);
    },
  );
});

describe('internationalPhoneValidator', () => {
  it('passes empty values (Validators.required owns that)', () => {
    expect(internationalPhoneValidator(new FormControl(''))).toBeNull();
  });

  it('passes valid numbers', () => {
    expect(internationalPhoneValidator(new FormControl('+8801712345678'))).toBeNull();
  });

  it('does not block a possible-but-unrecognised number', () => {
    expect(internationalPhoneValidator(new FormControl('+880171234567'))).toBeNull();
  });

  it('blocks an impossible number with phoneInvalid', () => {
    expect(internationalPhoneValidator(new FormControl('+88017'))).toEqual({ phoneInvalid: true });
  });
});

describe('country lists', () => {
  const PINNED_ORDER = [
    'BD', 'SA', 'AE', 'QA', 'KW', 'OM', 'BH', 'MY', 'SG', 'GB', 'US', 'IT', 'MV', 'JP', 'AU',
  ];

  it('pins the diaspora destinations in the agreed order', () => {
    expect([...PINNED_PHONE_COUNTRY_CODES]).toEqual(PINNED_ORDER);
    expect(listPinnedPhoneCountries('en').map((c) => c.code)).toEqual(PINNED_ORDER);
  });

  it('carries the right dial codes for the pinned countries', () => {
    const dials = Object.fromEntries(listPinnedPhoneCountries('en').map((c) => [c.code, c.dialCode]));
    expect(dials).toMatchObject({
      BD: '+880', SA: '+966', AE: '+971', QA: '+974', KW: '+965', OM: '+968', BH: '+973',
      MY: '+60', SG: '+65', GB: '+44', US: '+1', IT: '+39', MV: '+960', JP: '+81', AU: '+61',
    });
  });

  it('lists every country in the full list, pinned ones included', () => {
    const all = listPhoneCountries('en').map((c) => c.code);
    expect(all.length).toBeGreaterThan(200);
    for (const code of PINNED_ORDER) expect(all).toContain(code);
  });

  it('names pinned countries in Bangla via the fallback map when the browser has no bn data', () => {
    const names = Object.fromEntries(
      listPinnedPhoneCountries('bn', null).map((c) => [c.code, c.name]),
    );
    expect(names['BD']).toBe('বাংলাদেশ');
    expect(names['SA']).toBe('সৌদি আরব');
    expect(names['MV']).toBe('মালদ্বীপ');
    for (const code of PINNED_ORDER) expect(names[code]).toMatch(/[ঀ-৿]/);
  });

  it('falls back when Intl.DisplayNames just echoes the code back', () => {
    const echo = { of: (code: string) => code };
    expect(listPinnedPhoneCountries('bn', echo)[0].name).toBe('বাংলাদেশ');
  });

  it('uses Intl.DisplayNames for Bangla when available', () => {
    const sa = listPinnedPhoneCountries('bn').find((c) => c.code === 'SA');
    expect(sa?.name).toMatch(/[ঀ-৿]/);
  });

  it('filters by name, code or dial code, also with Bangla digits', () => {
    const all = listPhoneCountries('en');
    expect(filterPhoneCountries(all, 'saudi').map((c) => c.code)).toContain('SA');
    expect(filterPhoneCountries(all, 'bd').map((c) => c.code)).toContain('BD');
    expect(filterPhoneCountries(all, '+966').map((c) => c.code)).toContain('SA');
    expect(filterPhoneCountries(all, '৯৬৬').map((c) => c.code)).toContain('SA');
    expect(filterPhoneCountries(all, 'zzzz')).toEqual([]);
  });

  it('matches English names while the UI is Bangla', () => {
    const all = listPhoneCountries('bn');
    expect(filterPhoneCountries(all, 'saudi').map((c) => c.code)).toContain('SA');
  });
});
