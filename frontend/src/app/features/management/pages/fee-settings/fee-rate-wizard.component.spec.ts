import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import type { FeeSetting } from '../../../../core/models/admin.model';
import { AdminService, type AdminFeeType } from '../../../../core/services/admin.service';
import { FeeRateWizardComponent } from './fee-rate-wizard.component';

const TODAY = '2026-10-15';

function fee(key: string, overrides: Partial<AdminFeeType> = {}): AdminFeeType {
  return {
    key,
    labelBn: `ফি ${key}`,
    labelEn: `Fee ${key}`,
    calculationType: 'fixed',
    unit: 'taka',
    isRecurring: false,
    isPayOnce: true,
    feeCategory: 'other',
    isActive: true,
    sortOrder: 0,
    createdAt: '2000-01-01',
    currentVersion: null,
    paymentCount: 0,
    ...overrides,
  };
}

function row(startDate: string, value: number, status = 0): FeeSetting {
  return { id: `${startDate}-${value}`, key: 'admission_fee', value, startDate, status };
}

const HISTORY: FeeSetting[] = [row('2000-01-01', 500), row('2026-01-01', 700)];

interface SetupOptions {
  feeTypes?: AdminFeeType[];
  history?: FeeSetting[];
  create?: ReturnType<typeof vi.fn>;
  historyCall?: ReturnType<typeof vi.fn>;
}

function setup(options: SetupOptions = {}) {
  const feeTypes = options.feeTypes ?? [fee('admission_fee'), fee('monthly_subscription', { calculationType: 'tiered' })];
  const getFeeSettingHistory = options.historyCall ?? vi.fn(() => of(options.history ?? HISTORY));
  const createFeeSettingVersion = options.create ?? vi.fn(() => of(row('2026-10-15', 800, 1)));
  TestBed.configureTestingModule({
    imports: [FeeRateWizardComponent],
    providers: [
      provideTranslateService(),
      { provide: AdminService, useValue: { getFeeSettingHistory, createFeeSettingVersion } },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const fixture = TestBed.createComponent(FeeRateWizardComponent);
  fixture.componentRef.setInput('feeTypes', feeTypes);
  fixture.componentRef.setInput('today', TODAY);
  const saved = vi.fn();
  fixture.componentInstance.saved.subscribe(saved);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
  const pickFee = (key: string) => {
    const select = q<HTMLSelectElement>('wiz-fee')!;
    select.value = key;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const typeAmount = (value: string) => {
    const input = q<HTMLInputElement>('wiz-amount')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const click = (id: string) => {
    q<HTMLButtonElement>(id)!.click();
    fixture.detectChanges();
  };
  return { fixture, el, q, pickFee, typeAmount, click, saved, getFeeSettingHistory, createFeeSettingVersion };
}

describe('FeeRateWizardComponent', () => {
  it('offers only active fixed-amount fees and points the rest to the advanced options', () => {
    const { el, q } = setup({
      feeTypes: [
        fee('admission_fee'),
        fee('old_fee', { isActive: false }),
        fee('monthly_subscription', { calculationType: 'tiered' }),
      ],
    });
    const values = Array.from(q<HTMLSelectElement>('wiz-fee')!.options).map((o) => o.value);
    expect(values).toEqual(['', 'admission_fee']);
    expect(q('wiz-other-hint')).not.toBeNull();
    expect(el.textContent).toContain('আরও অপশন');
  });

  it('says so plainly when there is no fee the wizard can change', () => {
    const { q } = setup({ feeTypes: [fee('monthly_subscription', { calculationType: 'tiered' })] });
    expect(q('wiz-fee')).toBeNull();
    expect(q('wiz-no-fees')).not.toBeNull();
  });

  it('loads the history of the chosen fee and shows the rate in force today, not the status-1 row', () => {
    const history = [...HISTORY, row('2026-12-01', 900, 1)];
    const { pickFee, q, getFeeSettingHistory } = setup({ history });
    pickFee('admission_fee');
    expect(getFeeSettingHistory).toHaveBeenCalledWith('admission_fee');
    const current = q('wiz-current')!.textContent ?? '';
    expect(current).toContain('৭০০');
    expect(current).not.toContain('৯০০');
  });

  it('blocks the first step while a rate is already scheduled', () => {
    const history = [...HISTORY, row('2026-12-01', 900, 1)];
    const { pickFee, typeAmount, q } = setup({ history });
    pickFee('admission_fee');
    typeAmount('800');
    expect(q('wiz-scheduled')).not.toBeNull();
    expect(q('wiz-scheduled')!.textContent).toContain('৯০০');
    expect(q<HTMLButtonElement>('wiz-next')!.disabled).toBe(true);
  });

  it('needs a positive amount that differs from the current rate', () => {
    const { pickFee, typeAmount, q } = setup();
    expect(q<HTMLButtonElement>('wiz-next')!.disabled).toBe(true);
    pickFee('admission_fee');
    typeAmount('0');
    expect(q<HTMLButtonElement>('wiz-next')!.disabled).toBe(true);
    typeAmount('700');
    expect(q('wiz-same')).not.toBeNull();
    expect(q<HTMLButtonElement>('wiz-next')!.disabled).toBe(true);
    typeAmount('800');
    expect(q('wiz-same')).toBeNull();
    expect(q<HTMLButtonElement>('wiz-next')!.disabled).toBe(false);
  });

  it('accepts Bangla digits in the amount', () => {
    const { pickFee, typeAmount, q } = setup();
    pickFee('admission_fee');
    typeAmount('৮০০');
    expect(q<HTMLButtonElement>('wiz-next')!.disabled).toBe(false);
  });

  it('defaults the effective date to today and rejects backdating and dates past a year', () => {
    const { fixture, pickFee, typeAmount, click, q } = setup();
    pickFee('admission_fee');
    typeAmount('800');
    click('wiz-next');
    expect(fixture.componentInstance.effectiveDate()).toBe(TODAY);
    expect(q<HTMLButtonElement>('wiz-next')!.disabled).toBe(false);
    fixture.componentInstance.effectiveDate.set('2026-10-14');
    fixture.detectChanges();
    expect(q<HTMLButtonElement>('wiz-next')!.disabled).toBe(true);
    fixture.componentInstance.effectiveDate.set('2027-10-16');
    fixture.detectChanges();
    expect(q<HTMLButtonElement>('wiz-next')!.disabled).toBe(true);
    fixture.componentInstance.effectiveDate.set('2027-10-15');
    fixture.detectChanges();
    expect(q<HTMLButtonElement>('wiz-next')!.disabled).toBe(false);
  });

  it('confirms old -> new with the effective date, then saves with unit and category and tells the parent', () => {
    const { fixture, pickFee, typeAmount, click, q, saved, createFeeSettingVersion } = setup({
      feeTypes: [fee('admission_fee', { feeCategory: 'installment', unit: 'taka' })],
    });
    pickFee('admission_fee');
    typeAmount('800');
    click('wiz-next');
    fixture.componentInstance.effectiveDate.set('2026-11-01');
    fixture.detectChanges();
    click('wiz-next');

    const summary = q('wiz-summary')!.textContent ?? '';
    expect(summary).toContain('পুরোনো');
    expect(summary).toContain('৭০০');
    expect(summary).toContain('নতুন');
    expect(summary).toContain('৮০০');
    expect(summary).toContain('নভেম্বর');
    expect(createFeeSettingVersion).not.toHaveBeenCalled();

    click('wiz-confirm');
    expect(createFeeSettingVersion).toHaveBeenCalledTimes(1);
    expect(createFeeSettingVersion).toHaveBeenCalledWith({
      key: 'admission_fee',
      value: 800,
      unit: 'taka',
      startDate: '2026-11-01',
      feeCategory: 'installment',
    });
    expect(saved).toHaveBeenCalledTimes(1);
    expect(q('wiz-done')).not.toBeNull();
  });

  it('shows a plain message and stays on the confirm step when saving fails, never the server text', () => {
    const create = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'SECRET internal text' } })),
    );
    const { fixture, el, pickFee, typeAmount, click, q, saved } = setup({ create });
    pickFee('admission_fee');
    typeAmount('800');
    click('wiz-next');
    click('wiz-next');
    click('wiz-confirm');
    expect(q('wiz-error')).not.toBeNull();
    expect(el.textContent).not.toContain('SECRET');
    expect(q('wiz-confirm')).not.toBeNull();
    expect(saved).not.toHaveBeenCalled();
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  it('can go back a step without losing what was typed', () => {
    const { pickFee, typeAmount, click, q } = setup();
    pickFee('admission_fee');
    typeAmount('800');
    click('wiz-next');
    click('wiz-back');
    expect(q<HTMLInputElement>('wiz-amount')!.value).toBe('800');
  });

  it('offers a retry when the history cannot be loaded', () => {
    const historyCall = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })))
      .mockReturnValue(of(HISTORY));
    const { pickFee, click, q } = setup({ historyCall });
    pickFee('admission_fee');
    expect(q('wiz-error')).not.toBeNull();
    click('wiz-retry');
    expect(historyCall).toHaveBeenCalledTimes(2);
    expect(q('wiz-error')).toBeNull();
    expect(q('wiz-current')).not.toBeNull();
  });

  it('after saving, the wizard can start over for another fee', () => {
    const { pickFee, typeAmount, click, q } = setup();
    pickFee('admission_fee');
    typeAmount('800');
    click('wiz-next');
    click('wiz-next');
    click('wiz-confirm');
    click('wiz-again');
    expect(q('wiz-done')).toBeNull();
    expect(q<HTMLSelectElement>('wiz-fee')!.value).toBe('');
  });
});
