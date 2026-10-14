import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { FeatureFlagService } from '../../core/services/feature-flag.service';
import { AdminDashboardComponent } from '../management/pages/dashboard/admin-dashboard.component';
import { AdminTodayComponent } from '../management/pages/admin-today/admin-today.component';
import { MemberDashboardComponent } from '../member/pages/dashboard/member-dashboard.component';
import { HomeStatusComponent } from '../member/pages/home-status/home-status.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminDashboardComponent, AdminTodayComponent, MemberDashboardComponent, HomeStatusComponent],
  template: `
    @if (auth.landingTier() === 'member') {
      @if (fiveAreas) {
        <app-home-status />
      } @else {
        <app-member-dashboard />
      }
    } @else if (adminConsole) {
      <app-admin-today />
    } @else {
      <app-admin-dashboard />
    }
  `,
})
export class DashboardComponent {
  private readonly flags = inject(FeatureFlagService);

  constructor(public auth: AuthService) {}

  /** nav_five_areas: members get the "আমার অবস্থা" home instead of the old dashboard. */
  get fiveAreas(): boolean {
    return this.flags.isEnabled('nav_five_areas');
  }

  /** admin_console: admins land on "আজকের কাজ" instead of the old finance overview. */
  get adminConsole(): boolean {
    return this.flags.isEnabled('admin_console');
  }
}
