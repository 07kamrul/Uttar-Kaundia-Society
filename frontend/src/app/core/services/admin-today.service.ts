import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Each section is null when the signed-in admin lacks its permission (the card is then hidden). */
export interface AdminToday {
  asOf: string;
  applications: { registrationsPending: number | null; membershipApplicationsOpen: number | null; total: number } | null;
  needsDag: number | null;
  paymentVerifications: { installment: number; costShare: number; otherFee: number; total: number } | null;
  complaints: { open: number; dueSoon: number; overdue: number } | null;
  propertyRequests: { pending: number } | null;
  boundaries: { pending: number } | null;
  committeeTerms: { expiringSoon: number; expired: number; windowDays: number } | null;
  phoneFixes: { open: number } | null;
}

interface AdminTodayApi {
  as_of: string;
  applications?: { registrations_pending: number | null; membership_applications_open: number | null; total: number } | null;
  needs_dag?: number | null;
  payment_verifications?: { installment: number; cost_share: number; other_fee?: number; total: number } | null;
  complaints?: { open: number; due_soon: number; overdue: number } | null;
  property_requests?: { pending: number } | null;
  boundaries?: { pending: number } | null;
  committee_terms?: { expiring_soon: number; expired: number; window_days: number } | null;
  phone_fixes?: { open: number } | null;
}

function toAdminToday(api: AdminTodayApi): AdminToday {
  const a = api.applications;
  const p = api.payment_verifications;
  const c = api.complaints;
  const t = api.committee_terms;
  return {
    asOf: api.as_of,
    applications: a
      ? { registrationsPending: a.registrations_pending, membershipApplicationsOpen: a.membership_applications_open, total: a.total }
      : null,
    needsDag: api.needs_dag ?? null,
    paymentVerifications: p ? { installment: p.installment, costShare: p.cost_share, otherFee: p.other_fee ?? 0, total: p.total } : null,
    complaints: c ? { open: c.open, dueSoon: c.due_soon, overdue: c.overdue } : null,
    propertyRequests: api.property_requests ?? null,
    boundaries: api.boundaries ?? null,
    committeeTerms: t ? { expiringSoon: t.expiring_soon, expired: t.expired, windowDays: t.window_days } : null,
    phoneFixes: api.phone_fixes ?? null,
  };
}

/** GET /api/admin/today: the counts behind "আজকের কাজ" (COUNT-only, any admin account). */
@Injectable({ providedIn: 'root' })
export class AdminTodayService {
  private readonly http = inject(HttpClient);

  today(): Observable<AdminToday> {
    return this.http.get<AdminTodayApi>(`${environment.apiBaseUrl}/admin/today`).pipe(map(toAdminToday));
  }
}
