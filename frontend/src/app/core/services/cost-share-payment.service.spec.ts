import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { CostSharePaymentService } from './cost-share-payment.service';

const BASE = `${environment.apiBaseUrl}/admin`;

const row = {
  id: 5,
  member_id: 2,
  member_name: 'করিম',
  member_display_id: 'M-2',
  share_id: 9,
  cost_title: 'মসজিদ মেরামত',
  amount_due: '1000.00',
  amount_paid: '200.00',
  remaining: '800.00',
  method: 'bkash',
  transaction_ref: 'TX1',
  sender_account: null,
  amount: '300.00',
  paid_on: '2026-10-10',
  proof_url: null,
  note: null,
  status: 'pending',
  rejection_reason: null,
  reviewed_at: null,
  created_at: '2026-10-10T10:00:00Z',
};

describe('CostSharePaymentService', () => {
  let http: HttpTestingController;
  let service: CostSharePaymentService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(CostSharePaymentService);
  });
  afterEach(() => http.verify());

  it('lists payments by status and maps numbers and names', () => {
    let result: unknown;
    service.listForAdmin('pending').subscribe((r) => (result = r));
    const req = http.expectOne((r) => r.url === `${BASE}/cost-share-payments`);
    expect(req.request.params.get('status')).toBe('pending');
    req.flush([row]);
    expect(result).toMatchObject([
      { id: 5, memberName: 'করিম', costTitle: 'মসজিদ মেরামত', amount: 300, remaining: 800, transactionRef: 'TX1', status: 'pending' },
    ]);
  });

  it('approves and rejects with a reason', () => {
    service.approve(5).subscribe();
    http.expectOne(`${BASE}/cost-share-payments/5/approve`).flush(row);
    service.reject(5, 'ভুল আইডি').subscribe();
    const req = http.expectOne(`${BASE}/cost-share-payments/5/reject`);
    expect(req.request.body).toEqual({ reason: 'ভুল আইডি' });
    req.flush(row);
  });

  it('reads the combined pending counts', () => {
    let counts: unknown;
    service.pendingCounts().subscribe((c) => (counts = c));
    http.expectOne(`${BASE}/payment-verifications/pending-count`).flush({ installment: 2, cost_share: 1, total: 3 });
    expect(counts).toEqual({ installment: 2, costShare: 1, otherFee: 0, total: 3 });
  });

  it('reads the other-fee pending count', () => {
    let counts: unknown;
    service.pendingCounts().subscribe((c) => (counts = c));
    http.expectOne(`${BASE}/payment-verifications/pending-count`).flush({ installment: 2, cost_share: 1, other_fee: 4, total: 7 });
    expect(counts).toEqual({ installment: 2, costShare: 1, otherFee: 4, total: 7 });
  });
});
