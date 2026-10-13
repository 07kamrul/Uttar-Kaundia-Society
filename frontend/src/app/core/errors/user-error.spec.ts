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
  ])('maps %i %s to a friendly key', (status, code, key) => {
    expect(toUserMessageKey(httpError(status, { detail: { code } }))).toBe(key);
  });

  it('ignores unknown codes and string details', () => {
    expect(toUserMessageKey(httpError(409, { detail: { code: 'WHATEVER' } }))).toBe('errors.conflict');
    expect(toUserMessageKey(httpError(422, { detail: 'PHOTO_REQUIRED' }))).toBe('errors.validation');
  });

  it.each(['PHOTO_REQUIRED', 'PROPERTY_PROOF_REQUIRED', 'DAG_REQUIRED', 'ABROAD_ADDRESS_REQUIRED', 'DAG_REQUIRED_FIELD'])(
    'has plain Bangla and English text for %s',
    (code) => {
      const bnText = lookup(bn, `errors.code.${code}`) as string;
      expect(typeof lookup(en, `errors.code.${code}`)).toBe('string');
      expect(bnText.length).toBeGreaterThan(0);
      expect(bnText).not.toMatch(/[A-Za-z]/);
    },
  );
});
