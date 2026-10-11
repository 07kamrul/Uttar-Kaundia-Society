import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Module 2 - কমিটি/পরিষদ রেজিস্ট্রি (backend: app/api/routes/committee_registry.py). */

export type TermStatus = 'active' | 'expired' | 'caretaker' | 'vacant';
export type VacancyType = 'resignation' | 'removal';
export type VacancyStatus =
  | 'pending_acknowledgement'
  | 'investigation'
  | 'acknowledged'
  | 'decided';

export interface MemberBrief {
  id: number;
  fullName: string;
  memberId: string | null;
}

export interface TermInfo {
  id: number;
  postKey: string;
  memberId: number | null;
  termStart: string;
  termEnd: string | null;
  isCaretaker: boolean;
  status: TermStatus;
  replacedByTermId: number | null;
  notes: string | null;
  createdAt: string | null;
}

export interface PostVacancy {
  id: number;
  postKey: string;
  termId: number | null;
  member: MemberBrief | null;
  memberId: number | null;
  vacancyType: VacancyType;
  status: VacancyStatus;
  note: string | null;
  investigationNote: string | null;
  responseDeadline: string | null;
  memberResponse: string | null;
  memberRespondedAt: string | null;
  decision: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string | null;
  /** Present only on the admin vacancies list (sla_status from governance). */
  responseSla?: SlaInfo | null;
}

export interface SlaInfo {
  state: 'on_track' | 'due_soon' | 'overdue' | 'met';
  days_remaining: number;
}

export interface RegistryPost {
  key: string;
  bn: string;
  en: string;
  council: string;
  holder: MemberBrief | null;
  term: TermInfo | null;
  status: TermStatus;
  routineWorkOnly: boolean;
  warning: string | null;
  openVacancy: boolean;
}

export interface RegistryOverview {
  posts: RegistryPost[];
  openVacancies: PostVacancy[];
  today: string;
}

export interface PostHistory {
  postKey: string;
  items: Array<TermInfo & { holder: MemberBrief | null }>;
}

export interface VacancyPage {
  total: number;
  items: PostVacancy[];
  today: string;
}

export interface TermCreateInput {
  postKey: string;
  memberId: number;
  termStart: string;
  termEnd?: string | null;
  isCaretaker?: boolean;
  notes?: string | null;
}

export interface TermUpdateInput {
  termStart?: string;
  termEnd?: string | null;
  isCaretaker?: boolean;
  notes?: string | null;
}

// --- snake_case API shapes ---------------------------------------------------

interface MemberBriefApi {
  id: number;
  full_name: string;
  member_id: string | null;
}

interface TermApi {
  id: number;
  post_key: string;
  member_id: number | null;
  term_start: string;
  term_end: string | null;
  is_caretaker: boolean;
  status: TermStatus;
  replaced_by_term_id: number | null;
  notes: string | null;
  created_at: string | null;
}

interface VacancyApi {
  id: number;
  post_key: string;
  term_id: number | null;
  member: MemberBriefApi | null;
  member_id: number | null;
  vacancy_type: VacancyType;
  status: VacancyStatus;
  note: string | null;
  investigation_note: string | null;
  response_deadline: string | null;
  member_response: string | null;
  member_responded_at: string | null;
  decision: string | null;
  decision_note: string | null;
  decided_at: string | null;
  acknowledged_at: string | null;
  created_at: string | null;
  response_sla?: SlaInfo | null;
}

interface PostApi {
  key: string;
  bn: string;
  en: string;
  council: string;
  holder: MemberBriefApi | null;
  term: TermApi | null;
  status: TermStatus;
  routine_work_only: boolean;
  warning: string | null;
  open_vacancy: boolean;
}

function toMemberBrief(api: MemberBriefApi | null): MemberBrief | null {
  return api ? { id: api.id, fullName: api.full_name, memberId: api.member_id } : null;
}

function toTerm(api: TermApi): TermInfo {
  return {
    id: api.id,
    postKey: api.post_key,
    memberId: api.member_id,
    termStart: api.term_start,
    termEnd: api.term_end,
    isCaretaker: api.is_caretaker,
    status: api.status,
    replacedByTermId: api.replaced_by_term_id,
    notes: api.notes,
    createdAt: api.created_at,
  };
}

function toVacancy(api: VacancyApi): PostVacancy {
  return {
    id: api.id,
    postKey: api.post_key,
    termId: api.term_id,
    member: toMemberBrief(api.member),
    memberId: api.member_id,
    vacancyType: api.vacancy_type,
    status: api.status,
    note: api.note,
    investigationNote: api.investigation_note,
    responseDeadline: api.response_deadline,
    memberResponse: api.member_response,
    memberRespondedAt: api.member_responded_at,
    decision: api.decision,
    decisionNote: api.decision_note,
    decidedAt: api.decided_at,
    acknowledgedAt: api.acknowledged_at,
    createdAt: api.created_at,
    responseSla: api.response_sla ?? null,
  };
}

@Injectable({ providedIn: 'root' })
export class CommitteeRegistryService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** Current holder per post + open vacancies + expired-term warnings. */
  overview(): Observable<RegistryOverview> {
    return this.http
      .get<{ posts: PostApi[]; open_vacancies: VacancyApi[]; today: string }>(
        `${this.base}/committee-registry`,
      )
      .pipe(
        map((api) => ({
          posts: api.posts.map((post) => ({
            key: post.key,
            bn: post.bn,
            en: post.en,
            council: post.council,
            holder: toMemberBrief(post.holder),
            term: post.term ? toTerm(post.term) : null,
            status: post.status,
            routineWorkOnly: post.routine_work_only,
            warning: post.warning,
            openVacancy: post.open_vacancy,
          })),
          openVacancies: api.open_vacancies.map(toVacancy),
          today: api.today,
        })),
      );
  }

  postHistory(postKey: string): Observable<PostHistory> {
    return this.http
      .get<{ post_key: string; items: Array<TermApi & { holder: MemberBriefApi | null }> }>(
        `${this.base}/committee-registry/posts/${postKey}/history`,
      )
      .pipe(
        map((api) => ({
          postKey: api.post_key,
          items: api.items.map((item) => ({ ...toTerm(item), holder: toMemberBrief(item.holder) })),
        })),
      );
  }

  /** All vacancies incl. decided ones - admin only, carries response SLA. */
  vacancies(): Observable<VacancyPage> {
    return this.http
      .get<{ total: number; items: VacancyApi[]; today: string }>(
        `${this.base}/committee-registry/vacancies`,
      )
      .pipe(map((api) => ({ total: api.total, items: api.items.map(toVacancy), today: api.today })));
  }

  createTerm(input: TermCreateInput): Observable<TermInfo> {
    return this.http
      .post<TermApi>(`${this.base}/committee-registry/terms`, {
        post_key: input.postKey,
        member_id: input.memberId,
        term_start: input.termStart,
        term_end: input.termEnd || null,
        is_caretaker: input.isCaretaker ?? false,
        notes: input.notes || null,
      })
      .pipe(map(toTerm));
  }

  updateTerm(termId: number, changes: TermUpdateInput): Observable<TermInfo> {
    return this.http
      .put<TermApi>(`${this.base}/committee-registry/terms/${termId}`, {
        term_start: changes.termStart,
        term_end: changes.termEnd || null,
        is_caretaker: changes.isCaretaker,
        notes: changes.notes || null,
      })
      .pipe(map(toTerm));
  }

  /** Member self-service (no member_id) or admin-recorded (member_id set). */
  submitResignation(postKey: string, note: string, memberId?: number): Observable<PostVacancy> {
    return this.http
      .post<VacancyApi>(`${this.base}/committee-registry/posts/${postKey}/resignation`, {
        note: note || null,
        member_id: memberId ?? null,
      })
      .pipe(map(toVacancy));
  }

  acknowledgeVacancy(vacancyId: number): Observable<PostVacancy> {
    return this.http
      .post<VacancyApi>(`${this.base}/committee-registry/vacancies/${vacancyId}/acknowledge`, {})
      .pipe(map(toVacancy));
  }

  issueRemovalNotice(vacancyId: number, investigationNote: string): Observable<PostVacancy> {
    return this.http
      .post<VacancyApi>(`${this.base}/committee-registry/vacancies/${vacancyId}/removal-notice`, {
        investigation_note: investigationNote,
      })
      .pipe(map(toVacancy));
  }

  submitMemberResponse(vacancyId: number, response: string): Observable<PostVacancy> {
    return this.http
      .post<VacancyApi>(`${this.base}/committee-registry/vacancies/${vacancyId}/member-response`, {
        response,
      })
      .pipe(map(toVacancy));
  }

  decideVacancy(vacancyId: number, decision: 'removed' | 'retained', note: string): Observable<PostVacancy> {
    return this.http
      .post<VacancyApi>(`${this.base}/committee-registry/vacancies/${vacancyId}/decide`, {
        decision,
        note: note || null,
      })
      .pipe(map(toVacancy));
  }
}
