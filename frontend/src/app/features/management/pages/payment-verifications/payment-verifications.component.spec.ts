import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import type { AdminCostSharePayment } from '../../../../core/services/cost-share-payment.service';
import { CostSharePaymentService } from '../../../../core/services/cost-share-payment.service';
import {
  InstallmentPaymentService,
  type AdminInstallmentPayment,
} from '../../../../core/services/installment-payment.service';
import { OtherFeeVerificationService } from '../../../../core/services/other-fee-verification.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { PaymentVerificationsComponent } from './payment-verifications.component';

const installmentRow = {
  id: 1,
  memberId: 1,
  memberName: 'রহিম',
  memberDisplayId: 'M-1',
  method: 'bkash',
  transactionRef: 'INST-REF',
  paymentAccountSnapshot: 'বিকাশ পার্সোনাল ••••0000',
  senderAccount: null,
  amount: 400,
  paidOn: '2026-10-01',
  proofUrl: null,
  note: null,
  status: 'pending',
  rejectionReason: null,
  reviewedAt: null,
  createdAt: '2026-10-01T00:00:00Z',
  installments: [{ id: 41, year: 2026, month: 1, amount: 400 }],
} as AdminInstallmentPayment;

const shareRow = {
  id: 5,
  memberId: 2,
  memberName: 'করিম',
  memberDisplayId: 'M-2',
  shareId: 9,
  costTitle: 'মসজিদ মেরামত',
  amountDue: 1000,
  amountPaid: 200,
  remaining: 800,
  method: 'nagad',
  transactionRef: 'SHARE-REF',
  senderAccount: null,
  amount: 300,
  paidOn: '2026-10-10',
  proofUrl: '/uploads/p.jpg',
  note: null,
  status: 'pending',
  rejectionReason: null,
  reviewedAt: null,
  createdAt: '2026-10-10T00:00:00Z',
} as AdminCostSharePayment;

function setup() {
  const installments = {
    listForAdmin: vi.fn((_s?: string) => of([installmentRow])),
    approve: vi.fn((_id: number) => of(installmentRow)),
    reject: vi.fn((_id: number, _r: string) => of(installmentRow)),
  };
  const shares = {
    listForAdmin: vi.fn((_s?: string) => of([shareRow])),
    approve: vi.fn((_id: number) => of(shareRow)),
    reject: vi.fn((_id: number, _r: string) => of(shareRow)),
    pendingCounts: vi.fn(() => of({ installment: 1, costShare: 2, total: 3 })),
  };
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService(),
      { provide: InstallmentPaymentService, useValue: installments },
      { provide: CostSharePaymentService, useValue: shares },
      { provide: OtherFeeVerificationService, useValue: { listForAdmin: () => of([]), approve: () => of({}), reject: () => of({}) } },
      { provide: FeatureFlagService, useValue: { isEnabled: () => false } },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const f = TestBed.createComponent(PaymentVerificationsComponent);
  f.detectChanges();
  return { f, installments, shares };
}

const q = (f: { nativeElement: HTMLElement }, sel: string) => f.nativeElement.querySelector(sel) as HTMLElement | null;
const text = (f: { nativeElement: HTMLElement }) => f.nativeElement.textContent ?? '';

describe('PaymentVerificationsComponent kind tab', () => {
  it('opens on কিস্তি and shows the existing installment queue', () => {
    const { f, installments, shares } = setup();
    expect(installments.listForAdmin).toHaveBeenCalledWith('pending');
    expect(shares.listForAdmin).not.toHaveBeenCalled();
    expect(text(f)).toContain('INST-REF');
    expect(text(f)).toContain('বিকাশ পার্সোনাল ••••0000');
    expect(q(f, '[data-testid="kind-installment"]')?.getAttribute('aria-selected')).toBe('true');
  });

  it('shows "কিস্তি | খরচের ভাগ" tabs with the pending count of each kind', () => {
    const { f } = setup();
    expect(q(f, '[data-testid="kind-installment"]')?.textContent).toContain('কিস্তি');
    expect(q(f, '[data-testid="kind-installment"]')?.textContent).toContain('১');
    expect(q(f, '[data-testid="kind-cost_share"]')?.textContent).toContain('খরচের ভাগ');
    expect(q(f, '[data-testid="kind-cost_share"]')?.textContent).toContain('২');
  });

  it('switches to the cost-share queue with cost title, amount, remaining and the proof link', () => {
    const { f, shares } = setup();
    (q(f, '[data-testid="kind-cost_share"]') as HTMLElement).click();
    f.detectChanges();
    expect(shares.listForAdmin).toHaveBeenCalledWith('pending');
    expect(text(f)).toContain('মসজিদ মেরামত');
    expect(text(f)).toContain('SHARE-REF');
    expect(text(f)).toContain('৮০০');
    expect(text(f)).not.toContain('INST-REF');
    expect(q(f, 'a[href="/uploads/p.jpg"]')).not.toBeNull();
  });

  it('approves a cost-share payment through the cost-share endpoint and removes it from the queue', () => {
    const { f, shares, installments } = setup();
    (q(f, '[data-testid="kind-cost_share"]') as HTMLElement).click();
    f.detectChanges();
    (q(f, '[data-testid="approve"]') as HTMLElement).click();
    f.detectChanges();
    expect(shares.approve).toHaveBeenCalledWith(5);
    expect(installments.approve).not.toHaveBeenCalled();
    expect(text(f)).not.toContain('SHARE-REF');
  });

  it('rejects a cost-share payment with a reason', () => {
    const { f, shares } = setup();
    (q(f, '[data-testid="kind-cost_share"]') as HTMLElement).click();
    f.detectChanges();
    (q(f, '[data-testid="reject"]') as HTMLElement).click();
    f.detectChanges();
    const reason = q(f, '#rejectReason') as HTMLTextAreaElement;
    reason.value = 'ভুল আইডি';
    reason.dispatchEvent(new Event('input'));
    f.detectChanges();
    (q(f, '[data-testid="confirm-reject"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(shares.reject).toHaveBeenCalledWith(5, 'ভুল আইডি');
  });

  it('keeps approving installments through the installment endpoint', () => {
    const { f, installments } = setup();
    (q(f, '[data-testid="approve"]') as HTMLElement).click();
    f.detectChanges();
    expect(installments.approve).toHaveBeenCalledWith(1);
  });
});
