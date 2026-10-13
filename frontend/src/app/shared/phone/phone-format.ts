import { parsePhone } from '../phone-input/phone-number';
import { BnLang, toBanglaDigits } from '../pipes/bn-format';

/** A member phone that can be dialled, in every shape the UI needs. */
export interface PhoneDescription {
  /** "+8801712345678" - what is stored and what gets copied. */
  e164: string;
  /** "+880 1712 345678" - for people to read. */
  international: string;
  /** "tel:+8801712345678"; null for possible-but-unrecognised numbers. */
  telHref: string | null;
  /** "https://wa.me/8801712345678"; null for possible-but-unrecognised numbers. */
  whatsAppHref: string | null;
}

/**
 * Reads a stored value (E.164, or a legacy national "01…" number read as
 * Bangladeshi) into display and link forms. Null when it is empty or cannot
 * be a phone number, so callers fall back to plain text with no links.
 */
export function describePhone(value: string | null | undefined): PhoneDescription | null {
  const parsed = parsePhone(value);
  if (!parsed || !parsed.isPossible()) return null;
  // Only recognised numbers get links: a typo must not dial a stranger.
  const dialable = parsed.isValid();
  return {
    e164: parsed.number,
    international: parsed.formatInternational(),
    telHref: dialable ? `tel:${parsed.number}` : null,
    whatsAppHref: dialable ? `https://wa.me/${parsed.number.slice(1)}` : null,
  };
}

/**
 * Text-only phone display ("+880 1712 345678", Bangla digits in bn mode).
 * Values that are not phone numbers come back as typed so nothing is hidden;
 * empty values give ''.
 */
export function formatPhone(value: string | null | undefined, lang: BnLang): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  const described = describePhone(raw);
  if (!described) return raw;
  return lang === 'bn' ? toBanglaDigits(described.international) : described.international;
}
