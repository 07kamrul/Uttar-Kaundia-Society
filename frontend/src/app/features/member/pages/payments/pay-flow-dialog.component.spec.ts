import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { InstallmentPaymentService } from '../../../../core/services/installment-payment.service';
import { MemberPaymentsService, type PaymentSummary } from '../../../../core/services/member-payments.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { OtherFeesService } from '../../../../core/services/other-fees.service';
import { PayFlowDialogComponent } from './pay-flow-dialog.component';
import { makeHistoryItem, makeSummary } from './payments.fixtures';

function setup(opts: { summary?: PaymentSummary; preselect?: { kind?: string; fee?: string }; verifyOn?: boolean } = {}) {
  const installments = { submit: vi.fn((_p: unknown) => of({ id: 1 })) };
  const payments = { submitCostShare: vi.fn((_p: unknown) => of(makeHistoryItem({ kind: 'cost_share' }))) };
  const fees = { createPayment: vi.fn((_p: unknown) => of({ id: 5 })), uploadProof: vi.fn((_id: number, _f: File) => of({})) };
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService(),
      { provide: InstallmentPaymentService, useValue: installments },
      { provide: MemberPaymentsService, useValue: payments },
      { provide: OtherFeesService, useValue: fees },
      { provide: FeatureFlagService, useValue: { isEnabled: (k: string) => k === 'pay_verify_other_fees' && opts.verifyOn === true } },
    ],
  });
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('bn', bn);
  translate.use('bn');
  const fixture = TestBed.createComponent(PayFlowDialogComponent);
  fixture.componentRef.setInput('summary', opts.summary ?? makeSummary());
  if (opts.preselect) fixture.componentRef.setInput('preselect', opts.preselect);
  fixture.detectChanges();
  return { fixture, installments, payments, fees };
}

const q = (f: ComponentFixture<unknown>, sel: string) => f.nativeElement.querySelector(sel) as HTMLElement | null;
const text = (f: ComponentFixture<unknown>) => (f.nativeElement as HTMLElement).textContent ?? '';

function click(f: ComponentFixture<unknown>, sel: string): void {
  const el = q(f, sel);
  if (!el) throw new Error(`missing ${sel}`);
  el.click();
  f.detectChanges();
}

function type(f: ComponentFixture<unknown>, sel: string, value: string): void {
  const el = q(f, sel) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input'));
  f.detectChanges();
}

function fillMethodAndRef(f: ComponentFixture<unknown>, method: string, ref: string): void {
  click(f, `[data-testid="method-${method}"]`);
  type(f, '[data-testid="reference"]', ref);
}

async function flush(f: ComponentFixture<unknown>): Promise<void> {
  await f.whenStable();
  f.detectChanges();
}

describe('PayFlowDialogComponent step 1: what are you paying for', () => {
  it('asks the plain question and pre-ticks every due, showing the live total', () => {
    const { fixture } = setup();
    expect(text(fixture)).toContain('কিসের জন্য দিচ্ছেন?');
    expect((q(fixture, '[data-testid="due-installment-41"]') as HTMLInputElement).checked).toBe(true);
    expect((q(fixture, '[data-testid="due-cost_share-9"]') as HTMLInputElement).checked).toBe(true);
    expect(q(fixture, '[data-testid="total"]')?.textContent).toContain('৭০০');
  });

  it('recomputes the total when a due is unticked and blocks next at zero', () => {
    const { fixture } = setup();
    click(fixture, '[data-testid="due-installment-41"]');
    expect(q(fixture, '[data-testid="total"]')?.textContent).toContain('৫০০');
    click(fixture, '[data-testid="due-installment-42"]');
    click(fixture, '[data-testid="due-cost_share-9"]');
    expect((q(fixture, '[data-testid="next"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows dues already waiting for verification as "যাচাই চলছে" with no checkbox and out of the total', () => {
    const summary = makeSummary();
    summary.dues[0] = { ...summary.dues[0], pending: true };
    summary.dues[2] = { ...summary.dues[2], pending: true, amount: 0 };
    const { fixture } = setup({ summary });
    expect(q(fixture, '[data-testid="due-installment-41"]')).toBeNull();
    expect(q(fixture, '[data-testid="due-cost_share-9"]')).toBeNull();
    const pending = fixture.nativeElement.querySelectorAll('[data-testid="pending-due"]') as NodeListOf<HTMLElement>;
    expect(pending.length).toBe(2);
    expect(pending[0].textContent).toContain('যাচাই চলছে');
    expect(q(fixture, '[data-testid="total"]')?.textContent).toContain('২০০');
  });

  it('shows the installment month in words instead of the raw "কিস্তি 03/2026" title', () => {
    const summary = makeSummary();
    summary.dues[0] = { ...summary.dues[0], title: 'কিস্তি 03/2026' };
    const { fixture } = setup({ summary });
    expect(text(fixture)).toContain('মার্চ ২০২৬');
  });

  it('prices picnic by head count with a stepper and a custom type by typed amount', () => {
    const { fixture } = setup();
    click(fixture, '[data-testid="fee-picnic"]');
    expect(q(fixture, '[data-testid="total"]')?.textContent).toContain('১,০০০'); // 700 + 300
    click(fixture, '[data-testid="heads-plus"]');
    click(fixture, '[data-testid="heads-plus"]');
    expect(q(fixture, '[data-testid="total"]')?.textContent).toContain('১,৪০০'); // + 2 x 200
    click(fixture, '[data-testid="heads-minus"]');
    expect(q(fixture, '[data-testid="total"]')?.textContent).toContain('১,২০০');

    click(fixture, '[data-testid="fee-donation"]');
    type(fixture, '[data-testid="amount-donation"]', '500');
    expect(q(fixture, '[data-testid="total"]')?.textContent).toContain('১,৭০০');
  });

  it('preselects only the requested fee for ?kind=other_fee&fee=picnic', () => {
    const { fixture } = setup({ preselect: { kind: 'other_fee', fee: 'picnic' } });
    expect((q(fixture, '[data-testid="due-installment-41"]') as HTMLInputElement).checked).toBe(false);
    expect((q(fixture, '[data-testid="fee-picnic"]') as HTMLInputElement).checked).toBe(true);
    expect(q(fixture, '[data-testid="total"]')?.textContent).toContain('৩০০');
  });

  it('shows the empty state when there is nothing to pay', () => {
    const { fixture } = setup({ summary: makeSummary({ dues: [], payableFeeTypes: [] }) });
    expect(text(fixture)).toContain('এখন কোনো বকেয়া নেই');
  });
});

describe('PayFlowDialogComponent step 2: how did you pay', () => {
  it('labels the reference TrxID for mobile banking and receipt number for cash', () => {
    const { fixture } = setup();
    click(fixture, '[data-testid="next"]');
    expect(text(fixture)).toContain('কীভাবে দিলেন?');
    click(fixture, '[data-testid="method-bkash"]');
    expect(q(fixture, '[data-testid="reference-label"]')?.textContent).toContain('ট্রানজেকশন আইডি (TrxID)');
    click(fixture, '[data-testid="method-cash"]');
    expect(q(fixture, '[data-testid="reference-label"]')?.textContent).toContain('রসিদ নম্বর');
  });

  it('shows the society account number with a copy button and the abroad note', () => {
    const { fixture } = setup();
    click(fixture, '[data-testid="next"]');
    click(fixture, '[data-testid="method-bkash"]');
    expect(q(fixture, '[data-testid="account-box"]')?.textContent).toContain('০১৭১১০০০০০০');
    expect(q(fixture, '[data-testid="copy-account"]')).not.toBeNull();
    expect(q(fixture, '[data-testid="abroad-note"]')?.textContent).toContain('বিদেশে থাকলে');
  });

  it('keeps জমা দিন disabled until a method and a valid reference are given', () => {
    const { fixture } = setup();
    click(fixture, '[data-testid="next"]');
    const submit = () => q(fixture, '[data-testid="submit"]') as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    click(fixture, '[data-testid="method-bkash"]');
    expect(submit().disabled).toBe(true);
    type(fixture, '[data-testid="reference"]', 'ab');
    expect(submit().disabled).toBe(true);
    type(fixture, '[data-testid="reference"]', 'TX12345');
    expect(submit().disabled).toBe(false);
  });

  it('defaults the payment date to today', () => {
    const { fixture } = setup();
    click(fixture, '[data-testid="next"]');
    const today = new Date();
    const local = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    expect((q(fixture, '[data-testid="paid-on"]') as HTMLInputElement).value).toBe(local);
  });

  it('goes back to step 1 keeping the selection', () => {
    const { fixture } = setup();
    click(fixture, '[data-testid="due-installment-41"]');
    click(fixture, '[data-testid="next"]');
    click(fixture, '[data-testid="back"]');
    expect((q(fixture, '[data-testid="due-installment-41"]') as HTMLInputElement).checked).toBe(false);
  });
});

describe('PayFlowDialogComponent step 3: submit', () => {
  it('sends one request per kind: installments together, each cost share, each fee', async () => {
    const { fixture, installments, payments, fees } = setup();
    click(fixture, '[data-testid="fee-picnic"]');
    click(fixture, '[data-testid="heads-plus"]');
    click(fixture, '[data-testid="next"]');
    fillMethodAndRef(fixture, 'bkash', 'TX12345');
    click(fixture, '[data-testid="submit"]');
    await flush(fixture);

    expect(installments.submit).toHaveBeenCalledTimes(1);
    expect(installments.submit.mock.calls[0][0]).toMatchObject({
      installmentIds: [41, 42],
      method: 'bkash',
      transactionRef: 'TX12345',
    });
    expect(payments.submitCostShare).toHaveBeenCalledTimes(1);
    expect(payments.submitCostShare.mock.calls[0][0]).toMatchObject({ shareId: 9, amount: 300, method: 'bkash', transactionRef: 'TX12345' });
    expect(fees.createPayment).toHaveBeenCalledTimes(1);
    expect(fees.createPayment.mock.calls[0][0]).toMatchObject({
      feeType: 'picnic',
      paymentMethod: 'bkash',
      receiptNo: 'TX12345',
      additionalHeads: 1,
    });
  });

  it('emits done and closes when everything went through', async () => {
    const { fixture } = setup();
    const done = vi.fn();
    fixture.componentInstance.finished.subscribe(done);
    click(fixture, '[data-testid="next"]');
    fillMethodAndRef(fixture, 'bkash', 'TX12345');
    click(fixture, '[data-testid="submit"]');
    await flush(fixture);
    expect(done).toHaveBeenCalledWith({ succeeded: 2, total: 2 });
  });

  it('on partial failure reports "২টির মধ্যে ১টি জমা হয়েছে" and keeps only the failed item selected', async () => {
    const { fixture, installments, payments } = setup();
    payments.submitCostShare.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { detail: { code: 'DUPLICATE_TRANSACTION_REF' } } })),
    );
    const done = vi.fn();
    fixture.componentInstance.finished.subscribe(done);
    click(fixture, '[data-testid="next"]');
    fillMethodAndRef(fixture, 'bkash', 'TX12345');
    click(fixture, '[data-testid="submit"]');
    await flush(fixture);

    expect(installments.submit).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();
    expect(q(fixture, '[data-testid="results"]')?.textContent).toContain('২টির মধ্যে ১টি জমা হয়েছে');
    expect(q(fixture, '[data-testid="results"]')?.textContent).toContain('এই ট্রানজেকশন আইডি আগেই ব্যবহার করা হয়েছে');

    // Back on step 1 only the failed cost share is still ticked.
    click(fixture, '[data-testid="back"]');
    expect(q(fixture, '[data-testid="due-installment-41"]')).toBeNull();
    expect((q(fixture, '[data-testid="due-cost_share-9"]') as HTMLInputElement).checked).toBe(true);
    expect(q(fixture, '[data-testid="total"]')?.textContent).toContain('৩০০');
  });

  it('only retries the failed item on the second submit', async () => {
    const { fixture, installments, payments } = setup();
    payments.submitCostShare.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    click(fixture, '[data-testid="next"]');
    fillMethodAndRef(fixture, 'bkash', 'TX12345');
    click(fixture, '[data-testid="submit"]');
    await flush(fixture);
    click(fixture, '[data-testid="submit"]');
    await flush(fixture);
    expect(installments.submit).toHaveBeenCalledTimes(1);
    expect(payments.submitCostShare).toHaveBeenCalledTimes(2);
  });
});

describe('PayFlowDialogComponent other-fee verification (pay_verify_other_fees)', () => {
  const proofFile = new File(['x'], 'p.png', { type: 'image/png' });

  async function payPicnic(verifyOn: boolean) {
    const ctx = setup({ verifyOn });
    click(ctx.fixture, '[data-testid="fee-picnic"]');
    ctx.fixture.componentInstance.proof.set(proofFile);
    click(ctx.fixture, '[data-testid="next"]');
    fillMethodAndRef(ctx.fixture, 'bkash', 'TX12345');
    click(ctx.fixture, '[data-testid="submit"]');
    await flush(ctx.fixture);
    return ctx;
  }

  it('uploads the screenshot to the new fee payment when the flag is on', async () => {
    const { fees } = await payPicnic(true);
    expect(fees.uploadProof).toHaveBeenCalledWith(5, proofFile);
  });

  it('does not upload anything when the flag is off (unchanged behaviour)', async () => {
    const { fees } = await payPicnic(false);
    expect(fees.createPayment).toHaveBeenCalledTimes(1);
    expect(fees.uploadProof).not.toHaveBeenCalled();
  });

  it('keeps the payment recorded and does not fail the item when only the proof upload fails', async () => {
    const ctx = setup({ verifyOn: true });
    ctx.fees.uploadProof.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const done = vi.fn();
    ctx.fixture.componentInstance.finished.subscribe(done);
    click(ctx.fixture, '[data-testid="fee-picnic"]');
    ctx.fixture.componentInstance.proof.set(proofFile);
    click(ctx.fixture, '[data-testid="next"]');
    fillMethodAndRef(ctx.fixture, 'bkash', 'TX12345');
    click(ctx.fixture, '[data-testid="submit"]');
    await flush(ctx.fixture);
    expect(done).toHaveBeenCalled();
  });

  it('shows the plain message for a missing reference', async () => {
    const ctx = setup({ verifyOn: true });
    ctx.fees.createPayment.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 422, error: { detail: { code: 'REFERENCE_REQUIRED', message: 'raw' } } })),
    );
    click(ctx.fixture, '[data-testid="fee-picnic"]');
    click(ctx.fixture, '[data-testid="next"]');
    fillMethodAndRef(ctx.fixture, 'bkash', 'TX12345');
    click(ctx.fixture, '[data-testid="submit"]');
    await flush(ctx.fixture);
    expect(q(ctx.fixture, '[data-testid="results"]')?.textContent).not.toContain('raw');
    expect(q(ctx.fixture, '[data-testid="results"]')?.textContent).toContain('ট্রানজেকশন আইডি');
  });
});
