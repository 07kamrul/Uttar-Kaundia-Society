import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  AuditLogEntry,
  ConfigListItem,
  FeeSetting,
  Installment,
  Member,
  MemberProfile,
  SubmissionDetail,
  SubmissionStatus,
  SubmissionSummary,
} from '../models/admin.model';
import {
  toEventItem,
  toNotice,
  type EventApiModel,
  type EventItem,
  type Notice,
  type NoticeApiModel,
} from '../models/content.model';
import {
  toPropertyRequest,
  type MemberPropertyRequest,
  type PropertyRequestStatus,
} from './member.service';
import type { MembershipApplication } from './governance.service';

import {
  type AttachmentKind,
  type RejectResult,
  type NoticeInput,
  type EventInput,
  type MemberApiModel,
  type FeeSettingApiModel,
  type ConfigListItemApiModel,
  type AuditLogApiModel,
  toAuditLogEntry,
  type SubmissionSummaryApiModel,
  type SubmissionDetailApiModel,
  toMember,
  toFeeSetting,
  type AdminFeeType,
  type AdminFeeTypeVersion,
  type FeeTypeCalculation,
  type AdminFeeTypeApiModel,
  toFeeType,
  type AdminFeeTypeVersionApiModel,
  type FeeTypeCalculationApiModel,
  toConfigListItem,
  toSubmissionSummary,
  type ResetPasswordResult,
  toSubmissionDetail,
  type MemberProfileApiModel,
  toMemberProfile,
  type PicnicPaymentsPageApiModel,
  type PicnicPaymentsPage,
  type FeePaymentsPageApiModel,
  type FeePaymentsPage,
} from './admin-api';

export * from './admin-api';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private base = `${environment.apiBaseUrl}/admin`;

  constructor(private http: HttpClient) {}

  /** `?a=1&b=2` from the given pairs, skipping empty values; empty string when none. */
  private query(pairs: Array<[string, string | undefined]>): string {
    const parts = pairs
      .filter(([, v]) => !!v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`);
    return parts.length ? `?${parts.join('&')}` : '';
  }

  listSubmissions(status?: SubmissionStatus, search?: string): Observable<SubmissionSummary[]> {
    const url = `${this.base}/submissions${this.query([
      ['status', status],
      ['search', search?.trim()],
    ])}`;
    return this.http
      .get<SubmissionSummaryApiModel[]>(url)
      .pipe(map((rows) => rows.map(toSubmissionSummary)));
  }

  getSubmission(id: string): Observable<SubmissionDetail> {
    return this.http
      .get<SubmissionDetailApiModel>(`${this.base}/submissions/${id}`)
      .pipe(map(toSubmissionDetail));
  }

  replaceAttachment(id: string, kind: AttachmentKind, file: File): Observable<SubmissionDetail> {
    const body = new FormData();
    body.append('file', file);
    return this.http
      .put<SubmissionDetailApiModel>(`${this.base}/submissions/${id}/attachments/${kind}`, body)
      .pipe(map(toSubmissionDetail));
  }

  /** Replace a property's applicable document, e.g. when the stored file is lost. */
  replaceDocument(id: string, docId: string, file: File): Observable<SubmissionDetail> {
    const body = new FormData();
    body.append('file', file);
    return this.http
      .put<SubmissionDetailApiModel>(`${this.base}/submissions/${id}/documents/${docId}`, body)
      .pipe(map(toSubmissionDetail));
  }

  approveSubmission(id: string): Observable<{ member_id: string }> {
    return this.http.post<{ member_id: string }>(`${this.base}/submissions/${id}/approve`, {});
  }

  rejectSubmission(id: string, reason: string): Observable<RejectResult> {
    return this.http
      .post<{ status: string; email_sent: boolean }>(`${this.base}/submissions/${id}/reject`, {
        reason,
      })
      .pipe(map((res) => ({ emailSent: res.email_sent })));
  }

  resendRejectionNotification(id: string): Observable<RejectResult> {
    return this.http
      .post<{ status: string; email_sent: boolean }>(
        `${this.base}/submissions/${id}/resend-notification`,
        {},
      )
      .pipe(map((res) => ({ emailSent: res.email_sent })));
  }

  listPropertyRequests(status?: PropertyRequestStatus): Observable<MemberPropertyRequest[]> {
    const url = status
      ? `${this.base}/property-requests?status=${status}`
      : `${this.base}/property-requests`;
    return this.http
      .get<Parameters<typeof toPropertyRequest>[0][]>(url)
      .pipe(map((rows) => rows.map(toPropertyRequest)));
  }

  approvePropertyRequest(id: number): Observable<MemberPropertyRequest> {
    return this.http
      .post<Parameters<typeof toPropertyRequest>[0]>(
        `${this.base}/property-requests/${id}/approve`,
        {},
      )
      .pipe(map(toPropertyRequest));
  }

  cancelPropertyRequest(id: number, reason: string): Observable<MemberPropertyRequest> {
    return this.http
      .post<Parameters<typeof toPropertyRequest>[0]>(
        `${this.base}/property-requests/${id}/cancel`,
        { reason },
      )
      .pipe(map(toPropertyRequest));
  }

  listMembers(search?: string): Observable<Member[]> {
    return this.http
      .get<MemberApiModel[]>(`${this.base}/members${this.query([['search', search?.trim()]])}`)
      .pipe(map((rows) => rows.map(toMember)));
  }

  /** Membership applications (membership_application.manage), optionally searched by name or mobile. */
  listApplications(status?: string, search?: string): Observable<MembershipApplication[]> {
    const url = `${this.base}/membership-applications${this.query([
      ['status_filter', status],
      ['search', search?.trim()],
    ])}`;
    return this.http.get<MembershipApplication[]>(url);
  }

  getMemberProfile(id: string): Observable<MemberProfile> {
    return this.http
      .get<MemberProfileApiModel>(`${this.base}/members/${id}`)
      .pipe(map(toMemberProfile));
  }

  getMemberInstallments(memberId: string): Observable<Installment[]> {
    return this.http.get<Installment[]>(`${this.base}/members/${memberId}/installments`);
  }

  deleteMember(memberId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/members/${memberId}`);
  }

  resetMemberPassword(memberId: string): Observable<ResetPasswordResult> {
    return this.http.post<ResetPasswordResult>(
      `${this.base}/members/${memberId}/reset-password`,
      {},
    );
  }

  addInstallment(
    memberId: string,
    installment: { year: number; month: number; amount: number },
  ): Observable<Installment> {
    return this.http.post<Installment>(
      `${this.base}/members/${memberId}/installments`,
      installment,
    );
  }

  updateInstallment(id: string, status: 'paid' | 'due'): Observable<Installment> {
    return this.http.patch<Installment>(`${this.base}/installments/${id}`, { status });
  }

  getPicnicPayments(filters: {
    memberId?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Observable<PicnicPaymentsPage> {
    const params: Record<string, string> = {};
    if (filters.memberId != null) params['member_id'] = String(filters.memberId);
    if (filters.dateFrom) params['date_from'] = filters.dateFrom;
    if (filters.dateTo) params['date_to'] = filters.dateTo;
    return this.http
      .get<PicnicPaymentsPageApiModel>(`${this.base}/picnic-payments`, { params })
      .pipe(
        map((page) => ({
          totalCollected: page.total_collected,
          count: page.count,
          items: page.items.map((row) => ({
            id: row.id,
            memberId: row.member_id,
            memberName: row.member_name,
            headPrice: row.head_price,
            additionalPrice: row.additional_price,
            additionalCount: row.additional_count,
            total: row.total,
            paymentDate: row.payment_date,
            receiptNo: row.receipt_no,
            paymentMethod: row.payment_method,
          })),
        })),
      );
  }

  /** All members' non-installment payments in one ledger - the generalized
   * (paginated) picnic payments list, picnic rows included, installments
   * never. Backed by GET /admin/other-fees/payments. */
  getFeePayments(filters: {
    memberId?: number;
    feeType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }): Observable<FeePaymentsPage> {
    const params: Record<string, string> = {};
    if (filters.memberId != null) params['member_id'] = String(filters.memberId);
    if (filters.feeType) params['fee_type'] = filters.feeType;
    if (filters.dateFrom) params['date_from'] = filters.dateFrom;
    if (filters.dateTo) params['date_to'] = filters.dateTo;
    if (filters.page != null) params['page'] = String(filters.page);
    if (filters.pageSize != null) params['page_size'] = String(filters.pageSize);
    return this.http
      .get<FeePaymentsPageApiModel>(`${this.base}/other-fees/payments`, { params })
      .pipe(
        map((page) => ({
          totalCollected: page.summary.total_paid,
          count: page.total,
          page: page.page,
          pageSize: page.page_size,
          byType: page.summary.by_type,
          items: page.items.map((row) => ({
            id: row.id,
            memberId: row.member_id,
            memberName: row.member_name,
            feeType: row.fee_type,
            amount: Number(row.amount),
            paymentDate: row.payment_date,
            receiptNo: row.receipt_no,
            paymentMethod: row.payment_method,
            note: row.note,
            additionalHeads: row.additional_heads,
            source: row.source,
          })),
        })),
      );
  }

  getActiveFeeSettings(): Observable<FeeSetting[]> {
    return this.http
      .get<FeeSettingApiModel[]>(`${this.base}/fee-settings`)
      .pipe(map((rows) => rows.map(toFeeSetting)));
  }

  getFeeSettingHistory(key: string): Observable<FeeSetting[]> {
    return this.http
      .get<FeeSettingApiModel[]>(`${this.base}/fee-settings/${key}/history`)
      .pipe(map((rows) => rows.map(toFeeSetting)));
  }

  createFeeSettingVersion(payload: {
    key: string;
    value: number;
    unit?: string;
    startDate?: string;
    feeCategory?: string;
  }): Observable<FeeSetting> {
    return this.http
      .post<FeeSettingApiModel>(`${this.base}/fee-settings`, {
        key: payload.key,
        value: payload.value,
        unit: payload.unit,
        start_date: payload.startDate,
        ...(payload.feeCategory ? { fee_category: payload.feeCategory } : {}),
      })
      .pipe(map(toFeeSetting));
  }

  getFeeTypes(): Observable<AdminFeeType[]> {
    return this.http
      .get<AdminFeeTypeApiModel[]>(`${this.base}/fee-types`)
      .pipe(map((rows) => rows.map(toFeeType)));
  }

  createFeeType(payload: {
    key: string;
    labelBn: string;
    labelEn: string;
    calculationType: string;
    unit?: string;
    isRecurring?: boolean;
    isPayOnce?: boolean;
    feeCategory?: string;
  }): Observable<AdminFeeType> {
    return this.http
      .post<AdminFeeTypeApiModel>(`${this.base}/fee-types`, {
        key: payload.key,
        label_bn: payload.labelBn,
        label_en: payload.labelEn,
        calculation_type: payload.calculationType,
        unit: payload.unit ?? 'taka',
        is_recurring: payload.isRecurring ?? false,
        is_pay_once: payload.isPayOnce ?? false,
        fee_category: payload.feeCategory ?? 'other',
      })
      .pipe(map(toFeeType));
  }

  updateFeeType(key: string, payload: Partial<AdminFeeType>): Observable<AdminFeeType> {
    const body: Record<string, unknown> = {};
    if (payload.labelBn !== undefined) body['label_bn'] = payload.labelBn;
    if (payload.labelEn !== undefined) body['label_en'] = payload.labelEn;
    if (payload.unit !== undefined) body['unit'] = payload.unit;
    if (payload.isRecurring !== undefined) body['is_recurring'] = payload.isRecurring;
    if (payload.isPayOnce !== undefined) body['is_pay_once'] = payload.isPayOnce;
    if (payload.feeCategory !== undefined) body['fee_category'] = payload.feeCategory;
    if (payload.isActive !== undefined) body['is_active'] = payload.isActive;
    return this.http
      .put<AdminFeeTypeApiModel>(`${this.base}/fee-types/${encodeURIComponent(key)}`, body)
      .pipe(map(toFeeType));
  }

  getFeeTypeVersions(key: string): Observable<AdminFeeTypeVersion[]> {
    return this.http
      .get<AdminFeeTypeVersionApiModel[]>(
        `${this.base}/fee-types/${encodeURIComponent(key)}/versions`,
      )
      .pipe(
        map((rows) =>
          rows.map((row) => ({
            startDate: row.start_date,
            endDate: row.end_date ?? null,
            status: row.status,
            values: row.values,
          })),
        ),
      );
  }

  createFeeTypeVersion(
    key: string,
    payload: {
      value?: number;
      baseAmount?: number;
      additionalRate?: number;
      baseThreshold?: number;
      headFee?: number;
      additionalHeadFee?: number;
      minAmount?: number;
      maxAmount?: number;
      unit?: string;
      startDate?: string;
    },
  ): Observable<AdminFeeTypeVersion[]> {
    return this.http
      .post<AdminFeeTypeVersionApiModel[]>(
        `${this.base}/fee-types/${encodeURIComponent(key)}/versions`,
        {
          value: payload.value,
          base_amount: payload.baseAmount,
          additional_rate: payload.additionalRate,
          base_threshold: payload.baseThreshold,
          head_fee: payload.headFee,
          additional_head_fee: payload.additionalHeadFee,
          min_amount: payload.minAmount,
          max_amount: payload.maxAmount,
          unit: payload.unit,
          start_date: payload.startDate,
        },
      )
      .pipe(
        map((rows) =>
          rows.map((row) => ({
            startDate: row.start_date,
            endDate: row.end_date ?? null,
            status: row.status,
            values: row.values,
          })),
        ),
      );
  }

  calculateFeeType(
    key: string,
    payload: { landSize?: number; additionalHeads?: number; amount?: number },
  ): Observable<FeeTypeCalculation> {
    return this.http
      .post<FeeTypeCalculationApiModel>(
        `${this.base}/fee-types/${encodeURIComponent(key)}/calculate`,
        {
          land_size: payload.landSize,
          additional_heads: payload.additionalHeads,
          amount: payload.amount,
        },
      )
      .pipe(
        map((res) => ({
          calculationType: res.calculation_type,
          total: res.total === null ? null : Number(res.total),
          breakdown: res.breakdown,
        })),
      );
  }

  listAuditLog(): Observable<AuditLogEntry[]> {
    return this.http
      .get<AuditLogApiModel[]>(`${this.base}/audit-log`)
      .pipe(map((rows) => rows.map(toAuditLogEntry)));
  }

  listConfigListItems(category?: string): Observable<ConfigListItem[]> {
    const url = category
      ? `${this.base}/config-lists?category=${encodeURIComponent(category)}`
      : `${this.base}/config-lists`;
    return this.http
      .get<ConfigListItemApiModel[]>(url)
      .pipe(map((rows) => rows.map(toConfigListItem)));
  }

  createConfigListItem(payload: {
    category: string;
    value: string;
    label: string;
    sortOrder?: number;
  }): Observable<ConfigListItem> {
    return this.http
      .post<ConfigListItemApiModel>(`${this.base}/config-lists`, {
        category: payload.category,
        value: payload.value,
        label: payload.label,
        sort_order: payload.sortOrder ?? 0,
      })
      .pipe(map(toConfigListItem));
  }

  updateConfigListItem(
    id: string,
    payload: { label?: string; sortOrder?: number; isActive?: boolean },
  ): Observable<ConfigListItem> {
    return this.http
      .patch<ConfigListItemApiModel>(`${this.base}/config-lists/${id}`, {
        label: payload.label,
        sort_order: payload.sortOrder,
        is_active: payload.isActive,
      })
      .pipe(map(toConfigListItem));
  }

  listNotices(options?: { published?: boolean; categoryId?: string }): Observable<Notice[]> {
    const params: string[] = [];
    if (options?.published !== undefined) params.push(`published=${options.published}`);
    if (options?.categoryId) params.push(`category_id=${encodeURIComponent(options.categoryId)}`);
    const url = params.length ? `${this.base}/notices?${params.join('&')}` : `${this.base}/notices`;
    return this.http.get<NoticeApiModel[]>(url).pipe(map((rows) => rows.map(toNotice)));
  }

  createNotice(payload: NoticeInput): Observable<Notice> {
    return this.http
      .post<NoticeApiModel>(`${this.base}/notices`, this.noticeBody(payload))
      .pipe(map(toNotice));
  }

  updateNotice(id: string, payload: NoticeInput): Observable<Notice> {
    return this.http
      .patch<NoticeApiModel>(`${this.base}/notices/${id}`, this.noticeBody(payload))
      .pipe(map(toNotice));
  }

  deleteNotice(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/notices/${id}`);
  }

  listEvents(options?: { published?: boolean; categoryId?: string }): Observable<EventItem[]> {
    const params: string[] = [];
    if (options?.published !== undefined) params.push(`published=${options.published}`);
    if (options?.categoryId) params.push(`category_id=${encodeURIComponent(options.categoryId)}`);
    const url = params.length ? `${this.base}/events?${params.join('&')}` : `${this.base}/events`;
    return this.http.get<EventApiModel[]>(url).pipe(map((rows) => rows.map(toEventItem)));
  }

  createEvent(payload: EventInput): Observable<EventItem> {
    return this.http
      .post<EventApiModel>(`${this.base}/events`, this.eventBody(payload))
      .pipe(map(toEventItem));
  }

  updateEvent(id: string, payload: EventInput): Observable<EventItem> {
    return this.http
      .patch<EventApiModel>(`${this.base}/events/${id}`, this.eventBody(payload))
      .pipe(map(toEventItem));
  }

  deleteEvent(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/events/${id}`);
  }

  // The form always sends the complete record (never a sparse patch), so an
  // emptied category/date round-trips as null instead of being dropped.
  private noticeBody(payload: NoticeInput): Record<string, unknown> {
    return {
      title: payload.title,
      body: payload.body,
      category_id: payload.categoryId != null ? Number(payload.categoryId) : null,
      is_published: payload.isPublished ?? false,
      is_members_only: payload.isMembersOnly ?? false,
      publish_at: payload.publishAt ?? null,
    };
  }

  private eventBody(payload: EventInput): Record<string, unknown> {
    return {
      title: payload.title,
      description: payload.description ?? null,
      location: payload.location ?? null,
      category_id: payload.categoryId != null ? Number(payload.categoryId) : null,
      start_at: payload.startAt,
      end_at: payload.endAt ?? null,
      is_published: payload.isPublished ?? false,
      is_members_only: payload.isMembersOnly ?? false,
    };
  }
}
