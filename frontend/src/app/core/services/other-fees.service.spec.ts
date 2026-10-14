import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { environment } from '../../../environments/environment';
import { OtherFeesService } from './other-fees.service';

const BASE = `${environment.apiBaseUrl}/member/other-fees`;

describe('OtherFeesService verification fields', () => {
  let http: HttpTestingController;
  let service: OtherFeesService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(OtherFeesService);
  });
  afterEach(() => http.verify());

  it('maps status, rejection reason and proof url when present', () => {
    let status: unknown;
    service.createPayment({ feeType: 'picnic', paymentDate: '2026-10-10' }).subscribe((p) => (status = p));
    http.expectOne(`${BASE}/payments`).flush({
      id: 5, source: 'picnic', fee_type: 'picnic', amount: 300, payment_date: '2026-10-10', additional_heads: 0,
      receipt_no: null, payment_method: null, note: null, created_at: 'x', status: 'rejected', rejection_reason: 'ভুল',
      proof_url: null,
    });
    expect(status).toMatchObject({ id: 5, status: 'rejected', rejectionReason: 'ভুল' });
  });

  it('defaults to approved when the server sends no status', () => {
    let status: unknown;
    service.createPayment({ feeType: 'x', paymentDate: '2026-10-10' }).subscribe((p) => (status = p));
    http.expectOne(`${BASE}/payments`).flush({
      id: 1, source: 'fee', fee_type: 'x', amount: 1, payment_date: 'd', additional_heads: null, receipt_no: null,
      payment_method: null, note: null, created_at: 'x',
    });
    expect(status).toMatchObject({ status: 'approved' });
  });

  it('uploads the proof as multipart to the payment proof endpoint', () => {
    const file = new File(['x'], 'p.png', { type: 'image/png' });
    service.uploadProof(5, file).subscribe();
    const req = http.expectOne(`${BASE}/payments/5/proof`);
    expect(req.request.method).toBe('POST');
    expect((req.request.body as FormData).get('proof')).toBeInstanceOf(File);
    req.flush({});
  });
});
