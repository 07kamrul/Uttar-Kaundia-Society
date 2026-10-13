import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { FeatureFlagService } from '../../core/services/feature-flag.service';
import { AdminDashboardComponent } from '../management/pages/dashboard/admin-dashboard.component';
import { HomeStatusComponent } from '../member/pages/home-status/home-status.component';
import { MemberDashboardComponent } from '../member/pages/dashboard/member-dashboard.component';
import { DashboardComponent } from './dashboard.component';

@Component({ selector: 'app-home-status', template: 'HOME' })
class HomeStub {}
@Component({ selector: 'app-member-dashboard', template: 'OLD' })
class MemberStub {}
@Component({ selector: 'app-admin-dashboard', template: 'ADMIN' })
class AdminStub {}

function render(opts: { fiveAreas: boolean; tier: 'member' | 'management' }): string {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { landingTier: () => opts.tier } },
      { provide: FeatureFlagService, useValue: { isEnabled: (k: string) => opts.fiveAreas && k === 'nav_five_areas' } },
    ],
  });
  TestBed.overrideComponent(DashboardComponent, {
    remove: { imports: [AdminDashboardComponent, MemberDashboardComponent, HomeStatusComponent] },
    add: { imports: [AdminStub, MemberStub, HomeStub] },
  });
  const f = TestBed.createComponent(DashboardComponent);
  f.detectChanges();
  return (f.nativeElement as HTMLElement).textContent ?? '';
}

describe('DashboardComponent', () => {
  it('keeps the old member dashboard while nav_five_areas is off', () => {
    expect(render({ fiveAreas: false, tier: 'member' })).toBe('OLD');
  });
  it('shows "আমার অবস্থা" to members when nav_five_areas is on', () => {
    expect(render({ fiveAreas: true, tier: 'member' })).toBe('HOME');
  });
  it('never changes the admin dashboard', () => {
    expect(render({ fiveAreas: true, tier: 'management' })).toBe('ADMIN');
  });
});
