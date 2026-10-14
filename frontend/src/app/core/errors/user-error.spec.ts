import { HttpErrorResponse } from '@angular/common/http';
import { ValidationErrors } from '@angular/forms';
import bn from '../../../../public/i18n/bn.json';
import en from '../../../../public/i18n/en.json';
import { fieldErrorKey, toUserMessageKey } from './user-error';

const httpError = (status: number, body: unknown = null) =>
  new HttpErrorResponse({ status, error: body, url: '/api/x' });

function lookup(tree: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);
}

describe('toUserMessageKey', () => {
  it.each([
    [0, 'errors.network'],
    [401, 'errors.unauthorized'],
    [403, 'errors.forbidden'],
    [404, 'errors.notFound'],
    [409, 'errors.conflict'],
    [413, 'errors.fileTooLarge'],
    [400, 'errors.validation'],
    [422, 'errors.validation'],
    [429, 'errors.tooManyRequests'],
    [500, 'errors.server'],
    [502, 'errors.server'],
    [503, 'errors.server'],
    [599, 'errors.server'],
    [418, 'errors.unknown'],
  ])('maps HTTP %i to %s', (status, key) => {
    expect(toUserMessageKey(httpError(status))).toBe(key);
  });

  it.each([[null], [undefined], ['boom'], [42], [new Error('x')], [{ status: 500 }]])(
    'maps non-http value %j to errors.unknown',
    (value) => {
      expect(toUserMessageKey(value)).toBe('errors.unknown');
    },
  );

  it('never depends on the raw server detail text', () => {
    const key = toUserMessageKey(
      httpError(409, { detail: 'duplicate key value violates unique constraint' }),
    );
    expect(key).toBe('errors.conflict');
  });
});

describe('fieldErrorKey', () => {
  it('returns null when there are no errors', () => {
    expect(fieldErrorKey(null)).toBeNull();
    expect(fieldErrorKey({})).toBeNull();
  });

  it.each<[ValidationErrors, string]>([
    [{ required: true }, 'errors.field.required'],
    [{ bdMobile: true }, 'errors.field.mobile'],
    [{ nid: true }, 'errors.field.nid'],
    [{ email: true }, 'errors.field.invalid'],
    [{ somethingElse: true }, 'errors.field.invalid'],
  ])('maps %j to %s', (errors, key) => {
    expect(fieldErrorKey(errors)).toBe(key);
  });

  it('reports required before format errors', () => {
    expect(fieldErrorKey({ bdMobile: true, required: true })).toBe('errors.field.required');
  });
});

describe('i18n catalogue', () => {
  const keys = [
    'errors.network',
    'errors.unauthorized',
    'errors.forbidden',
    'errors.notFound',
    'errors.conflict',
    'errors.fileTooLarge',
    'errors.validation',
    'errors.tooManyRequests',
    'errors.server',
    'errors.unknown',
    'errors.field.required',
    'errors.field.mobile',
    'errors.field.nid',
    'errors.field.invalid',
  ];

  it.each(keys)('has non-empty bn and en text for %s', (key) => {
    const bnText = lookup(bn, key);
    const enText = lookup(en, key);
    expect(typeof bnText).toBe('string');
    expect(typeof enText).toBe('string');
    expect((bnText as string).length).toBeGreaterThan(0);
    expect((enText as string).length).toBeGreaterThan(0);
  });

  it('keeps Bangla messages free of Latin letters (except the mobile example placeholder)', () => {
    for (const key of keys) {
      const text = (lookup(bn, key) as string).replace('XXXXXXXX', '');
      expect(text, key).not.toMatch(/[A-Za-z]/);
    }
  });

  it('uses the agreed Bangla wording for network, mobile and NID errors', () => {
    expect(lookup(bn, 'errors.network')).toBe('ইন্টারনেট সংযোগ নেই। সংযোগ দেখে আবার চেষ্টা করুন।');
    expect(lookup(bn, 'errors.field.mobile')).toBe(
      'মোবাইল নম্বর ১১ সংখ্যার হতে হবে, যেমন ০১৭XXXXXXXX',
    );
    expect(lookup(bn, 'errors.field.nid')).toBe(
      'জাতীয় পরিচয়পত্র নম্বর ১০, ১৩ বা ১৭ সংখ্যার হতে হবে',
    );
  });
});

describe('known server detail codes', () => {
  it.each([
    [422, 'PHOTO_REQUIRED', 'errors.code.PHOTO_REQUIRED'],
    [422, 'PROPERTY_PROOF_REQUIRED', 'errors.code.PROPERTY_PROOF_REQUIRED'],
    [409, 'DAG_REQUIRED', 'errors.code.DAG_REQUIRED'],
    [422, 'ABROAD_ADDRESS_REQUIRED', 'errors.code.ABROAD_ADDRESS_REQUIRED'],
    [422, 'DAG_REQUIRED_FIELD', 'errors.code.DAG_REQUIRED_FIELD'],
    [404, 'SHARE_NOT_FOUND', 'errors.code.SHARE_NOT_FOUND'],
    [409, 'SHARE_ALREADY_PAID', 'errors.code.SHARE_ALREADY_PAID'],
    [409, 'DUPLICATE_TRANSACTION_REF', 'errors.code.DUPLICATE_TRANSACTION_REF'],
    [422, 'REFERENCE_REQUIRED', 'errors.code.REFERENCE_REQUIRED'],
    [422, 'AMOUNT_EXCEEDS_REMAINING', 'errors.code.AMOUNT_EXCEEDS_REMAINING'],
    [404, 'FEATURE_DISABLED', 'errors.code.FEATURE_DISABLED'],
    [422, 'INVALID_BD_MOBILE', 'errors.code.INVALID_BD_MOBILE'],
    [409, 'PHONE_DUPLICATE', 'errors.code.PHONE_DUPLICATE'],
    [409, 'PHONE_FIX_ALREADY_RESOLVED', 'errors.code.PHONE_FIX_ALREADY_RESOLVED'],
    [404, 'PHONE_FIX_NOT_FOUND', 'errors.code.PHONE_FIX_NOT_FOUND'],
    [404, 'PHONE_FIX_TARGET_NOT_FOUND', 'errors.code.PHONE_FIX_TARGET_NOT_FOUND'],
    [409, 'LOGIN_AMBIGUOUS_IDENTIFIER', 'errors.code.LOGIN_AMBIGUOUS_IDENTIFIER'],
    [422, 'PASSWORD_TOO_SHORT', 'errors.code.PASSWORD_TOO_SHORT'],
    [422, 'PASSWORD_TOO_COMMON', 'errors.code.PASSWORD_TOO_COMMON'],
    [422, 'PASSWORD_SAME_AS_CURRENT', 'errors.code.PASSWORD_SAME_AS_CURRENT'],
  ])('maps %i %s to a friendly key', (status, code, key) => {
    expect(toUserMessageKey(httpError(status, { detail: { code } }))).toBe(key);
  });

  it('also reads a code that sits at the top of the body', () => {
    expect(toUserMessageKey(httpError(409, { code: 'LOGIN_AMBIGUOUS_IDENTIFIER' }))).toBe('errors.code.LOGIN_AMBIGUOUS_IDENTIFIER');
  });

  it('ignores unknown codes and string details', () => {
    expect(toUserMessageKey(httpError(409, { detail: { code: 'WHATEVER' } }))).toBe('errors.conflict');
    expect(toUserMessageKey(httpError(422, { detail: 'PHOTO_REQUIRED' }))).toBe('errors.validation');
  });

  it.each([
    'PHOTO_REQUIRED', 'PROPERTY_PROOF_REQUIRED', 'DAG_REQUIRED', 'ABROAD_ADDRESS_REQUIRED', 'DAG_REQUIRED_FIELD',
    'SHARE_NOT_FOUND', 'SHARE_ALREADY_PAID', 'DUPLICATE_TRANSACTION_REF', 'REFERENCE_REQUIRED', 'AMOUNT_EXCEEDS_REMAINING', 'FEATURE_DISABLED',
    'INVALID_BD_MOBILE', 'PHONE_DUPLICATE', 'PHONE_FIX_ALREADY_RESOLVED', 'PHONE_FIX_NOT_FOUND', 'PHONE_FIX_TARGET_NOT_FOUND',
    'LOGIN_AMBIGUOUS_IDENTIFIER', 'PASSWORD_TOO_SHORT', 'PASSWORD_TOO_COMMON', 'PASSWORD_SAME_AS_CURRENT',
  ])(
    'has plain Bangla and English text for %s',
    (code) => {
      const bnText = lookup(bn, `errors.code.${code}`) as string;
      expect(typeof lookup(en, `errors.code.${code}`)).toBe('string');
      expect(bnText.length).toBeGreaterThan(0);
      expect(bnText).not.toMatch(/[A-Za-z]/);
    },
  );
});
