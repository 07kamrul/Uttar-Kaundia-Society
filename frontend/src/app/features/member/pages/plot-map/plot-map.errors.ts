// Maps HTTP failures from the plot-map APIs to i18n keys; server text is never shown.
import { HttpErrorResponse } from '@angular/common/http';
import { toAsciiDigits } from '../../../../core/services/digits.helper';

export const OWNER_ERROR_KEYS = {
  rateLimited: 'member.plotMap.owner.rateLimited',
  notApproved: 'member.plotMap.owner.notApproved',
  loadError: 'member.plotMap.owner.loadError',
} as const;

/** Maps owner-fetch failures to i18n keys - server text is never shown. */
export function ownerErrorKey(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return OWNER_ERROR_KEYS.loadError;
  const code = (error.error as { detail?: { code?: string } } | null)?.detail?.code ?? null;
  if (error.status === 429 || code === 'BOUNDARY_OWNER_RATE_LIMITED')
    return OWNER_ERROR_KEYS.rateLimited;
  if (error.status === 403 && code === 'BOUNDARY_NOT_APPROVED') return OWNER_ERROR_KEYS.notApproved;
  return OWNER_ERROR_KEYS.loadError;
}

export const SAVE_ERROR_CODES = [
  'INVALID_GEOMETRY',
  'SELF_INTERSECTING',
  'OUTSIDE_SOCIETY_AREA',
  'ZERO_AREA',
  'TOO_MANY_VERTICES',
  'NOT_YOUR_PROPERTY',
  'BOUNDARY_EXISTS',
] as const;

/** Maps a failed create/update to a specific i18n key (never a generic banner). */
export function saveErrorKey(error: unknown): string {
  const code =
    error instanceof HttpErrorResponse
      ? ((error.error as { detail?: { code?: string } } | null)?.detail?.code ?? null)
      : null;
  if (code && (SAVE_ERROR_CODES as readonly string[]).includes(code)) {
    return `member.plotMap.draw.errors.${code}`;
  }
  return 'member.plotMap.draw.errors.generic';
}

/** Dag numbers compare as ASCII digits without the "RS-" prefix, so "4611",
 *  "RS-4611" and Bangla digits all resolve to the same plot. */
export function normalizeDagNo(value: string): string {
  return toAsciiDigits(value).trim().toUpperCase().replace(/^RS-?/, '');
}

export function boundaryErrorKey(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const code = (error.error as { detail?: { code?: string } } | null)?.detail?.code ?? null;
    if (error.status === 429 || code === 'BOUNDARY_OWNER_RATE_LIMITED') {
      return OWNER_ERROR_KEYS.rateLimited;
    }
  }
  return saveErrorKey(error);
}
