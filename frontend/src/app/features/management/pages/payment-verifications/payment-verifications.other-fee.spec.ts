import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { CostSharePaymentService } from '../../../../core/services/cost-share-payment.service';
import { ConfigListService } from '../../../../core/services/config-list.service';
import { FeatureFlagService, type FeatureFlagKey } from '../../../../core/services/feature-flag.service';
import { InstallmentPaymentService } from '../../../../core/services/installment-payment.service';
import {
  OtherFeeVerificationService,
  type AdminOtherFeePayment,
} from '../../../../core/services/other-fee-verification.service';
import { PaymentVerificationsComponent } from './payment-verifications.component';

const fee = (id: number, kind: 'fee' | 'picnic', amount: number): AdminOtherFeePayment => ({
  id,
  kind,
  memberId: 1,
  memberName: 'সালমা',
  memberDisplayId: 'M-7',
  feeLabel: kind === 'picnic' ? 'পিকনিক ফি' : 'অনুদান',
  amount,
  method: 'bkash',
  receiptNo: `OF-REF-${id}`,
  paymentDate: '2026-10-12',
  proofUrl: id === 1 ? '/uploads/o.png' : null,
  status: 'pending',
  rejectionReason: null,
});

function setup(flags: FeatureFlagKey[]) {
  const others = {
    listForAdmin: vi.fn((_s?: string) => of([fee(1, 'fee', 100), fee(1, 'picnic', 500)])),
    approve: vi.fn((_k: string, _id: number) => of({})),
    reject: vi.fn((_k: string, _id: number, _r: string) => of({})),
  };
  const shares = {
    listForAdmin: vi.fn(() => of([])),
    approve: vi.fn(() => of({})),
    reject: vi.fn(() => of({})),
    pendingCounts: vi.fn(() => of({ installment: 1, costShare: 0, otherFee: 4, total: 5 })),
    bulkApprove: vi.fn((_i: unknown[], _c: number, _t: string) =>
      of({ batchId: 'b', approvedCount: 1, approvedTotal: 100, approved: [{ kind: 'other_fee', id: 1, id_ref: 'fee:1', amount: 100 }], failed: [] }),
    ),
  };
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService(),
      { provide: InstallmentPaymentService, useValue: { listForAdmin: () => of([]), approve: () => of({}), reject: () => of({}) } },
      { provide: CostSharePaymentService, useValue: shares },
      { provide: OtherFeeVerificationService, useValue: others },
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
  return { f, el, q, click, others, shares };
}

describe('PaymentVerificationsComponent other-fee tab', () => {
  it('has no অন্যান্য ফি tab while pay_verify_other_fees is off', () => {
    const { q, others } = setup([]);
    expect(q('[data-testid="kind-other_fee"]')).toBeNull();
    expect(others.listForAdmin).not.toHaveBeenCalled();
  });

  it('shows the tab with its pending count when the flag is on', () => {
    const { q } = setup(['pay_verify_other_fees']);
    expect(q('[data-testid="kind-other_fee"]')?.textContent).toContain('অন্যান্য ফি');
    expect(q('[data-testid="kind-other_fee"]')?.textContent).toContain('৪');
  });

  it('lists fee and picnic rows with label, reference and proof link, even when ids collide', () => {
    const { q, el, click, others } = setup(['pay_verify_other_fees']);
    click('[data-testid="kind-other_fee"]');
    expect(others.listForAdmin).toHaveBeenCalledWith('pending');
    expect(el.textContent).toContain('অনুদান');
    expect(el.textContent).toContain('পিকনিক ফি');
    expect(el.textContent).toContain('OF-REF-1');
    expect(q('a[href="/uploads/o.png"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="approve"]').length).toBe(2);
  });

  it('approves through the kind-scoped endpoint and removes only that row', () => {
    const { f, el, click, others } = setup(['pay_verify_other_fees']);
    click('[data-testid="kind-other_fee"]');
    const buttons = el.querySelectorAll<HTMLElement>('[data-testid="approve"]');
    buttons[1].click();
    f.detectChanges();
    expect(others.approve).toHaveBeenCalledWith('picnic', 1);
    expect(el.querySelectorAll('[data-testid="approve"]').length).toBe(1);
  });

  it('rejects with a reason through the reject endpoint', () => {
    const { f, q, el, click, others } = setup(['pay_verify_other_fees']);
    click('[data-testid="kind-other_fee"]');
    el.querySelectorAll<HTMLElement>('[data-testid="reject"]')[0].click();
    f.detectChanges();
    const reason = q('#rejectReason') as HTMLTextAreaElement;
    reason.value = 'ভুল আইডি';
    reason.dispatchEvent(new Event('input'));
    f.detectChanges();
    click('[data-testid="confirm-reject"]');
    expect(others.reject).toHaveBeenCalledWith('fee', 1, 'ভুল আইডি');
  });

  it('bulk-approves other-fee items encoded as kind other_fee with id_ref', () => {
    const { f, q, click, shares } = setup(['pay_verify_other_fees', 'admin_bulk_verify']);
    click('[data-testid="kind-other_fee"]');
    click('[data-testid="select-other_fee-fee-1"]');
    click('[data-testid="select-other_fee-picnic-1"]');
    click('[data-testid="bulk-approve"]');
    (q('.modal-actions .btn-primary') as HTMLButtonElement).click();
    f.detectChanges();
    expect(shares.bulkApprove).toHaveBeenCalledWith(
      [
        { kind: 'other_fee', id: 1, id_ref: 'fee:1' },
        { kind: 'other_fee', id: 1, id_ref: 'picnic:1' },
      ],
      2,
      '600.00',
    );
  });
});
