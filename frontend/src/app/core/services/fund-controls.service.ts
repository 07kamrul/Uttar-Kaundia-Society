import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { IncomeSourceKey } from './finance.service';

/** One constitutional income source (from /api/governance/constants). */
export interface IncomeSource {
  key: IncomeSourceKey;
  bn: string;
  en: string;
  requires_justification: boolean;
}

export interface FundControlsSettings {
  expenseTwoPersonThreshold: number;
  thresholdIsDefault: boolean;
  incomeSources: IncomeSource[];
}

export type SignatoryPostBn = string | null;

export interface BankSignatory {
  id: number;
  memberId: number;
  memberName: string | null;
  memberDisplayId: string | null;
  committeeTermId: number | null;
  committeePostBn: SignatoryPostBn;
  bankName: string;
  branch: string;
  accountName: string;
  /** Only the last 4 digits exist anywhere in the system. */
  accountNumberMasked: string;
  authorityScope: string | null;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
}

export interface BankSignatoryInput {
  memberId: number;
  committeeTermId?: number | null;
  bankName: string;
  branch: string;
  accountName: string;
  accountNumberLast4: string;
  authorityScope?: string | null;
  validFrom: string;
  validTo?: string | null;
}

export interface AuditReport {
  id: number;
  fiscalYear: string;
  reportDate: string;
  summaryText: string | null;
  hasFile: boolean;
  originalName: string | null;
  publishedNoticeId: number | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface AuditReminder {
  fiscalYear: string;
  currentFyReportExists: boolean;
  reminderWindowActive: boolean;
}

export type WelfareRequestType = 'medical' | 'emergency' | 'education' | 'other';
export type WelfareRequestStatus = 'submitted' | 'under_review' | 'approved' | 'rejected' | 'disbursed';

export interface WelfareFundRequest {
  id: number;
  requestNo: string;
  memberId: number;
  memberName: string | null;
  memberDisplayId: string | null;
  requestType: WelfareRequestType;
  amountRequested: number;
  reason: string;
  status: WelfareRequestStatus;
  committeeReason: string | null;
  approvedAmount: number | null;
  decidedAt: string | null;
  disbursedAt: string | null;
  transactionId: number | null;
  createdAt: string;
}

interface SettingsApiModel {
  expense_two_person_threshold: string;
  threshold_is_default: boolean;
  income_sources: IncomeSource[];
}

interface SignatoryApiModel {
  id: number;
  member_id: number;
  member_name: string | null;
  member_display_id: string | null;
  committee_term_id: number | null;
  committee_post_bn: string | null;
  bank_name: string;
  branch: string;
  account_name: string;
  account_number_masked: string;
  authority_scope: string | null;
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
}

interface AuditReportApiModel {
  id: number;
  fiscal_year: string;
  report_date: string;
  summary_text: string | null;
  has_file: boolean;
  original_name: string | null;
  published_notice_id: number | null;
  published_at: string | null;
  created_at: string;
}

interface WelfareRequestApiModel {
  id: number;
  request_no: string;
  member_id: number;
  member_name: string | null;
  member_display_id: string | null;
  request_type: WelfareRequestType;
  amount_requested: string;
  reason: string;
  status: WelfareRequestStatus;
  committee_reason: string | null;
  approved_amount: string | null;
  decided_at: string | null;
  disbursed_at: string | null;
  transaction_id: number | null;
  created_at: string;
}

function toSignatory(api: SignatoryApiModel): BankSignatory {
  return {
    id: api.id,
    memberId: api.member_id,
    memberName: api.member_name,
    memberDisplayId: api.member_display_id,
    committeeTermId: api.committee_term_id,
    committeePostBn: api.committee_post_bn,
    bankName: api.bank_name,
    branch: api.branch,
    accountName: api.account_name,
    accountNumberMasked: api.account_number_masked,
    authorityScope: api.authority_scope,
    validFrom: api.valid_from,
    validTo: api.valid_to,
    isActive: api.is_active,
  };
}

function toAuditReport(api: AuditReportApiModel): AuditReport {
  return {
    id: api.id,
    fiscalYear: api.fiscal_year,
    reportDate: api.report_date,
    summaryText: api.summary_text,
    hasFile: api.has_file,
    originalName: api.original_name,
    publishedNoticeId: api.published_notice_id,
    publishedAt: api.published_at,
    createdAt: api.created_at,
  };
}

function toWelfareRequest(api: WelfareRequestApiModel): WelfareFundRequest {
  return {
    id: api.id,
    requestNo: api.request_no,
    memberId: api.member_id,
    memberName: api.member_name,
    memberDisplayId: api.member_display_id,
    requestType: api.request_type,
    amountRequested: Number(api.amount_requested),
    reason: api.reason,
    status: api.status,
    committeeReason: api.committee_reason,
    approvedAmount: api.approved_amount == null ? null : Number(api.approved_amount),
    decidedAt: api.decided_at,
    disbursedAt: api.disbursed_at,
    transactionId: api.transaction_id,
    createdAt: api.created_at,
  };
}

@Injectable({ providedIn: 'root' })
export class FundControlsService {
  private readonly adminBase = `${environment.apiBaseUrl}/admin`;
  private readonly memberBase = `${environment.apiBaseUrl}/member`;

  constructor(private http: HttpClient) {}

  // ----- Settings (fund.manage) -----

  settings(): Observable<FundControlsSettings> {
    return this.http
      .get<SettingsApiModel>(`${this.adminBase}/fund-controls/settings`)
      .pipe(
        map((api) => ({
          expenseTwoPersonThreshold: Number(api.expense_two_person_threshold),
          thresholdIsDefault: api.threshold_is_default,
          incomeSources: api.income_sources,
        })),
      );
  }

  updateThreshold(value: number): Observable<FundControlsSettings> {
    return this.http
      .put<SettingsApiModel>(`${this.adminBase}/fund-controls/settings`, {
        expense_two_person_threshold: value,
      })
      .pipe(
        map((api) => ({
          expenseTwoPersonThreshold: Number(api.expense_two_person_threshold),
          thresholdIsDefault: api.threshold_is_default,
          incomeSources: api.income_sources,
        })),
      );
  }

  // ----- Bank signatories (signatory.manage) -----

  signatories(includeInactive = false): Observable<BankSignatory[]> {
    return this.http
      .get<SignatoryApiModel[]>(`${this.adminBase}/fund-controls/signatories`, {
        params: includeInactive ? { include_inactive: 'true' } : {},
      })
      .pipe(map((rows) => rows.map(toSignatory)));
  }

  createSignatory(input: BankSignatoryInput): Observable<BankSignatory> {
    return this.http
      .post<SignatoryApiModel>(`${this.adminBase}/fund-controls/signatories`, {
        member_id: input.memberId,
        committee_term_id: input.committeeTermId ?? null,
        bank_name: input.bankName,
        branch: input.branch,
        account_name: input.accountName,
        account_number_last4: input.accountNumberLast4,
        authority_scope: input.authorityScope ?? null,
        valid_from: input.validFrom,
        valid_to: input.validTo ?? null,
      })
      .pipe(map(toSignatory));
  }

  updateSignatory(id: number, changes: Partial<BankSignatoryInput> & { isActive?: boolean }): Observable<BankSignatory> {
    const body: Record<string, unknown> = {};
    if (changes.committeeTermId !== undefined) body['committee_term_id'] = changes.committeeTermId ?? null;
    if (changes.bankName !== undefined) body['bank_name'] = changes.bankName;
    if (changes.branch !== undefined) body['branch'] = changes.branch;
    if (changes.accountName !== undefined) body['account_name'] = changes.accountName;
    if (changes.accountNumberLast4 !== undefined) body['account_number_last4'] = changes.accountNumberLast4;
    if (changes.authorityScope !== undefined) body['authority_scope'] = changes.authorityScope ?? null;
    if (changes.validFrom !== undefined) body['valid_from'] = changes.validFrom;
    if (changes.validTo !== undefined) body['valid_to'] = changes.validTo ?? null;
    if (changes.isActive !== undefined) body['is_active'] = changes.isActive;
    return this.http
      .patch<SignatoryApiModel>(`${this.adminBase}/fund-controls/signatories/${id}`, body)
      .pipe(map(toSignatory));
  }

  deactivateSignatory(id: number, reason: string): Observable<void> {
    return this.http.request<void>(
      'DELETE',
      `${this.adminBase}/fund-controls/signatories/${id}`,
      { body: { reason } },
    );
  }

  downloadBankLetter(): Observable<Blob> {
    return this.http.get(`${this.adminBase}/fund-controls/signatories/bank-letter.pdf`, {
      responseType: 'blob',
    });
  }

  // ----- Audit reports (audit_report.manage) -----

  auditReports(): Observable<AuditReport[]> {
    return this.http
      .get<AuditReportApiModel[]>(`${this.adminBase}/fund-controls/audit-reports`)
      .pipe(map((rows) => rows.map(toAuditReport)));
  }

  uploadAuditReport(file: File, fiscalYear: string, reportDate: string, summaryText?: string): Observable<AuditReport> {
    const body = new FormData();
    body.append('file', file);
    body.append('fiscal_year', fiscalYear);
    body.append('report_date', reportDate);
    if (summaryText) body.append('summary_text', summaryText);
    return this.http
      .post<AuditReportApiModel>(`${this.adminBase}/fund-controls/audit-reports`, body)
      .pipe(map(toAuditReport));
  }

  updateAuditSummary(id: number, summaryText: string): Observable<AuditReport> {
    return this.http
      .patch<AuditReportApiModel>(`${this.adminBase}/fund-controls/audit-reports/${id}/summary`, {
        summary_text: summaryText,
      })
      .pipe(map(toAuditReport));
  }

  publishAuditReport(id: number): Observable<AuditReport> {
    return this.http
      .post<AuditReportApiModel>(`${this.adminBase}/fund-controls/audit-reports/${id}/publish`, {})
      .pipe(map(toAuditReport));
  }

  auditReminder(): Observable<AuditReminder> {
    return this.http
      .get<AuditReminderApiShape>(`${this.adminBase}/fund-controls/audit-reminder`)
      .pipe(
        map((api) => ({
          fiscalYear: api.fiscal_year,
          currentFyReportExists: api.current_fy_report_exists,
          reminderWindowActive: api.reminder_window_active,
        })),
      );
  }

  downloadAuditFile(id: number): Observable<Blob> {
    return this.http.get(`${this.adminBase}/fund-controls/audit-reports/${id}/file`, {
      responseType: 'blob',
    });
  }

  // ----- Member: published audit summaries (fund transparency) -----

  memberAuditReports(): Observable<AuditReport[]> {
    return this.http
      .get<AuditReportApiModel[]>(`${this.memberBase}/fund-controls/audit-reports`)
      .pipe(map((rows) => rows.map(toAuditReport)));
  }

  downloadMemberAuditFile(id: number): Observable<Blob> {
    return this.http.get(`${this.memberBase}/fund-controls/audit-reports/${id}/file`, {
      responseType: 'blob',
    });
  }

  // ----- Welfare fund (welfare_fund.review admin / welfare_fund.apply member) -----

  welfareRequests(status?: WelfareRequestStatus): Observable<WelfareFundRequest[]> {
    return this.http
      .get<WelfareRequestApiModel[]>(`${this.adminBase}/fund-controls/welfare-requests`, {
        params: status ? { status } : {},
      })
      .pipe(map((rows) => rows.map(toWelfareRequest)));
  }

  startWelfareReview(id: number): Observable<WelfareFundRequest> {
    return this.http
      .post<WelfareRequestApiModel>(
        `${this.adminBase}/fund-controls/welfare-requests/${id}/start-review`,
        {},
      )
      .pipe(map(toWelfareRequest));
  }

  decideWelfareRequest(
    id: number,
    decision: 'approved' | 'rejected',
    committeeReason: string,
    approvedAmount?: number,
  ): Observable<WelfareFundRequest> {
    return this.http
      .post<WelfareRequestApiModel>(
        `${this.adminBase}/fund-controls/welfare-requests/${id}/decide`,
        {
          decision,
          committee_reason: committeeReason,
          approved_amount: approvedAmount ?? null,
        },
      )
      .pipe(map(toWelfareRequest));
  }

  disburseWelfareRequest(id: number, transactionId?: number): Observable<WelfareFundRequest> {
    return this.http
      .post<WelfareRequestApiModel>(
        `${this.adminBase}/fund-controls/welfare-requests/${id}/disburse`,
        { transaction_id: transactionId ?? null },
      )
      .pipe(map(toWelfareRequest));
  }

  // Member apply/list/detail.

  myWelfareRequests(): Observable<WelfareFundRequest[]> {
    return this.http
      .get<WelfareRequestApiModel[]>(`${this.memberBase}/welfare-fund/requests`)
      .pipe(map((rows) => rows.map(toWelfareRequest)));
  }

  applyForWelfareFund(
    requestType: WelfareRequestType,
    amountRequested: number,
    reason: string,
  ): Observable<WelfareFundRequest> {
    return this.http
      .post<WelfareRequestApiModel>(`${this.memberBase}/welfare-fund/requests`, {
        request_type: requestType,
        amount_requested: amountRequested,
        reason,
      })
      .pipe(map(toWelfareRequest));
  }

  downloadDecisionLetter(id: number): Observable<Blob> {
    return this.http.get(`${this.memberBase}/welfare-fund/requests/${id}/decision-letter.pdf`, {
      responseType: 'blob',
    });
  }
}

interface AuditReminderApiShape {
  fiscal_year: string;
  current_fy_report_exists: boolean;
  reminder_window_active: boolean;
}
