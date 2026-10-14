import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { AdminTodayService } from './admin-today.service';

function today(payload: object) {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const http = TestBed.inject(HttpTestingController);
  let result: unknown;
  TestBed.inject(AdminTodayService).today().subscribe((r) => (result = r));
  http.expectOne(`${environment.apiBaseUrl}/admin/today`).flush(payload);
  return result as { paymentVerifications: unknown };
}

describe('AdminTodayService payment verifications', () => {
  it('carries the other-fee count and the combined total', () => {
    const r = today({ as_of: 'x', payment_verifications: { installment: 1, cost_share: 2, other_fee: 3, total: 6 } });
    expect(r.paymentVerifications).toEqual({ installment: 1, costShare: 2, otherFee: 3, total: 6 });
  });

  it('treats a missing other_fee as zero (older backend)', () => {
    const r = today({ as_of: 'x', payment_verifications: { installment: 1, cost_share: 2, total: 3 } });
    expect(r.paymentVerifications).toEqual({ installment: 1, costShare: 2, otherFee: 0, total: 3 });
  });
});
