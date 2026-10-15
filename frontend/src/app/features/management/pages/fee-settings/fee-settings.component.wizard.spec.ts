import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { AdminService, type AdminFeeType } from '../../../../core/services/admin.service';
import { AuthService } from '../../../../core/services/auth.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { FeeRateWizardComponent } from './fee-rate-wizard.component';
import { FeeSettingsComponent } from './fee-settings.component';

const FIXED_FEE: AdminFeeType = {
  key: 'admission_fee',
  labelBn: 'ভর্তি ফি',
  labelEn: 'Admission Fee',
  calculationType: 'fixed',
  unit: 'taka',
  isRecurring: false,
  isPayOnce: true,
  feeCategory: 'other',
  isActive: true,
  sortOrder: 0,
  createdAt: '2000-01-01',
  currentVersion: { values: { admission_fee: 500 }, unit: 'taka', startDate: '2000-01-01' },
  paymentCount: 0,
};

function setup(wizardFlag: boolean) {
  const getFeeTypes = vi.fn(() => of([FIXED_FEE]));
  TestBed.configureTestingModule({
    imports: [FeeSettingsComponent],
    providers: [
      provideTranslateService(),
      { provide: AdminService, useValue: { getFeeTypes, getFeeSettingHistory: () => of([]), createFeeSettingVersion: () => of({}) } },
      { provide: AuthService, useValue: { hasPermission: () => true } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      { provide: FeatureFlagService, useValue: { isEnabled: (key: string) => wizardFlag && key === 'fee_wizard' } },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const fixture = TestBed.createComponent(FeeSettingsComponent);
  fixture.detectChanges();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, getFeeTypes };
}

describe('FeeSettingsComponent with the fee wizard', () => {
  it('flag off: no wizard and the classic tools are shown as before', () => {
    const { el } = setup(false);
    expect(el.querySelector('app-fee-rate-wizard')).toBeNull();
    expect(el.querySelector('[data-testid="fee-advanced"]')).toBeNull();
    expect(el.querySelector('#draftKey')).not.toBeNull();
  });

  it('flag on: the wizard comes first and the classic tools move into a collapsed "more options" section', () => {
    const { el } = setup(true);
    expect(el.querySelector('app-fee-rate-wizard')).not.toBeNull();
    const advanced = el.querySelector<HTMLDetailsElement>('[data-testid="fee-advanced"]');
    expect(advanced).not.toBeNull();
    expect(advanced!.open).toBe(false);
    expect(advanced!.querySelector('#draftKey')).not.toBeNull();
    expect(advanced!.textContent).toContain('আরও অপশন');
    const wizard = el.querySelector('app-fee-rate-wizard')!;
    expect(wizard.compareDocumentPosition(advanced!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('flag on: a saved rate reloads the fee list', () => {
    const { fixture, getFeeTypes } = setup(true);
    expect(getFeeTypes).toHaveBeenCalledTimes(1);
    const wizard = fixture.debugElement.query(By.directive(FeeRateWizardComponent));
    (wizard.componentInstance as FeeRateWizardComponent).saved.emit();
    expect(getFeeTypes).toHaveBeenCalledTimes(2);
  });
});
