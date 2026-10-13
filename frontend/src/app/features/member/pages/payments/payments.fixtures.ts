import type { PaymentHistoryItem, PaymentSummary } from '../../../../core/services/member-payments.service';
import type { OtherFeeType } from '../../../../core/services/other-fees.service';

/** Plain test data for the payments specs (no test-framework imports so the app build can ignore it). */
export const PICNIC: OtherFeeType = {
  key: 'picnic',
  label: 'পিকনিক ফি',
  calculation: 'picnic',
  amount: null,
  unit: null,
  payOnce: true,
  alreadyPaid: false,
  headFee: 300,
  additionalHeadFee: 200,
};

export const DEVELOPMENT_FEE: OtherFeeType = {
  key: 'donation',
  label: 'অনুদান',
  calculation: 'variable',
  amount: null,
  unit: null,
  payOnce: false,
  alreadyPaid: null,
  headFee: null,
  additionalHeadFee: null,
};

export function makeSummary(overrides: Partial<PaymentSummary> = {}): PaymentSummary {
  return {
    currency: 'BDT',
    totalDue: 700,
    totalPaid: 12000,
    pendingCount: 0,
    pendingAmount: 0,
    dues: [
      { kind: 'installment', refId: 41, title: 'জানুয়ারি ২০২৬', amount: 200, dueDate: '2026-01-31', pending: false },
      { kind: 'installment', refId: 42, title: 'ফেব্রুয়ারি ২০২৬', amount: 200, dueDate: '2026-02-28', pending: false },
      { kind: 'cost_share', refId: 9, title: 'মসজিদ মেরামত', amount: 300, dueDate: null, pending: false },
    ],
    payableFeeTypes: [PICNIC, DEVELOPMENT_FEE],
    accounts: [
      { method: 'bkash', details: 'বিকাশ পার্সোনাল ০১৭১১০০০০০০' },
      { method: 'bank', details: 'সোনালী ব্যাংক ৯৯৮৮' },
    ],
    ...overrides,
  };
}

export function makeHistoryItem(overrides: Partial<PaymentHistoryItem> = {}): PaymentHistoryItem {
  return {
    kind: 'installment',
    id: 1,
    title: 'জানুয়ারি ২০২৬',
    amount: 200,
    method: 'bkash',
    reference: 'TX12345',
    date: '2026-10-13',
    status: 'pending',
    rejectionReason: null,
    proofUrl: null,
    ...overrides,
  };
}
