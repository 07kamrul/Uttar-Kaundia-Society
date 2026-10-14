import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { AdminService } from './admin.service';
import { AdminTodayService } from './admin-today.service';
import { CacheStatsService } from './cache-stats.service';
import { CostSharePaymentService } from './cost-share-payment.service';
import { PhoneFixService } from './phone-fix.service';

const BASE = `${environment.apiBaseUrl}/admin`;

describe('admin console services', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  describe('AdminTodayService', () => {
    it('maps the counts to camelCase and keeps null sections null', () => {
      let result: unknown;
      TestBed.inject(AdminTodayService)
        .today()
        .subscribe((r) => (result = r));
      http.expectOne(`${BASE}/today`).flush({
        as_of: '2026-10-13T08:00:00Z',
        applications: { registrations_pending: 4, membership_applications_open: null, total: 4 },
        needs_dag: 1,
        payment_verifications: { installment: 3, cost_share: 1, total: 4 },
        complaints: { open: 7, due_soon: 2, overdue: 1 },
        property_requests: { pending: 2 },
        boundaries: null,
        committee_terms: { expiring_soon: 1, expired: 0, window_days: 60 },
        phone_fixes: { open: 5 },
      });
      expect(result).toEqual({
        asOf: '2026-10-13T08:00:00Z',
        applications: { registrationsPending: 4, membershipApplicationsOpen: null, total: 4 },
        needsDag: 1,
        paymentVerifications: { installment: 3, costShare: 1, total: 4 },
        complaints: { open: 7, dueSoon: 2, overdue: 1 },
        propertyRequests: { pending: 2 },
        boundaries: null,
        committeeTerms: { expiringSoon: 1, expired: 0, windowDays: 60 },
        phoneFixes: { open: 5 },
      });
    });

    it('treats missing sections as null', () => {
      let result: { applications: unknown; needsDag: unknown } | undefined;
      TestBed.inject(AdminTodayService)
        .today()
        .subscribe((r) => (result = r));
      http.expectOne(`${BASE}/today`).flush({ as_of: 'x' });
      expect(result?.applications).toBeNull();
      expect(result?.needsDag).toBeNull();
    });
  });

  describe('AdminService search', () => {
    it('keeps the old URLs when there is no search', () => {
      const service = TestBed.inject(AdminService);
      service.listSubmissions('pending').subscribe();
      http.expectOne(`${BASE}/submissions?status=pending`).flush([]);
      service.listMembers().subscribe();
      http.expectOne(`${BASE}/members`).flush([]);
    });

    it('passes the search term to submissions, members and applications', () => {
      const service = TestBed.inject(AdminService);
      service.listSubmissions('pending', 'রহিম').subscribe();
      http.expectOne(`${BASE}/submissions?status=pending&search=${encodeURIComponent('রহিম')}`).flush([]);
      service.listSubmissions(undefined, '0171').subscribe();
      http.expectOne(`${BASE}/submissions?search=0171`).flush([]);
      service.listMembers('UKAMKS-12').subscribe();
      http.expectOne(`${BASE}/members?search=UKAMKS-12`).flush([]);
      service.listApplications('received', 'karim').subscribe();
      http.expectOne(`${BASE}/membership-applications?status_filter=received&search=karim`).flush([]);
      service.listApplications(undefined).subscribe();
      http.expectOne(`${BASE}/membership-applications`).flush([]);
    });

    it('sends fee_category with a new fee version', () => {
      TestBed.inject(AdminService)
        .createFeeSettingVersion({
          key: 'monthly_subscription',
          value: 600,
          unit: 'taka',
          startDate: '2026-11-01',
          feeCategory: 'installment',
        })
        .subscribe();
      const req = http.expectOne(`${BASE}/fee-settings`);
      expect(req.request.body).toEqual({
        key: 'monthly_subscription',
        value: 600,
        unit: 'taka',
        start_date: '2026-11-01',
        fee_category: 'installment',
      });
      req.flush({ id: 1, key: 'monthly_subscription', value: 600, start_date: '2026-11-01', status: 1 });
    });
  });

  describe('CostSharePaymentService.bulkApprove', () => {
    it('posts the selection with the stale-guard figures and maps the result', () => {
      let result: unknown;
      TestBed.inject(CostSharePaymentService)
        .bulkApprove(
          [
            { kind: 'installment', id: 12 },
            { kind: 'cost_share', id: 4 },
          ],
          2,
          '1500.00',
        )
        .subscribe((r) => (result = r));
      const req = http.expectOne(`${BASE}/payment-verifications/bulk-approve`);
      expect(req.request.body).toEqual({
        items: [
          { kind: 'installment', id: 12 },
          { kind: 'cost_share', id: 4 },
        ],
        expected_count: 2,
        expected_total: '1500.00',
      });
      req.flush({
        batch_id: 'b7f3c2a1',
        approved_count: 1,
        approved_total: '500.00',
        approved: [{ kind: 'installment', id: 12, amount: '500.00' }],
        failed: [{ kind: 'cost_share', id: 4, code: 'NO_LONGER_DUE' }],
      });
      expect(result).toEqual({
        batchId: 'b7f3c2a1',
        approvedCount: 1,
        approvedTotal: 500,
        approved: [{ kind: 'installment', id: 12, amount: 500 }],
        failed: [{ kind: 'cost_share', id: 4, code: 'NO_LONGER_DUE' }],
      });
    });
  });

  describe('PhoneFixService', () => {
    it('lists the open fixes and resolves one with a corrected number', () => {
      const service = TestBed.inject(PhoneFixService);
      let rows: unknown;
      service.list().subscribe((r) => (rows = r));
      http.expectOne(`${BASE}/phone-fixes`).flush([
        {
          id: 3,
          entity_type: 'member',
          entity_id: 9,
          field: 'mobile',
          raw_value: '01-7',
          created_at: 'x',
          member_pk: 9,
          member_code: 'UKAMKS-9',
          member_name: 'করিম',
          resolved_at: null,
          mobile: null,
        },
      ]);
      expect(rows).toEqual([
        { id: 3, entityType: 'member', field: 'mobile', rawValue: '01-7', memberCode: 'UKAMKS-9', memberName: 'করিম' },
      ]);
      service.resolve(3, '+8801712345678').subscribe();
      const req = http.expectOne(`${BASE}/phone-fixes/3`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ mobile: '+8801712345678' });
      req.flush({});
    });
  });

  describe('CacheStatsService', () => {
    it('maps the cache table', () => {
      let result: unknown;
      TestBed.inject(CacheStatsService)
        .stats()
        .subscribe((r) => (result = r));
      http.expectOne(`${BASE}/cache/stats`).flush({
        enabled: true,
        caches: [
          { name: 'permissions', enabled: true, size: 3, maxsize: 100, ttl_seconds: 60, hits: 9, misses: 1, hit_ratio: 0.9, invalidations: 2 },
        ],
      });
      expect(result).toEqual({
        enabled: true,
        caches: [{ name: 'permissions', size: 3, maxSize: 100, ttlSeconds: 60, hitRatio: 0.9, invalidations: 2 }],
      });
    });
  });
});
