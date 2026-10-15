import type { FeeSetting } from '../../../../core/models/admin.model';
import type { AdminFeeType } from '../../../../core/services/admin.service';

/** How far ahead the wizard may schedule a new rate. Backdating stays in the advanced form. */
export const FEE_WIZARD_MAX_DAYS_AHEAD = 365;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(iso: string): Date | null {
  const match = ISO_DAY.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const roundTrips =
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d);
  return roundTrips ? date : null;
}

function formatDay(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The local calendar day as `yyyy-MM-dd`. */
export function todayIso(now: Date = new Date()): string {
  const y = String(now.getFullYear()).padStart(4, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const date = parseDay(iso);
  if (!date) throw new Error(`Not a yyyy-MM-dd date: ${iso}`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDay(date);
}

/**
 * The rate in force today: the newest row that started on or before today.
 * The server's `status` is not used because a future-dated version is already
 * status 1 there before it takes effect.
 */
export function currentRate(history: readonly FeeSetting[], today: string): FeeSetting | null {
  let best: FeeSetting | null = null;
  for (const row of history) {
    if (row.startDate > today) continue;
    if (best === null || row.startDate > best.startDate) best = row;
  }
  return best;
}

/** The earliest version that starts after today, if one is already scheduled. */
export function futureVersion(history: readonly FeeSetting[], today: string): FeeSetting | null {
  let best: FeeSetting | null = null;
  for (const row of history) {
    if (row.startDate <= today) continue;
    if (best === null || row.startDate < best.startDate) best = row;
  }
  return best;
}

export function hasFutureVersion(history: readonly FeeSetting[], today: string): boolean {
  return futureVersion(history, today) !== null;
}

export function effectiveDateBounds(today: string): { min: string; max: string } {
  return { min: today, max: addDays(today, FEE_WIZARD_MAX_DAYS_AHEAD) };
}

export function isEffectiveDateAllowed(date: string, today: string): boolean {
  if (parseDay(date) === null) return false;
  const { min, max } = effectiveDateBounds(today);
  return date >= min && date <= max;
}

export function isAmountAllowed(amount: number | null): amount is number {
  return amount !== null && Number.isFinite(amount) && amount > 0;
}

/** Fixed-amount, active fees. Tiered, head+additional and variable fees keep the advanced form. */
export function isWizardFee(fee: Pick<AdminFeeType, 'calculationType' | 'isActive'>): boolean {
  return fee.calculationType === 'fixed' && fee.isActive;
}
