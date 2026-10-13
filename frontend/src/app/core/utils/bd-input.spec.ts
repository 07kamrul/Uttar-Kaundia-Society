import { FormControl } from '@angular/forms';
import { bdMobileValidator, isValidNid, nidValidator, normalizeBdMobile, toAsciiDigits } from './bd-input';

describe('toAsciiDigits', () => {
  it('converts Bangla digits and keeps everything else', () => {
    expect(toAsciiDigits('০১৭১২-৩৪৫৬৭৮ abc')).toBe('01712-345678 abc');
  });

  it('leaves ASCII and empty strings untouched', () => {
    expect(toAsciiDigits('0123456789')).toBe('0123456789');
    expect(toAsciiDigits('')).toBe('');
  });
});

describe('normalizeBdMobile', () => {
  it.each([
    ['01712345678', '01712345678'],
    ['+8801712345678', '01712345678'],
    ['8801712345678', '01712345678'],
    ['+880 1712-345 678', '01712345678'],
    ['017 1234 5678', '01712345678'],
    ['০১৭১২৩৪৫৬৭৮', '01712345678'],
    ['+৮৮০১৭১২৩৪৫৬৭৮', '01712345678'],
    ['  01912345678  ', '01912345678'],
    ['(017) 12.345.678', '01712345678'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeBdMobile(input)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['0171234567'], // 10 digits
    ['017123456789'], // 12 digits
    ['02712345678'], // not 01
    ['01212345678'], // 012 is not an operator prefix
    ['01012345678'], // 010 is not an operator prefix
    ['+8791712345678'], // wrong country code
    ['017123abc78'],
    ['88017123456'], // too short
  ])('rejects %j', (input) => {
    expect(normalizeBdMobile(input)).toBeNull();
  });

  it('rejects null, undefined and non-strings', () => {
    expect(normalizeBdMobile(null)).toBeNull();
    expect(normalizeBdMobile(undefined)).toBeNull();
    expect(normalizeBdMobile(1712345678 as unknown as string)).toBeNull();
  });
});

describe('isValidNid', () => {
  it.each(['1234567890', '1234567890123', '12345678901234567', '১২৩৪৫৬৭৮৯০', ' 1234 5678 90 ', '1234-5678-90'])(
    'accepts %s',
    (nid) => expect(isValidNid(nid)).toBe(true),
  );

  it.each(['', '123456789', '12345678901', '123456789012', '12345678901234', '123456789012345678', '12345abcde'])(
    'rejects %j',
    (nid) => expect(isValidNid(nid)).toBe(false),
  );

  it('rejects null and undefined', () => {
    expect(isValidNid(null)).toBe(false);
    expect(isValidNid(undefined)).toBe(false);
  });
});

describe('validators', () => {
  it('bdMobileValidator ignores empty values so required can own that error', () => {
    expect(bdMobileValidator(new FormControl(''))).toBeNull();
    expect(bdMobileValidator(new FormControl(null))).toBeNull();
  });

  it('bdMobileValidator accepts a normalizable number and flags a bad one', () => {
    expect(bdMobileValidator(new FormControl('+8801712345678'))).toBeNull();
    expect(bdMobileValidator(new FormControl('12345'))).toEqual({ bdMobile: true });
  });

  it('nidValidator ignores empty, accepts 10/13/17 digits, flags others', () => {
    expect(nidValidator(new FormControl(''))).toBeNull();
    expect(nidValidator(new FormControl('1234567890'))).toBeNull();
    expect(nidValidator(new FormControl('12345'))).toEqual({ nid: true });
  });
});
