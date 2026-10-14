import { HttpErrorResponse } from '@angular/common/http';
import type { ValidationErrors } from '@angular/forms';

/** Machine codes the backend puts in `detail.code`; each has its own plain message. */
const KNOWN_DETAIL_CODES: ReadonlySet<string> = new Set([
  'PHOTO_REQUIRED',
  'PROPERTY_PROOF_REQUIRED',
  'DAG_REQUIRED',
  'ABROAD_ADDRESS_REQUIRED',
  'DAG_REQUIRED_FIELD',
  'SHARE_NOT_FOUND',
  'SHARE_ALREADY_PAID',
  'DUPLICATE_TRANSACTION_REF',
  'REFERENCE_REQUIRED',
  'AMOUNT_EXCEEDS_REMAINING',
  'FEATURE_DISABLED',
  'INVALID_BD_MOBILE',
  'PHONE_DUPLICATE',
  'PHONE_FIX_ALREADY_RESOLVED',
  'PHONE_FIX_NOT_FOUND',
  'PHONE_FIX_TARGET_NOT_FOUND',
  'LOGIN_AMBIGUOUS_IDENTIFIER',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_COMMON',
  'PASSWORD_SAME_AS_CURRENT',
]);

/** The machine code of an API error: `detail.code` (FastAPI), or a top-level `code`. Null when absent. */
export function errorCodeOf(err: unknown): string | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  const body: unknown = err.error;
  if (!body || typeof body !== 'object') return null;
  const detail = (body as { detail?: unknown }).detail;
  const nested = detail && typeof detail === 'object' ? (detail as { code?: unknown }).code : undefined;
  const code = typeof nested === 'string' ? nested : (body as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function knownCodeKey(err: HttpErrorResponse): string | null {
  const code = errorCodeOf(err);
  return code !== null && KNOWN_DETAIL_CODES.has(code) ? `errors.code.${code}` : null;
}

/**
 * Maps any thrown value to an i18n key under `errors.*`. Each message says what
 * went wrong and what to do next. The server's raw `detail` text is never
 * surfaced; it is untranslated, often technical, and can leak internals.
 */
export function toUserMessageKey(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) return 'errors.unknown';
  const codeKey = knownCodeKey(err);
  if (codeKey) return codeKey;
  switch (err.status) {
    case 0:
      return 'errors.network';
    case 400:
    case 422:
      return 'errors.validation';
    case 401:
      return 'errors.unauthorized';
    case 403:
      return 'errors.forbidden';
    case 404:
      return 'errors.notFound';
    case 409:
      return 'errors.conflict';
    case 413:
      return 'errors.fileTooLarge';
    case 429:
      return 'errors.tooManyRequests';
    default:
      return err.status >= 500 && err.status <= 599 ? 'errors.server' : 'errors.unknown';
  }
}

/** Highest-priority first: a missing value is reported before a malformed one. */
const FIELD_ERROR_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['required', 'errors.field.required'],
  ['bdMobile', 'errors.field.mobile'],
  ['nid', 'errors.field.nid'],
];

/** Maps a control's validation errors to a field-level i18n key, or null when valid. */
export function fieldErrorKey(errors: ValidationErrors | null | undefined): string | null {
  if (!errors || Object.keys(errors).length === 0) return null;
  for (const [name, key] of FIELD_ERROR_KEYS) {
    if (errors[name]) return key;
  }
  return 'errors.field.invalid';
}
