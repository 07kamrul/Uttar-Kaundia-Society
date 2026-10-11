import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { SlaInfo } from './committee-registry.service';

/** Module 3 - বিশেষ সভার পিটিশন (backend: app/api/routes/petitions.py).
 * >= 20% of eligible members must sign; the committee responds within 30 days. */

export type PetitionStatus = 'submitted' | 'under_review' | 'responded' | 'scheduled' | 'rejected';

export interface PetitionSigner {
  memberId: number;
  signedAt: string;
  name: string | null;
}

export interface Petition {
  id: number;
  petitionNo: string;
  title: string;
  justification: string;
  submittedByMemberId: number;
  signatureCount: number;
  requiredCount: number;
  signers: PetitionSigner[];
  status: PetitionStatus;
  responseDue: string | null;
  sla: SlaInfo | null;
  committeeResponse: string | null;
  respondedAt: string | null;
  meetingId: number | null;
  createdAt: string | null;
}

export interface PetitionPage {
  items: Petition[];
  today: string;
}

export interface PetitionCreateInput {
  title: string;
  justification: string;
}

// --- snake_case API shapes ---------------------------------------------------

interface PetitionApi {
  id: number;
  petition_no: string;
  title: string;
  justification: string;
  submitted_by_member_id: number;
  signature_count: number;
  required_count: number;
  signers: Array<{ member_id: number; signed_at: string; name: string | null }>;
  status: PetitionStatus;
  response_due: string | null;
  sla: SlaInfo | null;
  committee_response: string | null;
  responded_at: string | null;
  meeting_id: number | null;
  created_at: string | null;
}

function toPetition(api: PetitionApi): Petition {
  return {
    id: api.id,
    petitionNo: api.petition_no,
    title: api.title,
    justification: api.justification,
    submittedByMemberId: api.submitted_by_member_id,
    signatureCount: api.signature_count,
    requiredCount: api.required_count,
    signers: (api.signers ?? []).map((s) => ({
      memberId: s.member_id,
      signedAt: s.signed_at,
      name: s.name,
    })),
    status: api.status,
    responseDue: api.response_due,
    sla: api.sla ?? null,
    committeeResponse: api.committee_response,
    respondedAt: api.responded_at,
    meetingId: api.meeting_id,
    createdAt: api.created_at,
  };
}

@Injectable({ providedIn: 'root' })
export class PetitionsService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** The filer signs first - response carries signature_count 1. */
  createPetition(input: PetitionCreateInput): Observable<Petition> {
    return this.http
      .post<PetitionApi>(`${this.base}/petitions`, {
        title: input.title,
        justification: input.justification,
      })
      .pipe(map(toPetition));
  }

  signPetition(petitionId: number): Observable<Petition> {
    return this.http
      .post<PetitionApi>(`${this.base}/petitions/${petitionId}/sign`, {})
      .pipe(map(toPetition));
  }

  myPetitions(): Observable<PetitionPage> {
    return this.http
      .get<{ items: PetitionApi[]; today: string }>(`${this.base}/petitions/mine`)
      .pipe(map((api) => ({ items: api.items.map(toPetition), today: api.today })));
  }

  /** Progress view - filer or any signer (403 otherwise). */
  petitionProgress(petitionId: number): Observable<Petition> {
    return this.http
      .get<PetitionApi>(`${this.base}/petitions/${petitionId}`)
      .pipe(map(toPetition));
  }

  /** Admin inbox. */
  listPetitions(status?: string): Observable<PetitionPage> {
    const params = status ? { params: { petition_status: status } } : {};
    return this.http
      .get<{ items: PetitionApi[]; today: string }>(`${this.base}/petitions`, params)
      .pipe(map((api) => ({ items: api.items.map(toPetition), today: api.today })));
  }

  respondPetition(petitionId: number, committeeResponse: string, scheduled: boolean, meetingId?: number): Observable<Petition> {
    return this.http
      .post<PetitionApi>(`${this.base}/petitions/${petitionId}/respond`, {
        committee_response: committeeResponse,
        scheduled,
        meeting_id: meetingId ?? null,
      })
      .pipe(map(toPetition));
  }

  rejectPetition(petitionId: number, reason: string): Observable<Petition> {
    return this.http
      .post<PetitionApi>(`${this.base}/petitions/${petitionId}/reject`, { reason })
      .pipe(map(toPetition));
  }
}
