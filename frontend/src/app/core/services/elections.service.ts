import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Module 2 - নির্বাচন (backend: app/api/routes/elections.py).
 * Lifecycle: draft → nominations_open → nominations_closed (voter snapshot
 * FROZEN) → voting → tabulated → confirmed / cancelled. */

export type ElectionStatus =
  | 'draft'
  | 'nominations_open'
  | 'nominations_closed'
  | 'voting'
  | 'tabulated'
  | 'confirmed'
  | 'cancelled';

export type NominationStatus = 'pending' | 'approved' | 'rejected';
export type ElectionComplaintStatus = 'submitted' | 'resolved' | 'rejected';

export interface Election {
  id: number;
  title: string;
  nominationStart: string;
  nominationEnd: string;
  votingStart: string;
  votingEnd: string;
  status: ElectionStatus;
  confirmedAt: string | null;
  createdAt: string | null;
  /** Present on snapshot-bearing responses (close-nominations, admin detail). */
  eligibleVoters?: number | null;
}

export interface AdminNomination {
  id: number;
  postKey: string;
  memberId: number;
  memberName: string | null;
  status: NominationStatus;
  statement: string | null;
  createdAt: string | null;
}

export interface CountCandidate {
  nominationId: number;
  memberId: number;
  votes: number;
  /** Present in the member-view results (admin counts carry ids only). */
  name?: string | null;
}

export interface PostCounts {
  postKey: string;
  candidates: CountCandidate[];
  votesTotal: number;
}

export interface ElectionComplaint {
  id: number;
  complainantMemberId: number;
  against: string | null;
  subject: string;
  details: string;
  status: ElectionComplaintStatus;
  resolution: string | null;
  createdAt: string | null;
}

export interface ElectionAdminDetail extends Election {
  nominations: AdminNomination[];
  counts: PostCounts[];
  complaints: ElectionComplaint[];
}

/** GET /elections/{id}/me - the member's own view. */
export interface MyElection extends Election {
  today: string;
  eligible: boolean;
  eligibilitySource: 'live' | 'snapshot';
  myNominations: Array<{ id: number; postKey: string; status: NominationStatus }>;
  votedPosts: string[];
  /** Approved candidate roster once nominations close (names + ids only). */
  candidates: Array<{ postKey: string; candidates: Array<{ nominationId: number; memberId: number; name: string | null }> }> | null;
  results: PostCounts[] | null;
}

export interface ElectionPage {
  items: Election[];
  today: string;
}

export interface ElectionCreateInput {
  title: string;
  nominationStart: string;
  nominationEnd: string;
  votingStart: string;
  votingEnd: string;
}

// --- snake_case API shapes ---------------------------------------------------

interface ElectionApi {
  id: number;
  title: string;
  nomination_start: string;
  nomination_end: string;
  voting_start: string;
  voting_end: string;
  status: ElectionStatus;
  confirmed_at: string | null;
  created_at: string | null;
  eligible_voters?: number | null;
}

interface CountCandidateApi {
  nomination_id: number;
  member_id: number;
  votes: number;
}

function toElection(api: ElectionApi): Election {
  return {
    id: api.id,
    title: api.title,
    nominationStart: api.nomination_start,
    nominationEnd: api.nomination_end,
    votingStart: api.voting_start,
    votingEnd: api.voting_end,
    status: api.status,
    confirmedAt: api.confirmed_at,
    createdAt: api.created_at,
    eligibleVoters: api.eligible_voters ?? null,
  };
}

function toCounts(input: Record<string, { candidates: Array<CountCandidateApi & { name?: string | null }>; votes_total: number }>): PostCounts[] {
  return Object.entries(input ?? {}).map(([postKey, bucket]) => ({
    postKey,
    candidates: (bucket.candidates ?? []).map((c) => ({
      nominationId: c.nomination_id,
      memberId: c.member_id,
      votes: c.votes,
      name: (c as { name?: string | null }).name ?? null,
    })),
    votesTotal: bucket.votes_total,
  }));
}

@Injectable({ providedIn: 'root' })
export class ElectionsService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  // --- admin lifecycle ---------------------------------------------------

  createElection(input: ElectionCreateInput): Observable<Election> {
    return this.http
      .post<ElectionApi>(`${this.base}/elections`, {
        title: input.title,
        nomination_start: input.nominationStart,
        nomination_end: input.nominationEnd,
        voting_start: input.votingStart,
        voting_end: input.votingEnd,
      })
      .pipe(map(toElection));
  }

  listElections(): Observable<ElectionPage> {
    return this.http
      .get<{ items: ElectionApi[]; today: string }>(`${this.base}/elections`)
      .pipe(map((api) => ({ items: api.items.map(toElection), today: api.today })));
  }

  openNominations(electionId: number): Observable<Election> {
    return this.http
      .post<ElectionApi>(`${this.base}/elections/${electionId}/open-nominations`, {})
      .pipe(map(toElection));
  }

  /** Closing nominations FREEZES the voter list (snapshot). */
  closeNominations(electionId: number): Observable<Election> {
    return this.http
      .post<ElectionApi>(`${this.base}/elections/${electionId}/close-nominations`, {})
      .pipe(map(toElection));
  }

  decideNomination(nominationId: number, approved: boolean): Observable<{ id: number; status: NominationStatus; postKey: string; memberId: number }> {
    return this.http
      .post<{
        id: number;
        status: NominationStatus;
        post_key: string;
        member_id: number;
      }>(`${this.base}/elections/nominations/${nominationId}/decide`, { approved })
      .pipe(
        map((api) => ({
          id: api.id,
          status: api.status,
          postKey: api.post_key,
          memberId: api.member_id,
        })),
      );
  }

  openVoting(electionId: number): Observable<Election> {
    return this.http
      .post<ElectionApi>(`${this.base}/elections/${electionId}/open-voting`, {})
      .pipe(map(toElection));
  }

  tabulate(electionId: number): Observable<Election> {
    return this.http
      .post<ElectionApi>(`${this.base}/elections/${electionId}/tabulate`, {})
      .pipe(map(toElection));
  }

  confirmResults(electionId: number): Observable<Election> {
    return this.http
      .post<ElectionApi>(`${this.base}/elections/${electionId}/confirm`, {})
      .pipe(map(toElection));
  }

  cancelElection(electionId: number): Observable<Election> {
    return this.http
      .post<ElectionApi>(`${this.base}/elections/${electionId}/cancel`, {})
      .pipe(map(toElection));
  }

  adminDetail(electionId: number): Observable<ElectionAdminDetail> {
    return this.http
      .get<ElectionApi & {
        nominations: Array<{
          id: number;
          post_key: string;
          member_id: number;
          member_name: string | null;
          status: NominationStatus;
          statement: string | null;
          created_at: string | null;
        }>;
        counts: Record<string, { candidates: CountCandidateApi[]; votes_total: number }>;
        complaints: Array<{
          id: number;
          complainant_member_id: number;
          against: string | null;
          subject: string;
          details: string;
          status: ElectionComplaintStatus;
          resolution: string | null;
          created_at: string | null;
        }>;
      }>(`${this.base}/elections/${electionId}/admin`)
      .pipe(
        map((api) => ({
          ...toElection(api),
          nominations: api.nominations.map((n) => ({
            id: n.id,
            postKey: n.post_key,
            memberId: n.member_id,
            memberName: n.member_name,
            status: n.status,
            statement: n.statement,
            createdAt: n.created_at,
          })),
          counts: toCounts(api.counts),
          complaints: api.complaints.map((c) => ({
            id: c.id,
            complainantMemberId: c.complainant_member_id,
            against: c.against,
            subject: c.subject,
            details: c.details,
            status: c.status,
            resolution: c.resolution,
            createdAt: c.created_at,
          })),
        })),
      );
  }

  /** Server-rendered result sheet (after tabulation only). */
  resultSheetPdf(electionId: number): Observable<Blob> {
    return this.http.get(`${this.base}/elections/${electionId}/result-sheet.pdf`, {
      responseType: 'blob',
    });
  }

  decideComplaint(complaintId: number, status: 'resolved' | 'rejected', resolution: string): Observable<{ id: number; status: ElectionComplaintStatus }> {
    return this.http
      .post<{ id: number; status: ElectionComplaintStatus }>(
        `${this.base}/elections/complaints/${complaintId}/decide`,
        { status, resolution },
      );
  }

  // --- member endpoints ----------------------------------------------------

  myElection(electionId: number): Observable<MyElection> {
    return this.http
      .get<ElectionApi & {
        today: string;
        eligible: boolean;
        eligibility_source: 'live' | 'snapshot';
        my_nominations: Array<{ id: number; post_key: string; status: NominationStatus }>;
        voted_posts: string[];
        candidates: Array<{
          post_key: string;
          candidates: Array<{ nomination_id: number; member_id: number; name: string | null }>;
        }> | null;
        results: Record<string, { candidates: CountCandidateApi[]; votes_total: number }> | null;
      }>(`${this.base}/elections/${electionId}/me`)
      .pipe(
        map((api) => ({
          ...toElection(api),
          today: api.today,
          eligible: api.eligible,
          eligibilitySource: api.eligibility_source,
          myNominations: api.my_nominations.map((n) => ({
            id: n.id,
            postKey: n.post_key,
            status: n.status,
          })),
          votedPosts: api.voted_posts,
          candidates: api.candidates
            ? api.candidates.map((bucket) => ({
                postKey: bucket.post_key,
                candidates: bucket.candidates.map((c) => ({
                  nominationId: c.nomination_id,
                  memberId: c.member_id,
                  name: c.name,
                })),
              }))
            : null,
          results: api.results ? toCounts(api.results) : null,
        })),
      );
  }

  nominateSelf(electionId: number, postKey: string, statement: string): Observable<{ id: number; postKey: string; status: NominationStatus }> {
    return this.http
      .post<{ id: number; post_key: string; status: NominationStatus }>(
        `${this.base}/elections/${electionId}/nominations`,
        { post_key: postKey, statement: statement || null },
      )
      .pipe(
        map((api) => ({ id: api.id, postKey: api.post_key, status: api.status })),
      );
  }

  /** One SECRET ballot per post. 409 on duplicate/closed, 403 ineligible. */
  castVote(electionId: number, postKey: string, nominationId: number): Observable<{ voted: boolean; postKey: string }> {
    return this.http
      .post<{ voted: boolean; post_key: string }>(`${this.base}/elections/${electionId}/vote`, {
        post_key: postKey,
        nomination_id: nominationId,
      })
      .pipe(map((api) => ({ voted: api.voted, postKey: api.post_key })));
  }

  fileComplaint(electionId: number, subject: string, details: string, against?: string): Observable<{ id: number; status: ElectionComplaintStatus }> {
    return this.http
      .post<{ id: number; status: ElectionComplaintStatus }>(
        `${this.base}/elections/${electionId}/complaints`,
        { subject, details, against: against || null },
      );
  }
}
