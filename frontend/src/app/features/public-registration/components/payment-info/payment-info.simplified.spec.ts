import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import {
  ORG_BANK_INFO,
  ORG_MFS_INFO,
  type RegistrationConfig,
} from '../../../../core/models/registration.model';
import { RegistrationService } from '../../../../core/services/registration.service';
import { NO_UI_FLAGS, type RegistrationUiFlags } from '../../registration-ui-flags';
import { PaymentInfoComponent } from './payment-info.component';

const config: RegistrationConfig = {
  consentVersion: '2026-10',
  paymentAccounts: [
    { method: 'bkash', label: 'বিকাশ পার্সোনাল ০১৭১১০০০০০০ উত্তর কাউন্দিয়া সমিতি', number: '01711000000', accountName: null },
    { method: 'bank', label: 'ব্যাংক হিসাব ৯৯৮৮৭৭৬৬৫৫', number: '9988776655', accountName: null },
    { method: 'other', label: 'অফিসে এসে জানান', number: null, accountName: null },
  ],
};

describe('PaymentInfoComponent (simplified)', () => {
  let form: FormGroup;

  function create(
    ui: Partial<RegistrationUiFlags> = { simplified: true },
    cfg: RegistrationConfig | null = config,
  ): ComponentFixture<PaymentInfoComponent> {
    const fb = new FormBuilder();
    form = fb.group({
      admissionFee: [500],
      subscription: [60],
      receiptNo: [''],
      paymentMethod: [''],
      currentAddressAbroad: [false],
      receiptFileName: [''],
      receiptFileDataUrl: [''],
      properties: fb.array([fb.group({ myShareQuantity: ['1'] })]),
    });
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [
        provideTranslateService(),
        { provide: RegistrationService, useValue: { getSubscriptionQuote: () => of({ base: 60, extraUnits: 0, extraRate: 0, extraAmount: 0, total: 60, unit: 'x', rateVersionEffectiveFrom: null }) } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', bn);
    translate.use('bn');
    const fixture = TestBed.createComponent(PaymentInfoComponent);
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('ui', { ...NO_UI_FLAGS, ...ui });
    fixture.componentRef.setInput('config', cfg);
    fixture.detectChanges();
    return fixture;
  }

  const q = (f: ComponentFixture<unknown>, sel: string) => f.nativeElement.querySelector(sel) as HTMLElement | null;
  const text = (f: ComponentFixture<unknown>) => (f.nativeElement as HTMLElement).textContent ?? '';

  function choose(f: ComponentFixture<PaymentInfoComponent>, key: string): void {
    (q(f, `[data-testid="method-${key}"]`) as HTMLButtonElement).click();
    f.detectChanges();
  }

  it('shows the fee read-only through the taka pipe, with no editable number box', () => {
    const f = create();
    expect(text(f)).toContain('৳ ৫০০');
    expect(text(f)).toContain('৳ ৬০');
    expect(q(f, 'input[type=number]')).toBeNull();
  });

  it('offers six large method cards with plain names', () => {
    const f = create();
    const cards = f.nativeElement.querySelectorAll('[data-testid^="method-"]') as NodeListOf<HTMLElement>;
    expect([...cards].map((c) => c.textContent?.replace(/[^ঀ-৿]/g, ''))).toEqual([
      'নগদটাকা',
      'বিকাশ',
      'নগদ',
      'রকেট',
      'ব্যাংক',
      'অন্যান্য',
    ]);
    cards.forEach((c) => expect(c.classList.contains('tap-48')).toBe(true));
  });

  it.each(['cash', 'bkash', 'nagad', 'rocket', 'bank', 'other'])('card %s stores the canonical key', (key) => {
    const f = create();
    choose(f, key);
    expect(form.get('paymentMethod')!.value).toBe(key);
    expect(q(f, `[data-testid="method-${key}"]`)!.getAttribute('aria-checked')).toBe('true');
  });

  it.each([
    ['bkash', 'ট্রানজেকশন আইডি (TrxID)'],
    ['nagad', 'ট্রানজেকশন আইডি (TrxID)'],
    ['rocket', 'ট্রানজেকশন আইডি (TrxID)'],
    ['cash', 'রসিদ নম্বর'],
    ['bank', 'রসিদ নম্বর'],
    ['other', 'রসিদ নম্বর'],
  ])('labels the reference for %s as "%s"', (key, label) => {
    const f = create();
    choose(f, key);
    expect(q(f, 'label[for=receiptNo]')!.textContent).toContain(label);
  });

  it('keeps the reference in the receiptNo control (no API change)', () => {
    const f = create();
    choose(f, 'bkash');
    const input = q(f, '#receiptNo') as HTMLInputElement;
    input.value = 'ABC123';
    input.dispatchEvent(new Event('input'));
    expect(form.get('receiptNo')!.value).toBe('ABC123');
  });

  it('shows the society account from the config with a "কপি" button that copies the number', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      const f = create();
      choose(f, 'bkash');
      expect(text(f)).toContain('বিকাশ পার্সোনাল ০১৭১১০০০০০০');
      expect(text(f)).toContain('উত্তর কাউন্দিয়া সমিতি');
      const copy = q(f, '[data-testid="copy-account"]') as HTMLButtonElement;
      expect(copy.textContent).toContain('কপি');
      expect(copy.classList.contains('tap-48')).toBe(true);
      copy.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      f.detectChanges();
      expect(writeText).toHaveBeenCalledWith('01711000000');
      expect(text(f)).toContain('কপি হয়েছে');
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('falls back to the built-in accounts when the config is unavailable', () => {
    const f = create({ simplified: true }, null);
    choose(f, 'bkash');
    expect(text(f)).toContain(ORG_MFS_INFO.number);
    choose(f, 'bank');
    expect(text(f)).toContain(ORG_BANK_INFO.accountNumber);
  });

  it('shows no account box for cash', () => {
    const f = create();
    choose(f, 'cash');
    expect(q(f, '[data-testid="account-box"]')).toBeNull();
  });

  it('shows the details but no copy button when the account has no number', () => {
    const f = create();
    choose(f, 'other');
    expect(text(f)).toContain('অফিসে এসে জানান');
    expect(q(f, '[data-testid="copy-account"]')).toBeNull();
  });

  it('asks for "পেমেন্টের স্ক্রিনশট দিন" and hides the abroad note by default', () => {
    const f = create();
    expect(text(f)).toContain('পেমেন্টের স্ক্রিনশট দিন');
    expect(text(f)).not.toContain('বিদেশে থাকলে বাংলাদেশে');
  });

  it('shows the abroad note only once "বিদেশে থাকি" is ticked', () => {
    const f = create({ simplified: true, abroadAddress: true });
    form.get('currentAddressAbroad')!.setValue(true);
    f.componentRef.setInput('config', null); // marks the OnPush view dirty
    f.detectChanges();
    expect(text(f)).toContain(
      'বিদেশে থাকলে বাংলাদেশে থাকা কোনো আত্মীয় আপনার হয়ে টাকা দিতে পারেন। ট্রানজেকশন আইডি বা রসিদ নম্বর আর স্ক্রিনশট দিন।',
    );
  });

  it('flag off: keeps the legacy checkboxes, number inputs and bank constants', () => {
    const f = create({}, null);
    expect(q(f, '#admissionFee')).not.toBeNull();
    expect(q(f, '[data-testid^="method-"]')).toBeNull();
    expect(f.nativeElement.querySelectorAll('input[type=checkbox]').length).toBe(4);
  });
});
