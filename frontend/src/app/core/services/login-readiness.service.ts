import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ReadinessMember {
  id: number;
  memberId: string;
  fullName: string;
  status: string;
  hasLogin: boolean;
}

export interface DuplicateGroup {
  /** The shared mobile (or email) the members collide on. */
  mobile: string;
  members: ReadinessMember[];
}

export interface LoginReadiness {
  loginByPhoneEnabled: boolean;
  membersWithLogin: number;
  duplicateMobileGroups: DuplicateGroup[];
  duplicateGroupCount: number;
  unparseableMobiles: Array<{ id: number; memberId: string; raw: string }>;
  openPhoneFixes: number;
  duplicateEmailGroups: Array<{ email?: string; members: ReadinessMember[] }>;
}

interface MemberApi {
  id: number;
  member_id: string;
  full_name: string;
  status: string;
  has_login: boolean;
}

interface ReadinessApi {
  login_by_phone_enabled: boolean;
  members_with_login: number;
  duplicate_mobile_groups: Array<{ mobile: string; members: MemberApi[] }>;
  duplicate_group_count: number;
  unparseable_mobiles: Array<{ id: number; member_id: string; raw: string }>;
  open_phone_fixes: number;
  duplicate_email_groups: Array<{ email?: string; members: MemberApi[] }>;
}

const toMember = (m: MemberApi): ReadinessMember => ({
  id: m.id,
  memberId: m.member_id,
  fullName: m.full_name,
  status: m.status,
  hasLogin: m.has_login,
});

/** Read-only GET /api/admin/login-readiness (manage_system_config). */
@Injectable({ providedIn: 'root' })
export class LoginReadinessService {
  private readonly http = inject(HttpClient);

  report(): Observable<LoginReadiness> {
    return this.http.get<ReadinessApi>(`${environment.apiBaseUrl}/admin/login-readiness`).pipe(
      map((api) => ({
        loginByPhoneEnabled: api.login_by_phone_enabled,
        membersWithLogin: api.members_with_login,
        duplicateMobileGroups: api.duplicate_mobile_groups.map((g) => ({ mobile: g.mobile, members: g.members.map(toMember) })),
        duplicateGroupCount: api.duplicate_group_count,
        unparseableMobiles: api.unparseable_mobiles.map((u) => ({ id: u.id, memberId: u.member_id, raw: u.raw })),
        openPhoneFixes: api.open_phone_fixes,
        duplicateEmailGroups: api.duplicate_email_groups.map((g) => ({ ...g, members: g.members.map(toMember) })),
      })),
    );
  }
}
