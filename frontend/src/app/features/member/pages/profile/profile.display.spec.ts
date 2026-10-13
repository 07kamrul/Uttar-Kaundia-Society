import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { AuthService } from '../../../../core/services/auth.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { MemberService, type MemberProfile } from '../../../../core/services/member.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { ProfileComponent } from './profile.component';

const PROFILE = {
  memberId: 'UKAMKS-1',
  status: 'approved',
  fullName: 'Test',
  fatherOrHusband: 'F',
  mother: 'M',
  dob: '2000-01-01',
  mobile: '+8801712345678',
  showInNeighbourDirectory: true,
  properties: [],
  nominees: [],
} as MemberProfile;

function create(fiveAreas: boolean) {
  const toggle = vi.fn();
  TestBed.configureTestingModule({
    imports: [ProfileComponent],
    providers: [
      provideRouter([]),
      provideTranslateService(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: MemberService, useValue: { getProfile: () => of(PROFILE), getPropertyRequests: () => of([]) } },
      { provide: FeatureFlagService, useValue: { isEnabled: (k: string) => fiveAreas && k === 'nav_five_areas' } },
      { provide: ThemeService, useValue: { theme: signal('light'), toggle } },
      {
        provide: AuthService,
        useValue: { role: 'member', hasAnyPermission: () => true, hasPermission: () => true },
      },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const f = TestBed.createComponent(ProfileComponent);
  f.detectChanges();
  return { el: f.nativeElement as HTMLElement, toggle, f };
}

describe('ProfileComponent display section (nav_five_areas)', () => {
  it('has no display section while the flag is off', () => {
    expect(create(false).el.querySelector('[data-testid="display-card"]')).toBeNull();
  });

  it('shows "প্রদর্শন" with the theme toggle, which switches the theme', () => {
    const { el, toggle, f } = create(true);
    const card = el.querySelector('[data-testid="display-card"]') as HTMLElement;
    expect(card.textContent).toContain('প্রদর্শন');
    const button = card.querySelector('[data-testid="theme-toggle"]') as HTMLButtonElement;
    expect(button.textContent).toContain('গাঢ় থিম');
    button.click();
    f.detectChanges();
    expect(toggle).toHaveBeenCalled();
  });

  it('links to "আমার সদস্যপদ" and password change from the profile', () => {
    const { el } = create(true);
    const hrefs = [...el.querySelectorAll('[data-testid="profile-link"]')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/membership', '/change-password']);
    expect(el.textContent).toContain('আমার সদস্যপদ');
  });
});
