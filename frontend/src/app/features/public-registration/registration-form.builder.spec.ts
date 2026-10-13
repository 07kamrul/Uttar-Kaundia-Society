import { FormBuilder } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { buildPropertyGroup, buildRegistrationForm } from './registration-form.builder';

describe('buildPropertyGroup share quantity validation', () => {
  const fb = new FormBuilder();

  it('flags share quantity greater than total land quantity', () => {
    const group = buildPropertyGroup(fb);
    group.patchValue({ landQuantity: '6', myShareQuantity: '7' });

    expect(group.hasError('shareExceedsTotal')).toBe(true);
  });

  it('allows share quantity equal to total land quantity', () => {
    const group = buildPropertyGroup(fb);
    group.patchValue({ landQuantity: '6', myShareQuantity: '6' });

    expect(group.hasError('shareExceedsTotal')).toBe(false);
  });

  it('allows share quantity less than total land quantity', () => {
    const group = buildPropertyGroup(fb);
    group.patchValue({ landQuantity: '2.5', myShareQuantity: '1.25' });

    expect(group.hasError('shareExceedsTotal')).toBe(false);
  });

  it('does not flag when values are missing or not numbers', () => {
    const group = buildPropertyGroup(fb);
    group.patchValue({ landQuantity: '', myShareQuantity: '' });

    expect(group.hasError('shareExceedsTotal')).toBe(false);
  });
});

describe('buildPropertyGroup zero quantity validation', () => {
  const fb = new FormBuilder();

  it('rejects zero total land quantity', () => {
    const group = buildPropertyGroup(fb);
    group.patchValue({ landQuantity: '0', myShareQuantity: '1' });

    expect(group.get('landQuantity')?.hasError('notPositive')).toBe(true);
  });

  it('rejects zero share quantity', () => {
    const group = buildPropertyGroup(fb);
    group.patchValue({ landQuantity: '6', myShareQuantity: '0' });

    expect(group.get('myShareQuantity')?.hasError('notPositive')).toBe(true);
  });

  it('rejects zero formatted as decimal', () => {
    const group = buildPropertyGroup(fb);
    group.patchValue({ landQuantity: '0.0', myShareQuantity: '0.00' });

    expect(group.get('landQuantity')?.hasError('notPositive')).toBe(true);
    expect(group.get('myShareQuantity')?.hasError('notPositive')).toBe(true);
  });

  it('accepts positive decimal quantities', () => {
    const group = buildPropertyGroup(fb);
    group.patchValue({ landQuantity: '6', myShareQuantity: '1.5' });

    expect(group.get('landQuantity')?.hasError('notPositive')).toBe(false);
    expect(group.get('myShareQuantity')?.hasError('notPositive')).toBe(false);
  });

  it('leaves empty values to the required validator', () => {
    const group = buildPropertyGroup(fb);
    group.patchValue({ landQuantity: '', myShareQuantity: '' });

    expect(group.get('landQuantity')?.hasError('notPositive')).toBe(false);
    expect(group.get('landQuantity')?.hasError('required')).toBe(true);
    expect(group.get('myShareQuantity')?.hasError('notPositive')).toBe(false);
    expect(group.get('myShareQuantity')?.hasError('required')).toBe(true);
  });
});

describe('buildRegistrationForm required identity fields (both layers)', () => {
  const fb = new FormBuilder();

  it('requires an email', () => {
    const form = buildRegistrationForm(fb);
    expect(form.get('email')?.hasError('required')).toBe(true);
    form.patchValue({ email: 'a@b.co' });
    expect(form.get('email')?.valid).toBe(true);
  });

  it('requires a NID of exactly 10, 13 or 17 digits and accepts Bangla digits', () => {
    const nid = buildRegistrationForm(fb).get('nid')!;
    expect(nid.hasError('required')).toBe(true);
    nid.setValue('12345678901');
    expect(nid.hasError('nid')).toBe(true);
    nid.setValue('১২৩৪৫৬৭৮৯০');
    expect(nid.valid).toBe(true);
    nid.setValue('1234567890123');
    expect(nid.valid).toBe(true);
  });
});

describe('buildRegistrationForm batch 1 controls', () => {
  const fb = new FormBuilder();

  it('adds whatsapp, abroad address and consent controls with safe defaults', () => {
    const value = buildRegistrationForm(fb).getRawValue();
    expect(value.hasWhatsapp).toBe(null);
    expect(value.currentAddressAbroad).toBe(false);
    expect(value.currentCountry).toBe('');
    expect(value.currentCity).toBe('');
    expect(value.currentAddressText).toBe('');
  });

  it('keeps road required unless the road-optional option is set', () => {
    expect(buildRegistrationForm(fb).get('currentAddress.road')?.hasError('required')).toBe(true);
    const relaxed = buildRegistrationForm(fb, { roadOptional: true });
    expect(relaxed.get('currentAddress.road')?.valid).toBe(true);
    expect(relaxed.get('permanentAddress.road')?.valid).toBe(true);
  });

  it('adds a dagUnknown flag to every property, off by default', () => {
    expect(buildPropertyGroup(fb).get('dagUnknown')?.value).toBe(false);
  });
});
