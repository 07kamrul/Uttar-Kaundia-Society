import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../public/i18n/bn.json';
import type { PaymentAccount } from '../../core/models/registration.model';
import { PaymentMethodPickerComponent } from './payment-method-picker.component';
import {
  accountsForMethod,
  availableAccountMethods,
  availableMfsMethods,
  hasBankAccount,
  isMfsMethod,
  referenceLabelKey,
  topLevelMethods,
} from './payment-methods';

const bkash: PaymentAccount = {
  id: 7,
  type: 'mfs',
  method: 'bkash',
  displayOrder: 1,
  label: 'বিকাশ ০১৭১১০০০০০০',
  bankName: null,
  branchName: null,
  accountName: null,
  accountNumber: null,
  routingNumber: null,
  provider: 'bkash',
  mfsNumber: '01711000000',
  accountKind: 'personal',
  accountHolder: null,
  instructions: null,
  qrImageUrl: null,
};

const bank: PaymentAccount = {
  id: 9,
  type: 'bank',
  method: 'bank',
  displayOrder: 2,
  label: 'ব্যাংক ৯৯৮৮',
  bankName: null,
  branchName: null,
  accountName: null,
  accountNumber: '9988776655',
  routingNumber: '060276537',
  provider: null,
  mfsNumber: null,
  accountKind: null,
  accountHolder: null,
  instructions: null,
  qrImageUrl: null,
};

const nagad: PaymentAccount = {
  id: 11,
  type: 'mfs',
  method: 'nagad',
  displayOrder: 3,
  label: 'নগদ ০১৮২২০০০০০০',
  bankName: null,
  branchName: null,
  accountName: null,
  accountNumber: null,
  routingNumber: null,
  provider: 'nagad',
  mfsNumber: '01822000000',
  accountKind: 'agent',
  accountHolder: null,
  instructions: null,
  qrImageUrl: null,
};

const accounts: PaymentAccount[] = [bkash, bank];

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
    expect(accountsForMethod('bKash', accounts)).toEqual([bkash]);
    expect(accountsForMethod('bank', accounts)).toEqual([bank]);
    expect(accountsForMethod('nagad', accounts)).toEqual([]);
  });

  it('is a pure filter — no built-in fallback when the server has no account', () => {
    expect(accountsForMethod('nagad', [])).toEqual([]);
    expect(accountsForMethod('bank', [])).toEqual([]);
    expect(accountsForMethod('cash', [])).toEqual([]);
  });

  it('lists the method keys that actually have an account, in server order', () => {
    expect(availableAccountMethods(accounts)).toEqual(['bkash', 'bank']);
    expect(availableAccountMethods([])).toEqual([]);
    expect(availableAccountMethods([bank, bank])).toEqual(['bank']);
  });

  it('classifies methods into cash / bank / mfs groups', () => {
    expect(isMfsMethod('bkash')).toBe(true);
    expect(isMfsMethod('nagad')).toBe(true);
    expect(isMfsMethod('rocket')).toBe(true);
    expect(isMfsMethod('cash')).toBe(false);
    expect(isMfsMethod('bank')).toBe(false);
    expect(hasBankAccount(accounts)).toBe(true);
    expect(hasBankAccount([bkash])).toBe(false);
    expect(topLevelMethods(accounts)).toEqual(['cash', 'bank', 'mfs']);
    expect(topLevelMethods([bkash])).toEqual(['cash', 'mfs']);
    expect(topLevelMethods([bank])).toEqual(['cash', 'bank']);
    expect(topLevelMethods([])).toEqual(['cash']);
    expect(availableMfsMethods(accounts)).toEqual(['bkash']);
    expect(availableMfsMethods([bank])).toEqual([]);
  });
});

describe('PaymentMethodPickerComponent', () => {
  function create(method = '', serverAccounts: readonly PaymentAccount[] = accounts): ComponentFixture<PaymentMethodPickerComponent> {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', bn);
    translate.use('bn');
    const f = TestBed.createComponent(PaymentMethodPickerComponent);
    f.componentRef.setInput('method', method);
    f.componentRef.setInput('serverAccounts', serverAccounts);
    f.detectChanges();
    return f;
  }

  it('offers cash, then bank and mfs only when the server has an account of that type', () => {
    const f = create();
    const keys = [...f.nativeElement.querySelectorAll('.method-cards [data-testid^="method-"]')].map(
      (el) => (el as HTMLElement).dataset['testid'],
    );
    expect(keys).toEqual(['method-cash', 'method-bank', 'method-mfs']);
  });

  it('with no active accounts only cash remains (no built-in fallback)', () => {
    const f = create('', []);
    const keys = [...f.nativeElement.querySelectorAll('.method-cards [data-testid^="method-"]')].map(
      (el) => (el as HTMLElement).dataset['testid'],
    );
    expect(keys).toEqual(['method-cash']);
    expect(f.nativeElement.querySelector('[data-testid="account-box"]')).toBeNull();
    expect(f.nativeElement.querySelector('[data-testid="provider-row"]')).toBeNull();
  });

  it('emits cash and bank keys directly', () => {
    const f = create();
    const emitted: string[] = [];
    f.componentInstance.methodChange.subscribe((m: string) => emitted.push(m));
    (f.nativeElement.querySelector('[data-testid="method-cash"]') as HTMLElement).click();
    (f.nativeElement.querySelector('[data-testid="method-bank"]') as HTMLElement).click();
    expect(emitted).toEqual(['cash', 'bank']);
  });

  it('single MFS provider is selected automatically when the mfs card is clicked', () => {
    const f = create();
    const emitted: string[] = [];
    f.componentInstance.methodChange.subscribe((m: string) => emitted.push(m));
    (f.nativeElement.querySelector('[data-testid="method-mfs"]') as HTMLElement).click();
    expect(emitted).toEqual(['bkash']);
  });

  it('multiple MFS providers show a sub-row; picking one emits its key', () => {
    const f = create('', [bkash, nagad, bank]);
    const emitted: string[] = [];
    f.componentInstance.methodChange.subscribe((m: string) => emitted.push(m));
    expect(f.nativeElement.querySelector('[data-testid="provider-row"]')).toBeNull();
    (f.nativeElement.querySelector('[data-testid="method-mfs"]') as HTMLElement).click();
    f.detectChanges();
    expect(emitted).toEqual([]); // nothing stored until a provider is picked
    const providerKeys = [...f.nativeElement.querySelectorAll('button[data-testid^="provider-"]')].map(
      (el) => (el as HTMLElement).dataset['testid'],
    );
    expect(providerKeys).toEqual(['provider-bkash', 'provider-nagad']);
    (f.nativeElement.querySelector('[data-testid="provider-nagad"]') as HTMLElement).click();
    expect(emitted).toEqual(['nagad']);
  });

  it('highlights the mfs card when a provider key is the selected method', () => {
    const f = create('nagad', [bkash, nagad, bank]);
    const mfsCard = f.nativeElement.querySelector('[data-testid="method-mfs"]') as HTMLElement;
    const nagadCard = f.nativeElement.querySelector('[data-testid="provider-nagad"]') as HTMLElement;
    expect(mfsCard.classList.contains('is-selected')).toBe(true);
    expect(nagadCard.classList.contains('is-selected')).toBe(true);
    expect(
      (f.nativeElement.querySelector('[data-testid="method-bank"]') as HTMLElement).classList.contains('is-selected'),
    ).toBe(false);
  });

  it('emits the chosen method key for a provider card directly', () => {
    const f = create('bkash', accounts);
    const emitted: string[] = [];
    f.componentInstance.methodChange.subscribe((m: string) => emitted.push(m));
    const bankCard = f.nativeElement.querySelector('[data-testid="method-bank"]') as HTMLElement;
    bankCard.click();
    expect(emitted).toEqual(['bank']);
  });

  it('shows the accounts of the selected method and emits their id on selection', () => {
    const f = create('bkash');
    const emitted: number[] = [];
    f.componentInstance.accountChange.subscribe((id: number) => emitted.push(id));
    const box = f.nativeElement.querySelector('[data-testid="account-box"]')!;
    expect(box.textContent).toContain('বিকাশ ০১৭১১০০০০০০');
    (box.querySelector('.account-row') as HTMLElement).click();
    expect(emitted).toEqual([7]);
  });

  it('marks the account matching selectedAccountId as selected', () => {
    const f = create('bank');
    f.componentRef.setInput('selectedAccountId', 9);
    f.detectChanges();
    const radio = f.nativeElement.querySelector('.account-row input[type=radio]') as HTMLInputElement;
    expect(radio.checked).toBe(true);
    expect(f.nativeElement.querySelector('.account-row.is-selected')).not.toBeNull();
  });

  it('summarises the bank account as number · routing', () => {
    const f = create('bank');
    expect(f.nativeElement.querySelector('[data-testid="account-box"]')!.textContent).toContain('9988776655');
    expect(f.nativeElement.querySelector('[data-testid="account-box"]')!.textContent).toContain('রাউটিং 060276537');
  });

  it('copies the account number and shows "কপি হয়েছে" without selecting the account', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      const f = create('bkash');
      const emitted: number[] = [];
      f.componentInstance.accountChange.subscribe((id: number) => emitted.push(id));
      const copy = f.nativeElement.querySelector('[data-testid="copy-account"]') as HTMLButtonElement;
      copy.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      f.detectChanges();
      expect(writeText).toHaveBeenCalledWith('01711000000');
      expect(emitted).toEqual([]); // stopPropagation: a copy is not an account choice
      expect(f.nativeElement.textContent).toContain('কপি হয়েছে');
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('shows skeletons while loading', () => {
    const f = create();
    f.componentRef.setInput('loading', true);
    f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="picker-loading"]')).not.toBeNull();
    expect(f.nativeElement.querySelector('[data-testid^="method-"]')).toBeNull();
  });

  it('shows the error box and emits retry', () => {
    const f = create();
    f.componentRef.setInput('loadError', true);
    f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="picker-error"]')).not.toBeNull();
    const retried: boolean[] = [];
    f.componentInstance.retry.subscribe(() => retried.push(true));
    (f.nativeElement.querySelector('[data-testid="picker-error"] button') as HTMLButtonElement).click();
    expect(retried).toEqual([true]);
  });
});
