import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import {
  CountryCode,
  PhoneNumber,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js/min';
import { toAsciiDigits } from '../../core/services/digits.helper';

/*
 * libphonenumber is imported from the "min" build (lengths + general number
 * patterns only, no per-type patterns). That is all we need to tell an
 * impossible number from a plausible one and it is about a third of the full
 * metadata. This file must only be reached from lazy route chunks.
 */

/**
 * Country preselected in the picker, and assumed for numbers typed without a
 * leading "+" (e.g. legacy "01712345678" values). Must match
 * DEFAULT_PHONE_REGION in backend/app/services/normalization.py.
 */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'BD';

/** Countries shown first in the picker (members live and work here), in this order. */
export const PINNED_PHONE_COUNTRY_CODES: readonly CountryCode[] = [
  'BD', 'SA', 'AE', 'QA', 'KW', 'OM', 'BH', 'MY', 'SG', 'GB', 'US', 'IT', 'MV', 'JP', 'AU',
];

/** Bangla names for the pinned countries, used when the browser has no Bangla region data. */
const PINNED_BN_NAMES: Partial<Record<CountryCode, string>> = {
  BD: 'বাংলাদেশ',
  SA: 'সৌদি আরব',
  AE: 'সংযুক্ত আরব আমিরাত',
  QA: 'কাতার',
  KW: 'কুয়েত',
  OM: 'ওমান',
  BH: 'বাহরাইন',
  MY: 'মালয়েশিয়া',
  SG: 'সিঙ্গাপুর',
  GB: 'যুক্তরাজ্য',
  US: 'যুক্তরাষ্ট্র',
  IT: 'ইতালি',
  MV: 'মালদ্বীপ',
  JP: 'জাপান',
  AU: 'অস্ট্রেলিয়া',
};

export interface PhoneCountry {
  code: CountryCode;
  name: string;
  /** English name, so "saudi" finds Saudi Arabia while the UI is in Bangla. */
  englishName: string;
  dialCode: string;
  flag: string;
}

/** Minimal slice of Intl.DisplayNames, so tests can inject a stand-in. */
export interface RegionNames {
  of(code: string): string | undefined;
}

export interface SplitPhoneNumber {
  country: CountryCode;
  nationalNumber: string;
}

/**
 * empty        nothing typed
 * valid        a number libphonenumber recognises
 * unrecognised plausible length but not a known numbering pattern (warn, do not block)
 * impossible   cannot be a phone number (block)
 */
export type PhoneStatus = 'empty' | 'valid' | 'unrecognised' | 'impossible';

const REGIONAL_INDICATOR_OFFSET = 0x1f1e6 - 'A'.charCodeAt(0);
const MAX_CALLING_CODE_LENGTH = 3;

function flagEmoji(code: string): string {
  return String.fromCodePoint(...[...code].map((c) => c.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET));
}

function regionNames(locale: string): RegionNames | null {
  try {
    const names = new Intl.DisplayNames([locale], { type: 'region' });
    // An unsupported locale silently resolves to the default one; treat that as "no data".
    return names.resolvedOptions().locale.toLowerCase().startsWith(locale.toLowerCase()) ? names : null;
  } catch {
    return null;
  }
}

function safeName(names: RegionNames | null, code: CountryCode): string | null {
  try {
    const name = names?.of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

function buildCountry(
  code: CountryCode,
  locale: string,
  names: RegionNames | null,
  english: RegionNames | null,
): PhoneCountry {
  const englishName = safeName(english, code) ?? code;
  const localized =
    safeName(names, code) ?? (locale === 'bn' ? PINNED_BN_NAMES[code] : undefined) ?? englishName;
  return {
    code,
    name: localized,
    englishName,
    dialCode: `+${getCountryCallingCode(code)}`,
    flag: flagEmoji(code),
  };
}

/** Every country libphonenumber knows, sorted by localized name. */
export function listPhoneCountries(
  locale = 'en',
  names: RegionNames | null = regionNames(locale),
): PhoneCountry[] {
  const english = regionNames('en');
  return getCountries()
    .map((code) => buildCountry(code, locale, names, english))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** The pinned countries, in their fixed order. */
export function listPinnedPhoneCountries(
  locale = 'en',
  names: RegionNames | null = regionNames(locale),
): PhoneCountry[] {
  const english = regionNames('en');
  return PINNED_PHONE_COUNTRY_CODES.map((code) => buildCountry(code, locale, names, english));
}

export function filterPhoneCountries(countries: PhoneCountry[], query: string): PhoneCountry[] {
  const term = toAsciiDigits(query).trim().toLowerCase();
  if (!term) return countries;
  const digits = term.replace(/\D/g, '');
  return countries.filter(
    (country) =>
      country.name.toLowerCase().includes(term) ||
      country.englishName.toLowerCase().includes(term) ||
      country.code.toLowerCase() === term ||
      (digits !== '' && country.dialCode.slice(1).startsWith(digits)),
  );
}

/**
 * Keep only what matters for dialling: ASCII digits, and a leading "+" (a
 * leading "00" is the same thing, so it becomes "+"). Bangla digits, spaces,
 * dashes and brackets are dropped. Returns '' when there are no digits.
 */
export function toDialableInput(raw: string | null | undefined): string {
  const cleaned = toAsciiDigits(raw ?? '').replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return '';
  if (cleaned.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  return digits;
}

/** True when the text names its own country ("+966 …" or "00966 …"). */
export function isInternationalInput(raw: string | null | undefined): boolean {
  return toDialableInput(raw).startsWith('+');
}

/** Parse any stored or typed shape; national forms are read in `country`. */
export function parsePhone(
  value: string | null | undefined,
  country: CountryCode = DEFAULT_PHONE_COUNTRY,
): PhoneNumber | undefined {
  const dialable = toDialableInput(value);
  if (!dialable) return undefined;
  return parsePhoneNumberFromString(dialable, country);
}

/**
 * libphonenumber labels all +44 mobiles Guernsey/Jersey/Isle of Man and all +1
 * numbers by area code. Show the picked country when it shares the calling
 * code, otherwise the pinned country for that code, otherwise the parsed one.
 */
function preferredCountry(parsed: CountryCode, hint: CountryCode): CountryCode {
  if (parsed === hint) return parsed;
  const callingCode = getCountryCallingCode(parsed);
  if (callingCode === getCountryCallingCode(hint)) return hint;
  return PINNED_PHONE_COUNTRY_CODES.find((c) => getCountryCallingCode(c) === callingCode) ?? parsed;
}

/** Country for an international number too short for libphonenumber to parse. */
function splitByCallingCode(digits: string): SplitPhoneNumber | null {
  const countries = [...PINNED_PHONE_COUNTRY_CODES, ...getCountries()];
  for (let length = 1; length <= MAX_CALLING_CODE_LENGTH; length++) {
    const prefix = digits.slice(0, length);
    const country = countries.find((c) => getCountryCallingCode(c) === prefix);
    if (country) return { country, nationalNumber: digits.slice(length) };
  }
  return null;
}

/** Split a stored value (E.164 or legacy national) into country + national digits. */
export function splitPhoneNumber(
  value: string | null | undefined,
  fallbackCountry: CountryCode = DEFAULT_PHONE_COUNTRY,
): SplitPhoneNumber {
  const dialable = toDialableInput(value);
  if (!dialable) return { country: fallbackCountry, nationalNumber: '' };

  const parsed = parsePhone(dialable, fallbackCountry);
  if (parsed?.country) {
    return {
      country: preferredCountry(parsed.country, fallbackCountry),
      nationalNumber: parsed.nationalNumber,
    };
  }
  if (dialable.startsWith('+')) {
    const split = splitByCallingCode(dialable.slice(1));
    if (split) return split;
  }
  return { country: fallbackCountry, nationalNumber: dialable.replace(/\D/g, '') };
}

/**
 * Combine the picker's country with what the user typed. Returns E.164 when
 * the number parses; otherwise a best-effort "+<digits>" string so the
 * validator can still flag it as invalid instead of the control looking empty.
 * A number that names its own country ("+…", "00…") wins over the picker.
 */
export function composePhoneNumber(country: CountryCode, input: string): string {
  const dialable = toDialableInput(input);
  if (!dialable) return '';
  const parsed = parsePhone(dialable, country);
  if (parsed) return parsed.number;
  if (dialable.startsWith('+')) return dialable;
  return `+${getCountryCallingCode(country)}${dialable.replace(/^0+/, '')}`;
}

export function phoneStatus(
  value: string | null | undefined,
  country: CountryCode = DEFAULT_PHONE_COUNTRY,
): PhoneStatus {
  if (!(value ?? '').trim()) return 'empty';
  const parsed = parsePhone(value, country);
  if (!parsed || !parsed.isPossible()) return 'impossible';
  return parsed.isValid() ? 'valid' : 'unrecognised';
}

/** A number libphonenumber fully recognises. */
export function isValidInternationalPhone(value: string | null | undefined): boolean {
  return phoneStatus(value) === 'valid';
}

/** Plausible enough to accept (valid, or valid length but unrecognised pattern). */
export function isPossibleInternationalPhone(value: string | null | undefined): boolean {
  const status = phoneStatus(value);
  return status === 'valid' || status === 'unrecognised';
}

/**
 * Empty values pass (pair with Validators.required). Only impossible numbers
 * block; plausible-but-unrecognised ones get a warning under the field.
 */
export const internationalPhoneValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value = control.value as string | null;
  if (!value?.trim()) return null;
  return phoneStatus(value) === 'impossible' ? { phoneInvalid: true } : null;
};
