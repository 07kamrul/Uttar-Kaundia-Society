import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AmendmentStatus = 'draft' | 'submitted' | 'scheduled' | 'adopted' | 'rejected' | 'withdrawn';
export type MajorityType = 'simple' | 'four_fifths';

export interface AmendmentConstants {
  dissolution_notice_bn: string;
  majority_types: MajorityType[];
  proposal_no_prefix: string;
}

export interface ConstitutionVersion {
  id: number;
  versionNo: number;
  fullText: string;
  changesSummary: string | null;
  adoptedAt: string | null;
  sourceAmendmentId: number | null;
  isCurrent: boolean;
  createdAt: string;
}

export interface AmendmentProposal {
  id: number;
  proposalNo: string;
  title: string;
  rationale: string;
  proposedText: string;
  currentVersionId: number | null;
  proposedByMemberId: number | null;
  proposedByMemberName: string | null;
  proposedByAdminId: number | null;
  status: AmendmentStatus;
  isDissolution: boolean;
  meetingId: number | null;
  meetingNo: string | null;
  meetingDate: string | null;
  meetingNoticePublishedAt: string | null;
  votesFor: number | null;
  votesAgainst: number | null;
  votesAbstain: number | null;
  requiredMajority: MajorityType;
  decidedAt: string | null;
  decisionNote: string | null;
  adoptedVersionNo: number | null;
  createdAt: string;
}

export interface ProposalInput {
  title: string;
  rationale: string;
  proposedText: string;
  isDissolution: boolean;
}

interface ProposalApiModel {
  id: number;
  proposal_no: string;
  title: string;
  rationale: string;
  proposed_text: string;
  current_version_id: number | null;
  proposed_by_member_id: number | null;
  proposed_by_member_name: string | null;
  proposed_by_admin_id: number | null;
  status: AmendmentStatus;
  is_dissolution: boolean;
  meeting_id: number | null;
  meeting_no: string | null;
  meeting_date: string | null;
  meeting_notice_published_at: string | null;
  votes_for: number | null;
  votes_against: number | null;
  votes_abstain: number | null;
  required_majority: MajorityType;
  decided_at: string | null;
  decision_note: string | null;
  adopted_version_no: number | null;
  created_at: string;
}

interface VersionApiModel {
  id: number;
  version_no: number;
  full_text: string;
  changes_summary: string | null;
  adopted_at: string | null;
  source_amendment_id: number | null;
  is_current: boolean;
  created_at: string;
}

function toProposal(api: ProposalApiModel): AmendmentProposal {
  return {
    id: api.id,
    proposalNo: api.proposal_no,
    title: api.title,
    rationale: api.rationale,
    proposedText: api.proposed_text,
    currentVersionId: api.current_version_id,
    proposedByMemberId: api.proposed_by_member_id,
    proposedByMemberName: api.proposed_by_member_name,
    proposedByAdminId: api.proposed_by_admin_id,
    status: api.status,
    isDissolution: api.is_dissolution,
    meetingId: api.meeting_id,
    meetingNo: api.meeting_no,
    meetingDate: api.meeting_date,
    meetingNoticePublishedAt: api.meeting_notice_published_at,
    votesFor: api.votes_for,
    votesAgainst: api.votes_against,
    votesAbstain: api.votes_abstain,
    requiredMajority: api.required_majority,
    decidedAt: api.decided_at,
    decisionNote: api.decision_note,
    adoptedVersionNo: api.adopted_version_no,
    createdAt: api.created_at,
  };
}

function toVersion(api: VersionApiModel): ConstitutionVersion {
  return {
    id: api.id,
    versionNo: api.version_no,
    fullText: api.full_text,
    changesSummary: api.changes_summary,
    adoptedAt: api.adopted_at,
    sourceAmendmentId: api.source_amendment_id,
    isCurrent: api.is_current,
    createdAt: api.created_at,
  };
}

@Injectable({ providedIn: 'root' })
export class AmendmentsService {
  private readonly adminBase = `${environment.apiBaseUrl}/admin`;
  private readonly memberBase = `${environment.apiBaseUrl}/member`;
  private readonly base = `${environment.apiBaseUrl}`;

  constructor(private http: HttpClient) {}

  constants(): Observable<AmendmentConstants> {
    return this.http.get<AmendmentConstants>(`${this.base}/amendments/constants`);
  }

  versions(): Observable<ConstitutionVersion[]> {
    return this.http
      .get<VersionApiModel[]>(`${this.base}/amendments/versions`)
      .pipe(map((rows) => rows.map(toVersion)));
  }

  // ----- Member (amendment.propose) -----

  myProposals(): Observable<AmendmentProposal[]> {
    return this.http
      .get<ProposalApiModel[]>(`${this.memberBase}/amendments/proposals`)
      .pipe(map((rows) => rows.map(toProposal)));
  }

  createProposal(input: ProposalInput): Observable<AmendmentProposal> {
    return this.http
      .post<ProposalApiModel>(`${this.memberBase}/amendments/proposals`, {
        title: input.title,
        rationale: input.rationale,
        proposed_text: input.proposedText,
        is_dissolution: input.isDissolution,
      })
      .pipe(map(toProposal));
  }

  withdrawProposal(id: number): Observable<AmendmentProposal> {
    return this.http
      .post<ProposalApiModel>(`${this.memberBase}/amendments/proposals/${id}/withdraw`, {})
      .pipe(map(toProposal));
  }

  // ----- Admin (amendment.manage) -----

  adminProposals(status?: AmendmentStatus): Observable<AmendmentProposal[]> {
    return this.http
      .get<ProposalApiModel[]>(`${this.adminBase}/amendments/proposals`, {
        params: status ? { status } : {},
      })
      .pipe(map((rows) => rows.map(toProposal)));
  }

  adminCreateProposal(input: ProposalInput): Observable<AmendmentProposal> {
    return this.http
      .post<ProposalApiModel>(`${this.adminBase}/amendments/proposals`, {
        title: input.title,
        rationale: input.rationale,
        proposed_text: input.proposedText,
        is_dissolution: input.isDissolution,
      })
      .pipe(map(toProposal));
  }

  attachMeeting(id: number, meetingId: number): Observable<AmendmentProposal> {
    return this.http
      .post<ProposalApiModel>(`${this.adminBase}/amendments/proposals/${id}/attach-meeting`, {
        meeting_id: meetingId,
      })
      .pipe(map(toProposal));
  }

  decide(id: number, votesFor: number, votesAgainst: number, votesAbstain: number): Observable<AmendmentProposal> {
    return this.http
      .post<ProposalApiModel>(`${this.adminBase}/amendments/proposals/${id}/decide`, {
        votes_for: votesFor,
        votes_against: votesAgainst,
        votes_abstain: votesAbstain,
      })
      .pipe(map(toProposal));
  }

  reject(id: number, reason: string): Observable<AmendmentProposal> {
    return this.http
      .post<ProposalApiModel>(`${this.adminBase}/amendments/proposals/${id}/reject`, {
        reason,
      })
      .pipe(map(toProposal));
  }

  seedInitialVersion(fullText: string, changesSummary?: string): Observable<ConstitutionVersion> {
    return this.http
      .post<VersionApiModel>(`${this.adminBase}/amendments/versions/seed`, {
        full_text: fullText,
        changes_summary: changesSummary ?? null,
      })
      .pipe(map(toVersion));
  }

  downloadCertificate(id: number): Observable<Blob> {
    return this.http.get(`${this.adminBase}/amendments/proposals/${id}/certificate.pdf`, {
      responseType: 'blob',
    });
  }
}
