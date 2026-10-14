import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { EventsComponent } from '../events/events.component';
import { NoticesComponent } from '../notices/notices.component';

type Tab = 'notices' | 'events';

/** "নোটিশ ও অনুষ্ঠান": the two existing pages as tabs (admin_console). The old routes stay. */
@Component({
  selector: 'app-notices-events',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, NoticesComponent, EventsComponent],
  template: `
    <div class="notices-events-page">
      <h1 class="page-title">{{ 'adminConsole.noticesEvents.title' | translate }}</h1>
      <div class="tab-row" role="tablist" [attr.aria-label]="'adminConsole.noticesEvents.title' | translate">
        @for (t of tabs; track t) {
          <button type="button" role="tab" class="tab" [attr.data-testid]="'tab-' + t" [class.active]="active() === t" [attr.aria-selected]="active() === t" (click)="select(t)">
            {{ 'adminConsole.noticesEvents.tabs.' + t | translate }}
          </button>
        }
      </div>
      @if (active() === 'events') {
        <app-events />
      } @else {
        <app-notices />
      }
    </div>
  `,
})
export class NoticesEventsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  readonly tabs: readonly Tab[] = ['notices', 'events'];
  readonly active = computed<Tab>(() => (this.query().get('tab') === 'events' ? 'events' : 'notices'));

  select(tab: Tab): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab }, queryParamsHandling: 'merge' });
  }
}
