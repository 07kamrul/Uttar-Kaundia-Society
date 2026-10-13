import { formatDate } from '@angular/common';
import '../../core/i18n/register-bn-locale';

/**
 * Pure formatting behind the bnDate / bnNumber / taka pipes.
 *
 * Number grouping follows the Bangladesh convention (lakh/crore: 12,34,567),
 * i.e. the `en-IN` grouping rules, in both languages so Bangla and English
 * screens line up. Do not use for identifiers such as phone, NID or receipt
 * numbers; those must stay ungrouped.
 */

export type BnLang = 'bn' | 'en';
export type BnDateStyle = 'long' | 'short';
export type BnDateInput = Date | string | number | null | undefined;
export type BnNumberInput = number | string | null | undefined;

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';
const DATE_FORMATS: Record<BnLang, Record<BnDateStyle, string>> = {
  bn: { long: 'd MMMM y', short: 'dd/MM/y' },
  en: { long: 'd MMM y', short: 'dd/MM/y' },
};
const DEFAULT_MAX_FRACTION_DIGITS = 2;

/** ASCII digits -> Bangla digits; other characters are kept. */
export function toBanglaDigits(text: string): string {
  return text.replace(/[0-9]/g, (digit) => BANGLA_DIGITS[Number(digit)]);
}

function localize(text: string, lang: BnLang): string {
  return lang === 'bn' ? toBanglaDigits(text) : text;
}

function toNumber(value: BnNumberInput): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** `১১ অক্টোবর ২০২৬` / `11 Oct 2026` (long), `১১/১০/২০২৬` / `11/10/2026` (short); '' when not a date. */
export function formatBnDate(value: BnDateInput, lang: BnLang, style: BnDateStyle = 'long'): string {
  if (value === null || value === undefined || value === '') return '';
  try {
    // Angular's own parsing treats `YYYY-MM-DD` as a local calendar day (no UTC shift).
    const text = formatDate(value, DATE_FORMATS[lang][style], lang === 'bn' ? 'bn' : 'en-US');
    return localize(text, lang);
  } catch {
    return '';
  }
}

/** `1,23,456` / `১,২৩,৪৫৬`. Without `decimals` shows up to two fraction digits; '' when not a number. */
export function formatBnNumber(value: BnNumberInput, lang: BnLang, decimals?: number): string {
  const amount = toNumber(value);
  if (amount === null) return '';
  const fixed = decimals === undefined ? undefined : Math.max(0, Math.trunc(decimals));
  const grouped = amount.toLocaleString('en-IN', {
    minimumFractionDigits: fixed ?? 0,
    maximumFractionDigits: fixed ?? DEFAULT_MAX_FRACTION_DIGITS,
  });
  return localize(grouped, lang);
}

/**
 * `৳ ১,২০০` / `৳ 1,200`. By default decimals appear only when the amount has
 * paisa (1200.5 -> `৳ 1,200.50`); pass `decimals` to force a fixed count.
 */
export function formatTakaAmount(value: BnNumberInput, lang: BnLang, decimals?: number): string {
  const amount = toNumber(value);
  if (amount === null) return '';
  const digits = decimals ?? (Math.round(amount * 100) % 100 === 0 ? 0 : 2);
  const formatted = formatBnNumber(Math.abs(amount), lang, digits);
  return `${amount < 0 && formatted !== '' ? '-' : ''}৳ ${formatted}`;
}
