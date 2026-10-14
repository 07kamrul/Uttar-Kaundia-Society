import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { MembershipReviewComponent } from '../membership-review/membership-review.component';
import { SubmissionsListComponent } from '../submissions-list/submissions-list.component';

type ApplicationsTab = 'registrations' | 'membership';

const TAB_PERMISSION: Record<ApplicationsTab, string> = {
  registrations: 'membership.review',
  membership: 'membership_application.manage',
};

/** "আবেদন": the two intake queues in one place (admin_console). The old routes stay. */
@Component({
  selector: 'app-applications',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, SubmissionsListComponent, MembershipReviewComponent],
  template: `
    <div class="applications-page">
      <div class="tab-row" role="tablist" [attr.aria-label]="'adminConsole.applications.title' | translate">
        @for (t of tabs(); track t) {
          <button
            type="button"
            role="tab"
            class="tab"
            [attr.data-testid]="'tab-' + t"
            [class.active]="active() === t"
            [attr.aria-selected]="active() === t"
            (click)="select(t)"
          >
            {{ 'adminConsole.applications.tabs.' + t | translate }}
          </button>
        }
      </div>
      @if (active() === 'registrations') {
        <app-submissions-list />
      } @else if (active() === 'membership') {
        <app-membership-review />
      }
    </div>
  `,
})
export class ApplicationsComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  /** A tab is hidden without its permission. */
  readonly tabs = computed(() =>
    (Object.keys(TAB_PERMISSION) as ApplicationsTab[]).filter((t) => this.auth.hasPermission(TAB_PERMISSION[t])),
  );

  readonly active = computed<ApplicationsTab | null>(() => {
    const wanted = this.query().get('tab');
    const tabs = this.tabs();
    return tabs.find((t) => t === wanted) ?? tabs[0] ?? null;
  });

  select(tab: ApplicationsTab): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab }, queryParamsHandling: 'merge' });
  }
}
