import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import type { SubmissionDetail } from '../../../../core/models/admin.model';
import { toSubmissionDetail, type SubmissionDetailApiModel } from '../../../../core/services/admin.service';

/**
 * Review-time edits on a pending submission. Kept out of AdminService so the
 * always-loaded bundle does not carry them.
 */
@Injectable({ providedIn: 'root' })
export class SubmissionReviewService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin/submissions`;

  /** Office fills in the dag a member did not know (needs membership.review). */
  fillDag(
    id: string,
    propertyId: string,
    dag: { dagNoCs: string | null; dagNoRs: string | null },
  ): Observable<SubmissionDetail> {
    return this.http
      .patch<SubmissionDetailApiModel>(`${this.base}/${id}/properties/${propertyId}/dag`, {
        dag_no_cs: dag.dagNoCs,
        dag_no_rs: dag.dagNoRs,
      })
      .pipe(map(toSubmissionDetail));
  }

  /** Upload a member photo on the member's behalf. */
  uploadPhoto(id: string, file: File): Observable<SubmissionDetail> {
    const body = new FormData();
    body.append('memberPhoto', file);
    return this.http
      .put<SubmissionDetailApiModel>(`${this.base}/${id}/photo`, body)
      .pipe(map(toSubmissionDetail));
  }
}
