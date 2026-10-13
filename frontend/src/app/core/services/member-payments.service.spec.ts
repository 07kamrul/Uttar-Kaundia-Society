import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { environment } from '../../../environments/environment';
import { MemberPaymentsService } from './member-payments.service';

const BASE = `${environment.apiBaseUrl}/member/payments`;

describe('MemberPaymentsService', () => {
  let http: HttpTestingController;
  let service: MemberPaymentsService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(MemberPaymentsService);
  });
  afterEach(() => http.verify());

  it('maps the summary to numbers and camelCase', () => {
    let result: unknown;
    service.summary().subscribe((r) => (result = r));
    http.expectOne(`${BASE}/summary`).flush({
      currency: 'BDT',
      total_due: '1500.00',
      total_paid: '12000.00',
      pending_count: 1,
      pending_amount: '500.00',
      dues: [
        { kind: 'installment', ref_id: 41, title: 'জানুয়ারি ২০২৬', amount: '500.00', due_date: '2026-01-31', pending: false },
      ],
      payable_fee_types: [
        {
          key: 'picnic',
          label: 'পিকনিক',
          calculation: 'picnic',
          amount: null,
          unit: null,
          pay_once: true,
          already_paid: false,
          head_fee: 300,
          additional_head_fee: 200,
        },
      ],
      accounts: [{ method: 'bkash', details: '01711000000' }],
    });
    expect(result).toMatchObject({
      totalDue: 1500,
      totalPaid: 12000,
      pendingCount: 1,
      pendingAmount: 500,
      dues: [{ kind: 'installment', refId: 41, amount: 500, dueDate: '2026-01-31', pending: false }],
      payableFeeTypes: [{ key: 'picnic', headFee: 300, additionalHeadFee: 200 }],
      accounts: [{ method: 'bkash', details: '01711000000' }],
    });
  });

  it('sends only the chosen filters to the history endpoint and maps rows', () => {
    let result: unknown;
    service.history({ kind: 'cost_share', status: 'pending', page: 2 }).subscribe((r) => (result = r));
    const req = http.expectOne((r) => r.url === `${BASE}/history`);
    expect(req.request.params.get('kind')).toBe('cost_share');
    expect(req.request.params.get('status')).toBe('pending');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.has('page_size')).toBe(false);
    req.flush({
      items: [
        {
          kind: 'installment',
          id: 3,
          title: 'জুলাই',
          amount: '200.00',
          method: 'bkash',
          reference: 'TX1',
          date: '2026-07-02',
          status: 'pending',
          rejection_reason: null,
          proof_url: null,
        },
      ],
      total: 1,
      page: 2,
      page_size: 20,
    });
    expect(result).toMatchObject({
      total: 1,
      page: 2,
      pageSize: 20,
      items: [{ kind: 'installment', amount: 200, reference: 'TX1', status: 'pending' }],
    });
  });

  it('submits a cost-share payment as multipart form data', () => {
    const proof = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    service
      .submitCostShare({ shareId: 7, amount: 250, method: 'bkash', transactionRef: ' TX99 ', paidOn: '2026-10-13', proof })
      .subscribe();
    const req = http.expectOne(`${BASE}/cost-shares`);
    const body = req.request.body as FormData;
    expect(body.get('share_id')).toBe('7');
    expect(body.get('amount')).toBe('250');
    expect(body.get('transaction_ref')).toBe('TX99');
    expect(body.get('proof')).toBeInstanceOf(File);
    expect(body.has('sender_account')).toBe(false);
    req.flush({
      kind: 'cost_share',
      id: 1,
      title: 'x',
      amount: '250.00',
      method: 'bkash',
      reference: 'TX99',
      date: '2026-10-13',
      status: 'pending',
      rejection_reason: null,
      proof_url: null,
    });
  });
});
