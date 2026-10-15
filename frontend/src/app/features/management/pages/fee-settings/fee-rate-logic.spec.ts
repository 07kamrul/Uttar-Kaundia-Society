import type { FeeSetting } from '../../../../core/models/admin.model';
import {
  FEE_WIZARD_MAX_DAYS_AHEAD,
  addDays,
  currentRate,
  effectiveDateBounds,
  futureVersion,
  hasFutureVersion,
  isAmountAllowed,
  isEffectiveDateAllowed,
  isWizardFee,
  todayIso,
} from './fee-rate-logic';

function row(startDate: string, value: number, status = 0): FeeSetting {
  return { id: `${startDate}-${value}`, key: 'admission_fee', value, startDate, status };
}

const TODAY = '2026-10-15';

describe('currentRate', () => {
  it('is the newest row that started on or before today, whatever its status', () => {
    const history = [
      row('2000-01-01', 500),
      row('2026-01-01', 600),
      row('2026-10-15', 700),
      row('2026-12-01', 900, 1), // scheduled: already status 1 on the server, not in force yet
    ];
    expect(currentRate(history, TODAY)?.value).toBe(700);
  });

  it('ignores rows that start tomorrow or later', () => {
    expect(currentRate([row('2026-10-16', 900, 1)], TODAY)).toBeNull();
  });

  it('is null for an empty history', () => {
    expect(currentRate([], TODAY)).toBeNull();
  });
});

describe('future versions', () => {
  it('detects a version that starts after today', () => {
    expect(hasFutureVersion([row('2000-01-01', 500), row('2026-10-16', 900, 1)], TODAY)).toBe(true);
  });

  it('a version starting today is not a future version', () => {
    expect(hasFutureVersion([row('2026-10-15', 900, 1)], TODAY)).toBe(false);
  });

  it('returns the earliest scheduled version', () => {
    const found = futureVersion([row('2027-01-01', 1000), row('2026-11-01', 900)], TODAY);
    expect(found?.startDate).toBe('2026-11-01');
  });

  it('returns null when nothing is scheduled', () => {
    expect(futureVersion([row('2000-01-01', 500)], TODAY)).toBeNull();
  });
});

describe('effective date', () => {
  it('allows today up to 365 days ahead, inclusive', () => {
    expect(FEE_WIZARD_MAX_DAYS_AHEAD).toBe(365);
    expect(effectiveDateBounds(TODAY)).toEqual({ min: '2026-10-15', max: '2027-10-15' });
    expect(isEffectiveDateAllowed('2026-10-15', TODAY)).toBe(true);
    expect(isEffectiveDateAllowed('2027-10-15', TODAY)).toBe(true);
  });

  it('rejects backdating and anything past the limit', () => {
    expect(isEffectiveDateAllowed('2026-10-14', TODAY)).toBe(false);
    expect(isEffectiveDateAllowed('2027-10-16', TODAY)).toBe(false);
  });

  it('rejects empty or malformed dates', () => {
    expect(isEffectiveDateAllowed('', TODAY)).toBe(false);
    expect(isEffectiveDateAllowed('15/10/2026', TODAY)).toBe(false);
    expect(isEffectiveDateAllowed('2026-13-40', TODAY)).toBe(false);
  });

  it('addDays crosses month and year ends and leap days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('todayIso uses the local calendar day', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('amount', () => {
  it('must be a positive finite number', () => {
    expect(isAmountAllowed(100)).toBe(true);
    expect(isAmountAllowed(0.5)).toBe(true);
    expect(isAmountAllowed(0)).toBe(false);
    expect(isAmountAllowed(-5)).toBe(false);
    expect(isAmountAllowed(Number.NaN)).toBe(false);
    expect(isAmountAllowed(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isAmountAllowed(null)).toBe(false);
  });
});

describe('isWizardFee', () => {
  it('covers active fixed-amount fees only; other shapes stay in the advanced form', () => {
    expect(isWizardFee({ calculationType: 'fixed', isActive: true })).toBe(true);
    expect(isWizardFee({ calculationType: 'fixed', isActive: false })).toBe(false);
    expect(isWizardFee({ calculationType: 'tiered', isActive: true })).toBe(false);
    expect(isWizardFee({ calculationType: 'head_additional', isActive: true })).toBe(false);
    expect(isWizardFee({ calculationType: 'variable', isActive: true })).toBe(false);
  });
});
