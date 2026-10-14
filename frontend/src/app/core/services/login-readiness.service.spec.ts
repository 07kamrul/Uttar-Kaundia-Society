import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { LoginReadinessService } from './login-readiness.service';

describe('LoginReadinessService', () => {
  it('maps GET /admin/login-readiness to camelCase', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    let out: unknown;
    TestBed.inject(LoginReadinessService).report().subscribe((r) => (out = r));
    const req = http.expectOne(`${environment.apiBaseUrl}/admin/login-readiness`);
    expect(req.request.method).toBe('GET');
    req.flush({
      login_by_phone_enabled: true,
      members_with_login: 412,
      duplicate_mobile_groups: [
        { mobile: '+8801712345678', members: [{ id: 7, member_id: 'UKAMKS-7', full_name: 'রহিম', status: 'approved', has_login: true }] },
      ],
      duplicate_group_count: 1,
      unparseable_mobiles: [{ id: 9, member_id: 'UKAMKS-9', raw: '01-7' }],
      open_phone_fixes: 3,
      duplicate_email_groups: [],
    });
    expect(out).toEqual({
      loginByPhoneEnabled: true,
      membersWithLogin: 412,
      duplicateMobileGroups: [
        { mobile: '+8801712345678', members: [{ id: 7, memberId: 'UKAMKS-7', fullName: 'রহিম', status: 'approved', hasLogin: true }] },
      ],
      duplicateGroupCount: 1,
      unparseableMobiles: [{ id: 9, memberId: 'UKAMKS-9', raw: '01-7' }],
      openPhoneFixes: 3,
      duplicateEmailGroups: [],
    });
  });
});
