import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { environment } from '../../../environments/environment';
import { OtherFeeVerificationService } from './other-fee-verification.service';

const BASE = `${environment.apiBaseUrl}/admin/other-fee-payments`;

describe('OtherFeeVerificationService', () => {
  let http: HttpTestingController;
  let service: OtherFeeVerificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(OtherFeeVerificationService);
  });
  afterEach(() => http.verify());

  it('lists by status and maps the rows', () => {
    let rows: unknown;
    service.listForAdmin('pending').subscribe((r) => (rows = r));
    const req = http.expectOne((r) => r.url === BASE && r.params.get('status') === 'pending');
    req.flush([
      {
        id: 7, kind: 'picnic', member_id: 2, member_name: 'করিম', member_display_id: 'M-2', fee_label: 'পিকনিক',
        amount: '500.00', payment_method: 'bkash', receipt_no: 'TX1234', payment_date: '2026-10-10',
        proof_url: null, status: 'pending', rejection_reason: null,
      },
    ]);
    expect(rows).toMatchObject([
      { id: 7, kind: 'picnic', memberName: 'করিম', feeLabel: 'পিকনিক', amount: 500, receiptNo: 'TX1234', status: 'pending' },
    ]);
  });

  it('approves and rejects through the kind-scoped endpoints', () => {
    service.approve('fee', 3).subscribe();
    const a = http.expectOne(`${BASE}/fee/3/approve`);
    expect(a.request.method).toBe('POST');
    a.flush({});
    service.reject('picnic', 4, 'ভুল আইডি').subscribe();
    const r = http.expectOne(`${BASE}/picnic/4/reject`);
    expect(r.request.body).toEqual({ reason: 'ভুল আইডি' });
    r.flush({});
  });

  it('encodes a bulk item as other_fee with id_ref', () => {
    expect(OtherFeeVerificationService.bulkItem('picnic', 4)).toEqual({ kind: 'other_fee', id: 4, id_ref: 'picnic:4' });
    expect(OtherFeeVerificationService.bulkItem('fee', 9)).toEqual({ kind: 'other_fee', id: 9, id_ref: 'fee:9' });
  });
});
