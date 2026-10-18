import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import {
  InstallmentPaymentService,
  type InstallmentPayment,
  type PayableSummary,
  type PaymentAccount,
} from '../../../../core/services/installment-payment.service';
import { PayDuesDialogComponent } from './pay-dues-dialog.component';

const bkashAccount: PaymentAccount = {
  id: 11,
  type: 'mfs',
  method: 'bkash',
  displayOrder: 1,
  label: 'বিকাশ পার্সোনাল',
  bankName: null,
  branchName: null,
  accountName: null,
  accountNumber: null,
  routingNumber: null,
  provider: 'bkash',
  mfsNumber: '01700000000',
  accountKind: 'personal',
  accountHolder: null,
  instructions: null,
  qrImageUrl: null,
};

const bankAccount: PaymentAccount = {
  id: 12,
  type: 'bank',
  method: 'bank',
  displayOrder: 1,
  label: 'সোনালী ব্যাংক',
  bankName: null,
  branchName: null,
  accountName: null,
  accountNumber: '1000001',
  routingNumber: null,
  provider: null,
  mfsNumber: null,
  accountKind: null,
  accountHolder: null,
  instructions: null,
  qrImageUrl: null,
};

const summary: PayableSummary = {
  due: [
    { id: 1, year: 2026, month: 7, amount: 200 },
    { id: 2, year: 2026, month: 8, amount: 200 },
    { id: 3, year: 2026, month: 9, amount: 250 },
  ],
  pendingInstallmentIds: [3],
  totalDue: 400,
  accounts: [bkashAccount, bankAccount],
  payments: [],
};

function setup(submit = vi.fn()) {
  TestBed.configureTestingModule({
    imports: [PayDuesDialogComponent],
    providers: [provideTranslateService(), { provide: InstallmentPaymentService, useValue: { submit } }],
  });
  const fixture = TestBed.createComponent(PayDuesDialogComponent);
  fixture.componentRef.setInput('summary', summary);
  fixture.detectChanges();
  return { component: fixture.componentInstance, submit };
}

describe('PayDuesDialogComponent', () => {
  it('pre-selects every payable month and excludes pending ones', () => {
    const { component } = setup();

    expect(component.payable().map((i) => i.id)).toEqual([1, 2]);
    expect(component.selectedTotal()).toBe(400);
    expect(component.method()).toBe('bkash');
    expect(component.selectedAccountId()).toBe(11);
  });

  it('recomputes the total when months are toggled', () => {
    const { component } = setup();

    component.toggle(1);
    expect(component.selectedTotal()).toBe(200);
    component.toggleAll();
    expect(component.allSelected).toBe(true);
    component.toggleAll();
    expect(component.selectedIds().size).toBe(0);
  });

  it('blocks submit until a valid transaction id is entered', () => {
    const { component, submit } = setup();

    component.transactionRef = 'x<';
    component.submit();

    expect(submit).not.toHaveBeenCalled();
    expect(component.refTouched).toBe(true);
  });

  it('submits selected months and emits the created payment', () => {
    const created = { id: 9, status: 'pending' } as InstallmentPayment;
    const { component, submit } = setup(vi.fn(() => of(created)));
    const emitted = vi.fn();
    component.submitted.subscribe(emitted);

    component.transactionRef = 'TRX12345';
    component.submit();

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ installmentIds: [1, 2], method: 'bkash', paymentAccountId: 11, transactionRef: 'TRX12345' }),
    );
    expect(emitted).toHaveBeenCalledWith(created);
    expect(component.submitting()).toBe(false);
  });

  it('blocks submit for account-backed methods until an account is chosen; cash needs none', () => {
    const created = { id: 9, status: 'pending' } as InstallmentPayment;
    const { component, submit } = setup(vi.fn(() => of(created)));
    component.transactionRef = 'TRX12345';

    component.selectedAccountId.set(null);
    component.method.set('bkash');
    component.submit();
    expect(submit).not.toHaveBeenCalled();

    component.method.set('cash');
    component.submit();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ method: 'cash', paymentAccountId: null }));
  });

  it('choosing an account switches the method to that account', () => {
    const { component } = setup();
    component.chooseAccount(bankAccount);
    expect(component.method()).toBe('bank');
    expect(component.selectedAccountId()).toBe(12);
  });

  it('shows the server error message when submit fails', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { detail: 'This transaction ID has already been submitted.' },
    });
    const { component } = setup(vi.fn(() => throwError(() => error)));

    component.transactionRef = 'TRX12345';
    component.submit();

    expect(component.error()).toBe('This transaction ID has already been submitted.');
  });

  it('rejects proof files that are not images or PDFs', () => {
    const { component } = setup();
    const file = new File(['x'], 'a.exe', { type: 'application/octet-stream' });

    component.onProofSelected({ target: { files: [file] } } as unknown as Event);

    expect(component.proof).toBeNull();
    expect(component.proofError).not.toBe('');
  });
});
