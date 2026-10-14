import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { FeatureFlagService } from '../../core/services/feature-flag.service';
import { AdminDashboardComponent } from '../management/pages/dashboard/admin-dashboard.component';
import { AdminTodayComponent } from '../management/pages/admin-today/admin-today.component';
import { HomeStatusComponent } from '../member/pages/home-status/home-status.component';
import { MemberDashboardComponent } from '../member/pages/dashboard/member-dashboard.component';
import { DashboardComponent } from './dashboard.component';

@Component({ selector: 'app-home-status', template: 'HOME' })
class HomeStub {}
@Component({ selector: 'app-member-dashboard', template: 'OLD' })
class MemberStub {}
@Component({ selector: 'app-admin-dashboard', template: 'ADMIN' })
class AdminStub {}
@Component({ selector: 'app-admin-today', template: 'TODAY' })
class TodayStub {}

interface RenderOpts {
  fiveAreas: boolean;
  adminConsole: boolean;
  tier: 'member' | 'management';
}

function render(opts: RenderOpts): string {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { landingTier: () => opts.tier } },
      {
        provide: FeatureFlagService,
        useValue: {
          isEnabled: (k: string) =>
            (opts.fiveAreas && k === 'nav_five_areas') || (opts.adminConsole && k === 'admin_console'),
        },
      },
    ],
  });
  TestBed.overrideComponent(DashboardComponent, {
    remove: { imports: [AdminDashboardComponent, AdminTodayComponent, MemberDashboardComponent, HomeStatusComponent] },
    add: { imports: [AdminStub, TodayStub, MemberStub, HomeStub] },
  });
  const f = TestBed.createComponent(DashboardComponent);
  f.detectChanges();
  return (f.nativeElement as HTMLElement).textContent ?? '';
}

describe('DashboardComponent', () => {
  it('keeps the old member dashboard while nav_five_areas is off', () => {
    expect(render({ fiveAreas: false, adminConsole: false, tier: 'member' })).toBe('OLD');
  });
  it('shows "আমার অবস্থা" to members when nav_five_areas is on', () => {
    expect(render({ fiveAreas: true, adminConsole: false, tier: 'member' })).toBe('HOME');
  });
  it('keeps the old admin dashboard while admin_console is off', () => {
    expect(render({ fiveAreas: true, adminConsole: false, tier: 'management' })).toBe('ADMIN');
  });
  it('renders "আজকের কাজ" for admins when admin_console is on', () => {
    expect(render({ fiveAreas: true, adminConsole: true, tier: 'management' })).toBe('TODAY');
  });
});
