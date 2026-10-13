import { toAsciiDigits } from '../../core/services/digits.helper';

/** Translates an i18n key (with optional params) into display text. */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

interface AbroadAddressValue {
  currentCountry?: string;
  currentCity?: string;
  currentAddressText?: string;
}

interface DocValue {
  type: string;
  fileDataUrl?: string;
}

interface DagValue {
  dagUnknown?: boolean;
  dagNo?: { cs?: string; rs?: string };
}

/** reg_abroad_address: country (not Bangladesh), city and a free-text address are all required. */
export function abroadAddressErrors(value: AbroadAddressValue, t: Translate): string[] {
  const errs: string[] = [];
  const country = (value.currentCountry ?? '').trim().toUpperCase();
  if (!country) errs.push(t('registration.validation.abroadCountryRequired'));
  else if (country === 'BD') errs.push(t('registration.validation.abroadCountryNotBd'));
  if (!(value.currentCity ?? '').trim()) errs.push(t('registration.validation.abroadCityRequired'));
  if (!(value.currentAddressText ?? '').trim())
    errs.push(t('registration.validation.abroadAddressRequired'));
  return errs;
}

/** reg_min_one_proof: at least one of the document slots must carry a file. */
export function hasAtLeastOneProof(docs: readonly DocValue[] | undefined): boolean {
  return (docs ?? []).some((doc) => !!doc.fileDataUrl);
}

/** reg_dag_unknown: both dag numbers are required unless the member ticked "I do not know". */
export function dagErrors(property: DagValue, label: string, t: Translate): string[] {
  if (property.dagUnknown === true) return [];
  const errs: string[] = [];
  if (!(property.dagNo?.cs ?? '').trim())
    errs.push(`${label}: ${t('registration.property.dagNoCsRequired')}`);
  if (!(property.dagNo?.rs ?? '').trim())
    errs.push(`${label}: ${t('registration.property.dagNoRsRequired')}`);
  return errs;
}

/** Accepts Bangla digits typed on a phone keyboard; keeps everything else as typed. */
export function normaliseDigitsInput(value: string): string {
  return toAsciiDigits(value);
}
