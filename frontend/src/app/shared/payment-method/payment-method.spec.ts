import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import bn from '../../../../public/i18n/bn.json';
import type { PaymentAccount } from '../../core/models/registration.model';
import { PaymentMethodPickerComponent } from './payment-method-picker.component';
import { accountsForMethod, referenceLabelKey } from './payment-methods';

const accounts: PaymentAccount[] = [
  { method: 'bKash', label: 'বিকাশ ০১৭১১০০০০০০', number: '01711000000', accountName: null },
  { method: 'bank', label: 'ব্যাংক ৯৯৮৮', number: '9988', accountName: null },
];

describe('payment-methods helpers', () => {
  it('labels the reference TrxID for mobile banking and receipt number otherwise', () => {
    expect(referenceLabelKey('bkash')).toBe('registration.simplified.payment.refTrx');
    expect(referenceLabelKey('nagad')).toBe('registration.simplified.payment.refTrx');
    expect(referenceLabelKey('rocket')).toBe('registration.simplified.payment.refTrx');
    expect(referenceLabelKey('cash')).toBe('registration.simplified.payment.refReceipt');
    expect(referenceLabelKey('bank')).toBe('registration.simplified.payment.refReceipt');
    expect(referenceLabelKey('')).toBe('registration.simplified.payment.refReceipt');
  });

  it('matches server accounts to a method regardless of letter case', () => {
    expect(accountsForMethod('bkash', accounts).map((a) => a.number)).toEqual(['01711000000']);
  });

  it('falls back to the built-in details for mobile banking and bank when the server has none', () => {
    expect(accountsForMethod('nagad', [])[0].number).toBeTruthy();
    expect(accountsForMethod('bank', [])[0].accountName).toBeTruthy();
    expect(accountsForMethod('cash', [])).toEqual([]);
  });
});

describe('PaymentMethodPickerComponent', () => {
  function create(method = ''): ComponentFixture<PaymentMethodPickerComponent> {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', bn);
    translate.use('bn');
    const f = TestBed.createComponent(PaymentMethodPickerComponent);
    f.componentRef.setInput('method', method);
    f.componentRef.setInput('serverAccounts', accounts);
    f.detectChanges();
    return f;
  }

  it('renders six cards and emits the chosen method', () => {
    const f = create();
    const emitted: string[] = [];
    f.componentInstance.methodChange.subscribe((m: string) => emitted.push(m));
    const cards = f.nativeElement.querySelectorAll('[data-testid^="method-"]');
    expect(cards.length).toBe(6);
    (f.nativeElement.querySelector('[data-testid="method-bkash"]') as HTMLElement).click();
    expect(emitted).toEqual(['bkash']);
  });

  it('shows the account box with a copy button for the selected method only', () => {
    const f = create('bkash');
    expect(f.nativeElement.querySelector('[data-testid="account-box"]').textContent).toContain('০১৭১১০০০০০০');
    expect(f.nativeElement.querySelector('[data-testid="copy-account"]')).not.toBeNull();
    f.componentRef.setInput('method', 'cash');
    f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="account-box"]')).toBeNull();
  });
});
