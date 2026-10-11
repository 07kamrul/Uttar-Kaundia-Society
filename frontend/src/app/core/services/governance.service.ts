import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** SLA badge state from the backend (services/governance.py sla_status). */
export type SlaState = 'on_track' | 'due_soon' | 'overdue' | 'met';

export interface SlaInfo {
  state: SlaState;
  days_remaining: number;
}

export interface TimelineEvent {
  event: string;
  at: string;
  actor?: string | null;
  note?: string | null;
}

export interface MembershipApplication {
  id: number;
  application_no: string;
  full_name: string;
  father_name: string;
  mother_name: string;
  spouse_name?: string | null;
  mobile: string;
  email: string;
  address_house?: string | null;
  address_road?: string | null;
  address_post_office?: string | null;
  address_upazila?: string | null;
  address_district?: string | null;
  address_division?: string | null;
  ownership_type: string;
  has_nid_document: boolean;
  has_ownership_document: boolean;
  consent: boolean;
  status: 'received' | 'under_review' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  submitted_at: string;
  sla_due_at: string;
  sla: SlaInfo;
  reviewed_at?: string | null;
  notification_status?: string | null;
  member_id?: number | null;
  timeline: TimelineEvent[];
}

export interface FeeWaiver {
  id: number;
  member_id: number;
  member_name?: string | null;
  type: 'waiver' | 'installment';
  reason: string;
  months?: number | null;
  installment_plan?: Array<Record<string, unknown>> | null;
  status: 'pending' | 'approved' | 'rejected';
  decision_note?: string | null;
  decided_at?: string | null;
  created_at?: string | null;
}

export interface MembershipAction {
  id: number;
  member_id: number;
  member_name?: string | null;
  type: 'suspend' | 'terminate';
  reason: string;
  written_notice_at?: string | null;
  response_deadline?: string | null;
  member_response?: string | null;
  member_response_at?: string | null;
  status: 'draft' | 'noticed' | 'awaiting_response' | 'decided' | 'cancelled';
  decision?: string | null;
  decided_at?: string | null;
  notification_email_sent?: boolean | null;
}

export interface MembershipAppeal {
  id: number;
  membership_action_id?: number | null;
  application_id?: number | null;
  filed_by_member_id: number;
  grounds: string;
  filed_at: string;
  window_expires_at: string;
  assigned_reviewer_admin_id?: number | null;
  reviewer_name?: string | null;
  status: 'submitted' | 'under_review' | 'upheld' | 'overturned';
  decision?: string | null;
  decided_at?: string | null;
}

export interface DataCorrectionRequest {
  id: number;
  member_id: number;
  member_name?: string | null;
  field: string;
  requested_value: string;
  reason: string;
  status: 'pending' | 'applied' | 'rejected';
  admin_note?: string | null;
  handled_at?: string | null;
  created_at?: string | null;
}

export interface Complaint {
  id: number;
  complaint_no: string;
  complainant_member_id: number;
  complainant_name?: string | null;
  category: string;
  subject: string;
  details: string;
  is_land_protection: boolean;
  form_data?: Record<string, unknown> | null;
  has_evidence: boolean;
  accused_admin_id?: number | null;
  assigned_admin_id?: number | null;
  assigned_admin_name?: string | null;
  status: string;
  submitted_at: string;
  sla_ack_due: string;
  sla_update_due: string;
  sla_ack: SlaInfo;
  sla_update: SlaInfo;
  acknowledged_at?: string | null;
  first_update_at?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
  timeline: TimelineEvent[];
}

export interface ComplaintConstants {
  anti_retaliation_notice: string;
  land_evidence_checklist: string[];
  emergency_contacts: Array<{ key: string; number: string; bn: string }>;
  categories: Array<{ key: string; bn: string }>;
}

export interface ServiceStandard {
  key: string;
  bn: string;
  target: string;
  live: { total: number; met: number; met_pct?: number; avg_working_days?: number } | null;
}

export interface ArrearItem {
  member_id: number;
  full_name: string;
  months_expected: number;
  expected_amount: number;
  paid_amount: number;
  arrears_amount: number;
  in_arrears: boolean;
}

export interface MyDocument {
  kind: string;
  label: string;
  url: string;
}

export interface CouncilPost {
  key: string;
  bn: string;
  en: string;
  council: string;
}

export interface GovernanceConstants {
  notice_periods: {
    agm_notice_days: number;
    emergency_meeting_notice_days: number;
    appeal_window_days: number;
    petition_response_days: number;
    complaint_ack_working_days: number;
    complaint_update_working_days: number;
    membership_sla_working_days: number;
  };
  council_size: number;
  quorum: Record<string, number>;
  council_posts: CouncilPost[];
  income_sources: Array<{ key: string; bn: string; en: string; requires_justification: boolean }>;
  foreign_funding_blocked: boolean;
  weekend_days: number[];
}

/**
 * Governance modules 1 & 5 (সদস্য আবেদন ও আপিল / অভিযোগ ব্যবস্থা).
 * All SLA numbers come from the backend - see GET /api/governance/constants.
 */
@Injectable({ providedIn: 'root' })
export class GovernanceService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  // --- shared constants -------------------------------------------------
  /** The 11 council posts + notice periods + quorum - never hardcode these. */
  constants(): Observable<GovernanceConstants> {
    return this.http.get<GovernanceConstants>(`${this.base}/governance/constants`);
  }

  // --- complaints: constants ------------------------------------------
  complaintConstants(): Observable<ComplaintConstants> {
    return this.http.get<ComplaintConstants>(`${this.base}/complaints/constants`);
  }

  serviceStandard(): Observable<{ anti_retaliation_notice: string; standards: ServiceStandard[] }> {
    return this.http.get(`${this.base}/governance/service-standard`) as Observable<{
      anti_retaliation_notice: string;
      standards: ServiceStandard[];
    }>;
  }

  // --- membership applications -----------------------------------------
  myApplications(): Observable<MembershipApplication[]> {
    return this.http.get<MembershipApplication[]>(`${this.base}/member/membership-applications`);
  }

  submitApplication(payload: Record<string, unknown>): Observable<MembershipApplication> {
    return this.http.post<MembershipApplication>(
      `${this.base}/member/membership-applications`,
      payload,
    );
  }

  uploadApplicationDocuments(id: number, nid: File | null, ownership: File | null): Observable<unknown> {
    const form = new FormData();
    if (nid) form.append('nid_document', nid);
    if (ownership) form.append('ownership_document', ownership);
    return this.http.post(`${this.base}/member/membership-applications/${id}/documents`, form);
  }

  adminApplications(status?: string): Observable<MembershipApplication[]> {
    const params = status ? { params: { status_filter: status } } : {};
    return this.http.get<MembershipApplication[]>(`${this.base}/admin/membership-applications`, params);
  }

  adminApplication(id: number): Observable<MembershipApplication> {
    return this.http.get<MembershipApplication>(`${this.base}/admin/membership-applications/${id}`);
  }

  startReview(id: number): Observable<MembershipApplication> {
    return this.http.post<MembershipApplication>(
      `${this.base}/admin/membership-applications/${id}/start-review`,
      {},
    );
  }

  approveApplication(id: number, memberClass: string): Observable<MembershipApplication> {
    return this.http.post<MembershipApplication>(
      `${this.base}/admin/membership-applications/${id}/approve`,
      { member_class: memberClass },
    );
  }

  rejectApplication(id: number, reason: string): Observable<MembershipApplication> {
    return this.http.post<MembershipApplication>(
      `${this.base}/admin/membership-applications/${id}/reject`,
      { reason },
    );
  }

  applicationLetter(id: number): Observable<Blob> {
    return this.http.get(`${this.base}/admin/membership-applications/${id}/letter.pdf`, {
      responseType: 'blob',
    });
  }

  // --- fee waivers ------------------------------------------------------
  myWaivers(): Observable<FeeWaiver[]> {
    return this.http.get<FeeWaiver[]>(`${this.base}/member/fee-waivers`);
  }

  applyWaiver(payload: { type: string; reason: string; months?: number }): Observable<FeeWaiver> {
    return this.http.post<FeeWaiver>(`${this.base}/member/fee-waivers`, payload);
  }

  adminWaivers(status?: string): Observable<FeeWaiver[]> {
    const params = status ? { params: { status_filter: status } } : {};
    return this.http.get<FeeWaiver[]>(`${this.base}/admin/fee-waivers`, params);
  }

  decideWaiver(id: number, status: 'approved' | 'rejected', note?: string): Observable<FeeWaiver> {
    return this.http.post<FeeWaiver>(`${this.base}/admin/fee-waivers/${id}/decide`, { status, note });
  }

  // --- membership actions (suspension / termination) ---------------------
  myActions(): Observable<MembershipAction[]> {
    return this.http.get<MembershipAction[]>(`${this.base}/member/membership-actions`);
  }

  respondToAction(id: number, response: string): Observable<MembershipAction> {
    return this.http.post<MembershipAction>(
      `${this.base}/member/membership-actions/${id}/response`,
      { response },
    );
  }

  adminActions(status?: string): Observable<MembershipAction[]> {
    const params = status ? { params: { status_filter: status } } : {};
    return this.http.get<MembershipAction[]>(`${this.base}/admin/membership-actions`, params);
  }

  suspensionNotice(memberId: number, reason: string): Observable<MembershipAction> {
    return this.http.post<MembershipAction>(
      `${this.base}/admin/member-governance/${memberId}/suspension-notice`,
      { reason },
    );
  }

  suspendMember(memberId: number, reason: string): Observable<MembershipAction> {
    return this.http.post<MembershipAction>(
      `${this.base}/admin/member-governance/${memberId}/suspend`,
      { reason },
    );
  }

  noticeAction(id: number): Observable<MembershipAction> {
    return this.http.post<MembershipAction>(
      `${this.base}/admin/membership-actions/${id}/notice`,
      {},
    );
  }

  decideAction(id: number, decision: string, confirmAction: boolean): Observable<MembershipAction> {
    return this.http.post<MembershipAction>(
      `${this.base}/admin/membership-actions/${id}/decide`,
      { decision, confirm_action: confirmAction },
    );
  }

  cancelAction(id: number): Observable<MembershipAction> {
    return this.http.post<MembershipAction>(
      `${this.base}/admin/membership-actions/${id}/cancel`,
      {},
    );
  }

  // --- appeals -----------------------------------------------------------
  myAppeals(): Observable<MembershipAppeal[]> {
    return this.http.get<MembershipAppeal[]>(`${this.base}/member/appeals`);
  }

  fileAppeal(payload: { application_id?: number; membership_action_id?: number; grounds: string }): Observable<MembershipAppeal> {
    return this.http.post<MembershipAppeal>(`${this.base}/member/appeals`, payload);
  }

  adminAppeals(status?: string): Observable<MembershipAppeal[]> {
    const params = status ? { params: { status_filter: status } } : {};
    return this.http.get<MembershipAppeal[]>(`${this.base}/admin/appeals`, params);
  }

  assignAppeal(id: number, reviewerAdminId: number): Observable<MembershipAppeal> {
    return this.http.post<MembershipAppeal>(`${this.base}/admin/appeals/${id}/assign`, {
      reviewer_admin_id: reviewerAdminId,
    });
  }

  decideAppeal(id: number, status: 'upheld' | 'overturned', decision: string): Observable<MembershipAppeal> {
    return this.http.post<MembershipAppeal>(`${this.base}/admin/appeals/${id}/decide`, {
      status,
      decision,
    });
  }

  // --- data correction requests ------------------------------------------
  myCorrections(): Observable<DataCorrectionRequest[]> {
    return this.http.get<DataCorrectionRequest[]>(`${this.base}/member/data-correction-requests`);
  }

  requestCorrection(payload: { field: string; requested_value: string; reason: string }): Observable<DataCorrectionRequest> {
    return this.http.post<DataCorrectionRequest>(
      `${this.base}/member/data-correction-requests`,
      payload,
    );
  }

  adminCorrections(status?: string): Observable<DataCorrectionRequest[]> {
    const params = status ? { params: { status_filter: status } } : {};
    return this.http.get<DataCorrectionRequest[]>(
      `${this.base}/admin/data-correction-requests`,
      params,
    );
  }

  decideCorrection(id: number, status: 'applied' | 'rejected', adminNote?: string): Observable<DataCorrectionRequest> {
    return this.http.post<DataCorrectionRequest>(
      `${this.base}/admin/data-correction-requests/${id}/decide`,
      { status, admin_note: adminNote },
    );
  }

  // --- arrears -------------------------------------------------------------
  membersArrears(): Observable<{ base_monthly: number; items: ArrearItem[] }> {
    return this.http.get<{ base_monthly: number; items: ArrearItem[] }>(
      `${this.base}/admin/members-arrears`,
    );
  }

  myDocuments(): Observable<{ documents: MyDocument[] }> {
    return this.http.get<{ documents: MyDocument[] }>(`${this.base}/member/my-documents`);
  }

  // --- complaints -----------------------------------------------------------
  createComplaint(payload: { category: string; subject: string; details: string; accused_admin_id?: number }): Observable<Complaint> {
    return this.http.post<Complaint>(`${this.base}/member/complaints`, payload);
  }

  submitLandComplaint(formData: Record<string, unknown>, evidence: File | null): Observable<Complaint> {
    const form = new FormData();
    form.append('form_data', JSON.stringify(formData));
    if (evidence) form.append('evidence', evidence);
    return this.http.post<Complaint>(`${this.base}/member/complaints/land-protection`, form);
  }

  myComplaints(): Observable<Complaint[]> {
    return this.http.get<Complaint[]>(`${this.base}/member/complaints`);
  }

  myComplaint(id: number): Observable<Complaint> {
    return this.http.get<Complaint>(`${this.base}/member/complaints/${id}`);
  }

  landFormPdf(id: number): Observable<Blob> {
    return this.http.get(`${this.base}/member/complaints/${id}/land-form.pdf`, {
      responseType: 'blob',
    });
  }

  adminComplaints(status?: string): Observable<Complaint[]> {
    const params = status ? { params: { status_filter: status } } : {};
    return this.http.get<Complaint[]>(`${this.base}/admin/complaints`, params);
  }

  adminComplaint(id: number): Observable<Complaint> {
    return this.http.get<Complaint>(`${this.base}/admin/complaints/${id}`);
  }

  acknowledgeComplaint(id: number): Observable<Complaint> {
    return this.http.post<Complaint>(`${this.base}/admin/complaints/${id}/acknowledge`, {});
  }

  assignComplaint(id: number, adminId: number): Observable<Complaint> {
    return this.http.post<Complaint>(`${this.base}/admin/complaints/${id}/assign`, {
      admin_id: adminId,
    });
  }

  updateComplaint(id: number, note: string): Observable<Complaint> {
    return this.http.post<Complaint>(`${this.base}/admin/complaints/${id}/update`, { note });
  }

  resolveComplaint(id: number, resolutionNote: string): Observable<Complaint> {
    return this.http.post<Complaint>(`${this.base}/admin/complaints/${id}/resolve`, {
      resolution_note: resolutionNote,
    });
  }

  closeComplaint(id: number): Observable<Complaint> {
    return this.http.post<Complaint>(`${this.base}/admin/complaints/${id}/close`, {});
  }

  complaintLetter(id: number): Observable<Blob> {
    return this.http.get(`${this.base}/admin/complaints/${id}/letter.pdf`, {
      responseType: 'blob',
    });
  }

  /** Authenticated evidence/document download that does NOT go through the
   * public /uploads URL - returns the raw bytes for a saveBlob helper. */
  downloadDocument(url: string): Observable<Blob> {
    return this.http.get(url.startsWith('/api') ? url : `${this.base}${url}`, {
      responseType: 'blob',
    });
  }
}
