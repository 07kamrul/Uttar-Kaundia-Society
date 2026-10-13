import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { toAsciiDigits } from '../services/digits.helper';

export { toAsciiDigits };

/** Characters people type between digit groups; stripped before validation. */
const SEPARATORS = /[\s\-().]/g;
/** Bangladesh mobile: 01 + operator digit 3-9 + 8 more digits. */
const BD_MOBILE = /^01[3-9]\d{8}$/;
const BD_COUNTRY_CODE = '880';
const NID_LENGTHS: readonly number[] = [10, 13, 17];

function cleanDigits(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return toAsciiDigits(value).replace(SEPARATORS, '');
}

/**
 * Normalizes a Bangladesh mobile number to the local 11-digit form
 * (`01XXXXXXXXX`). Accepts `01…`, `+8801…`, `8801…`, spaces/dashes and Bangla
 * digits. Returns null when it is not a valid mobile number.
 */
export function normalizeBdMobile(value: string | null | undefined): string | null {
  const cleaned = cleanDigits(value);
  if (cleaned === null) return null;
  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  const local = digits.startsWith(BD_COUNTRY_CODE) ? `0${digits.slice(BD_COUNTRY_CODE.length)}` : digits;
  return BD_MOBILE.test(local) ? local : null;
}

/** True for a National ID of exactly 10, 13 or 17 digits (Bangla digits, spaces and dashes allowed). */
export function isValidNid(value: string | null | undefined): boolean {
  const cleaned = cleanDigits(value);
  if (cleaned === null || !/^\d+$/.test(cleaned)) return false;
  return NID_LENGTHS.includes(cleaned.length);
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/** Flags `{ bdMobile: true }`. Empty values pass so `Validators.required` owns that error. */
export const bdMobileValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  if (isBlank(control.value)) return null;
  return normalizeBdMobile(control.value) === null ? { bdMobile: true } : null;
};

/** Flags `{ nid: true }`. Empty values pass so `Validators.required` owns that error. */
export const nidValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  if (isBlank(control.value)) return null;
  return isValidNid(control.value) ? null : { nid: true };
};
