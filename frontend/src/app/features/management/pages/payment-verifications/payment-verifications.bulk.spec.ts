import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { ConfigListService } from '../../../../core/services/config-list.service';
import { OtherFeeVerificationService } from '../../../../core/services/other-fee-verification.service';
import {
  CostSharePaymentService,
  type AdminCostSharePayment,
  type BulkApproveResult,
} from '../../../../core/services/cost-share-payment.service';
import { FeatureFlagService, type FeatureFlagKey } from '../../../../core/services/feature-flag.service';
import { InstallmentPaymentService, type AdminInstallmentPayment } from '../../../../core/services/installment-payment.service';
import { PaymentVerificationsComponent } from './payment-verifications.component';

const inst = (id: number, amount: number, ref: string) =>
  ({
    id,
    memberId: id,
    memberName: `সদস্য ${id}`,
    memberDisplayId: `M-${id}`,
    method: 'bkash',
    transactionRef: ref,
    senderAccount: null,
    amount,
    paidOn: '2026-10-01',
    proofUrl: null,
    note: null,
    status: 'pending',
    rejectionReason: null,
    reviewedAt: null,
    createdAt: '2026-10-01T00:00:00Z',
    installments: [{ id: 40 + id, year: 2026, month: 1, amount }],
  }) as AdminInstallmentPayment;

const share = {
  id: 5,
  memberId: 9,
  memberName: 'করিম',
  memberDisplayId: 'M-9',
  shareId: 9,
  costTitle: 'মসজিদ মেরামত',
  amountDue: 1000,
  amountPaid: 0,
  remaining: 1000,
  method: 'nagad',
  transactionRef: 'SHARE-REF',
  senderAccount: null,
  amount: 300,
  paidOn: '2026-10-10',
  proofUrl: null,
  note: null,
  status: 'pending',
  rejectionReason: null,
  reviewedAt: null,
  createdAt: '2026-10-10T00:00:00Z',
} as AdminCostSharePayment;

function setup(flags: FeatureFlagKey[], bulk = vi.fn((): ReturnType<CostSharePaymentService['bulkApprove']> => of(EMPTY_RESULT))) {
  const installments = {
    listForAdmin: vi.fn((s?: string) => of([inst(1, 400, 'REF-1'), inst(2, 600, 'REF-2')].map((r) => ({ ...r, status: (s ?? 'pending') as AdminInstallmentPayment['status'] })))),
    approve: vi.fn(() => of({})),
    reject: vi.fn(() => of({})),
  };
  const shares = {
    listForAdmin: vi.fn((_s?: string) => of([share])),
    approve: vi.fn(() => of({})),
    reject: vi.fn(() => of({})),
    pendingCounts: vi.fn(() => of({ installment: 2, costShare: 1, total: 3 })),
    bulkApprove: bulk,
  };
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService(),
      { provide: InstallmentPaymentService, useValue: installments },
      { provide: CostSharePaymentService, useValue: shares },
      { provide: OtherFeeVerificationService, useValue: { listForAdmin: () => of([]), approve: () => of({}), reject: () => of({}) } },
      { provide: FeatureFlagService, useValue: { isEnabled: (k: FeatureFlagKey) => flags.includes(k) } },
      { provide: ConfigListService, useValue: { getItems: () => of([]) } },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const f = TestBed.createComponent(PaymentVerificationsComponent);
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const q = (sel: string) => el.querySelector(sel) as HTMLElement | null;
  const click = (sel: string) => {
    (q(sel) as HTMLElement).click();
    f.detectChanges();
  };
  return { f, el, q, click, installments, shares, bulk };
}

const EMPTY_RESULT: BulkApproveResult = { batchId: 'b', approvedCount: 0, approvedTotal: 0, approved: [], failed: [] };

describe('PaymentVerificationsComponent bulk approve', () => {
  it('shows no checkboxes and no bar while admin_bulk_verify is off', () => {
    const { q } = setup([]);
    expect(q('[data-testid^="select-"]')).toBeNull();
    expect(q('[data-testid="bulk-bar"]')).toBeNull();
  });

  it('shows a checkbox per pending row and no bar until something is ticked', () => {
    const { q } = setup(['admin_bulk_verify']);
    expect(q('[data-testid="select-installment-1"]')).not.toBeNull();
    expect(q('[data-testid="select-installment-2"]')).not.toBeNull();
    expect(q('[data-testid="bulk-bar"]')).toBeNull();
  });

  it('has no checkboxes on the approved tab', () => {
    const { q, f, el } = setup(['admin_bulk_verify']);
    const approvedTab = [...el.querySelectorAll('button[role="tab"]')].find((b) => b.textContent?.includes('যাচাইকৃত')) as HTMLElement;
    approvedTab.click();
    f.detectChanges();
    expect(q('[data-testid^="select-installment"]')).toBeNull();
  });

  it('shows the count and total of the selection in a bar', () => {
    const { q, click } = setup(['admin_bulk_verify']);
    click('[data-testid="select-installment-1"]');
    click('[data-testid="select-installment-2"]');
    const bar = q('[data-testid="bulk-bar"]') as HTMLElement;
    expect(bar.textContent).toContain('২টি নির্বাচিত');
    expect(bar.textContent).toContain('১,০০০');
  });

  it('asks before approving, with the count and total, and sends the stale-guard figures', () => {
    const { q, click, bulk, f } = setup(['admin_bulk_verify']);
    click('[data-testid="select-installment-1"]');
    click('[data-testid="select-installment-2"]');
    click('[data-testid="bulk-approve"]');
    expect(bulk).not.toHaveBeenCalled();
    expect(q('.modal-message')?.textContent).toContain('২টি পেমেন্ট');
    expect(q('.modal-message')?.textContent).toContain('১,০০০');
    expect(q('.modal-message')?.textContent).toContain('অনুমোদন করবেন?');
    (q('.modal-actions .btn-primary') as HTMLButtonElement).click();
    f.detectChanges();
    expect(bulk).toHaveBeenCalledWith(
      [
        { kind: 'installment', id: 1 },
        { kind: 'installment', id: 2 },
      ],
      2,
      '1000.00',
    );
  });

  it('can mix kinds across the two tabs', () => {
    const { q, click, bulk, f } = setup(['admin_bulk_verify']);
    click('[data-testid="select-installment-1"]');
    click('[data-testid="kind-cost_share"]');
    click('[data-testid="select-cost_share-5"]');
    expect((q('[data-testid="bulk-bar"]') as HTMLElement).textContent).toContain('২টি নির্বাচিত');
    click('[data-testid="bulk-approve"]');
    (q('.modal-actions .btn-primary') as HTMLButtonElement).click();
    f.detectChanges();
    expect(bulk).toHaveBeenCalledWith(
      [
        { kind: 'installment', id: 1 },
        { kind: 'cost_share', id: 5 },
      ],
      2,
      '700.00',
    );
  });

  it('reports a partial result with the reason and keeps the failed row selected', () => {
    const bulk = vi.fn(() =>
      of({
        batchId: 'b1',
        approvedCount: 1,
        approvedTotal: 400,
        approved: [{ kind: 'installment' as const, id: 1, amount: 400 }],
        failed: [{ kind: 'installment' as const, id: 2, code: 'NO_LONGER_DUE' }],
      }),
    );
    const { q, click, f, el } = setup(['admin_bulk_verify'], bulk);
    click('[data-testid="select-installment-1"]');
    click('[data-testid="select-installment-2"]');
    click('[data-testid="bulk-approve"]');
    (q('.modal-actions .btn-primary') as HTMLButtonElement).click();
    f.detectChanges();
    const result = q('[data-testid="bulk-result"]') as HTMLElement;
    expect(result.textContent).toContain('১টি অনুমোদিত, ১টি হয়নি');
    expect(result.textContent).toContain(bn.adminConsole.bulk.fail.NO_LONGER_DUE);
    expect(el.querySelector('[data-testid="select-installment-1"]')).toBeNull();
    expect((q('[data-testid="select-installment-2"]') as HTMLInputElement).checked).toBe(true);
    expect((q('[data-testid="bulk-bar"]') as HTMLElement).textContent).toContain('১টি নির্বাচিত');
  });

  it('refreshes the list and says it changed on a stale-selection 409', () => {
    const bulk = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 409, error: { detail: { code: 'BULK_SELECTION_STALE' } } })),
    );
    const { q, click, f, installments } = setup(['admin_bulk_verify'], bulk);
    click('[data-testid="select-installment-1"]');
    click('[data-testid="bulk-approve"]');
    (q('.modal-actions .btn-primary') as HTMLButtonElement).click();
    f.detectChanges();
    expect(installments.listForAdmin).toHaveBeenCalledTimes(2);
    expect(q('[data-testid="bulk-stale"]')?.textContent).toContain('তালিকা বদলে গেছে, আবার দেখুন');
    expect(q('[data-testid="bulk-bar"]')).toBeNull();
  });
});

describe('PaymentVerificationsComponent reject reasons', () => {
  it('uses the reason picker (chips fill the textarea) with admin_console on', () => {
    const { q, click, f } = setup(['admin_console']);
    click('[data-testid="reject"]');
    expect(q('[data-testid="reason-chip"]')).not.toBeNull();
    (q('[data-testid="reason-chip"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect((q('#rejectReason') as HTMLTextAreaElement).value.length).toBeGreaterThan(2);
    expect((q('[data-testid="confirm-reject"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the plain textarea with every new flag off', () => {
    const { q, click } = setup([]);
    click('[data-testid="reject"]');
    expect(q('[data-testid="reason-chip"]')).toBeNull();
    expect(q('#rejectReason')).not.toBeNull();
  });
});
