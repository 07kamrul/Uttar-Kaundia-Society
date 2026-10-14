import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PhoneFix {
  id: number;
  entityType: string;
  field: string;
  rawValue: string;
  memberCode: string | null;
  memberName: string | null;
}

interface PhoneFixApi {
  id: number;
  entity_type: string;
  field: string;
  raw_value: string;
  member_code: string | null;
  member_name: string | null;
}

/** Stored phone numbers the E.164 migration could not convert (member.manage). */
@Injectable({ providedIn: 'root' })
export class PhoneFixService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin/phone-fixes`;

  list(): Observable<PhoneFix[]> {
    return this.http.get<PhoneFixApi[]>(this.base).pipe(
      map((rows) =>
        rows.map((r) => ({
          id: r.id,
          entityType: r.entity_type,
          field: r.field,
          rawValue: r.raw_value,
          memberCode: r.member_code ?? null,
          memberName: r.member_name ?? null,
        })),
      ),
    );
  }

  resolve(id: number, mobile: string): Observable<unknown> {
    return this.http.put(`${this.base}/${id}`, { mobile });
  }
}
