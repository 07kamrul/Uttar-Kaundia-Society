import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminTodayService, type AdminToday } from '../../../../core/services/admin-today.service';
import { IconComponent, type IconName } from '../../../../shared/icon/icon.component';
import { BnNumberPipe } from '../../../../shared/pipes/bn-pipes';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';

export interface TodayCard {
  key: string;
  labelKey: string;
  icon: IconName;
  count: number;
  link: string;
  query?: Record<string, string>;
  /** Late work: shown in red with the words "দেরি হয়েছে". */
  overdue?: number;
  dueSoon?: number;
}

/** One card per section the admin may see (null sections are skipped), in working order. */
export function todayCards(today: AdminToday): TodayCard[] {
  const cards: TodayCard[] = [];
  const a = today.applications;
  if (a) {
    cards.push({
      key: 'applications',
      labelKey: 'adminConsole.today.applications',
      icon: 'inbox',
      count: a.total,
      link: '/applications',
      query: { tab: a.registrationsPending !== null ? 'registrations' : 'membership' },
    });
  }
  if (today.needsDag !== null) {
    cards.push({ key: 'needs-dag', labelKey: 'adminConsole.today.needsDag', icon: 'alert', count: today.needsDag, link: '/submissions', query: { needs_dag: '1' } });
  }
  const p = today.paymentVerifications;
  if (p) {
    cards.push({ key: 'payments', labelKey: 'adminConsole.today.payments', icon: 'wallet', count: p.total, link: '/payment-verifications', query: { status: 'pending' } });
  }
  const c = today.complaints;
  if (c) {
    cards.push({
      key: 'complaints',
      labelKey: 'adminConsole.today.complaints',
      icon: 'shield',
      count: c.open,
      link: '/complaints-admin',
      query: { sla: 'overdue' },
      overdue: c.overdue,
      dueSoon: c.dueSoon,
    });
  }
  if (today.propertyRequests) {
    cards.push({ key: 'property-requests', labelKey: 'adminConsole.today.propertyRequests', icon: 'doc', count: today.propertyRequests.pending, link: '/property-requests' });
  }
  if (today.boundaries) {
    cards.push({ key: 'boundaries', labelKey: 'adminConsole.today.boundaries', icon: 'pin', count: today.boundaries.pending, link: '/plot-boundaries' });
  }
  const t = today.committeeTerms;
  if (t) {
    cards.push({
      key: 'committee-terms',
      labelKey: 'adminConsole.today.committeeTerms',
      icon: 'users',
      count: t.expiringSoon + t.expired,
      link: '/committee-registry',
      overdue: t.expired,
    });
  }
  if (today.phoneFixes) {
    cards.push({ key: 'phone-fixes', labelKey: 'adminConsole.today.phoneFixes', icon: 'user', count: today.phoneFixes.open, link: '/phone-fixes' });
  }
  return cards;
}

type LoadState = 'loading' | 'error' | 'ready';

/** "আজকের কাজ": what is waiting for this admin today (admin_console). */
@Component({
  selector: 'app-admin-today',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, BnNumberPipe, IconComponent, SectionLoaderComponent],
  template: `
    <div class="today-page">
      <h1 class="page-title">{{ 'adminConsole.today.title' | translate }}</h1>
      @switch (state()) {
        @case ('loading') {
          <app-section-loader variant="cards" [count]="4" />
        }
        @case ('error') {
          <div class="error-box" role="alert" data-testid="today-error">
            <p style="margin: 0 0 0.5rem">{{ 'adminConsole.today.loadError' | translate }}</p>
            <button type="button" class="btn btn-secondary" data-testid="today-retry" (click)="load()">{{ 'common.retry' | translate }}</button>
          </div>
        }
        @default {
          @if (isEmpty()) {
            <p class="empty-state" data-testid="today-empty">{{ 'adminConsole.today.empty' | translate }}</p>
          } @else {
            <div class="today-grid">
              @for (card of cards(); track card.key) {
                <a class="today-card card" data-testid="today-card" [attr.data-key]="card.key" [routerLink]="card.link" [queryParams]="card.query ?? null">
                  <app-icon [name]="card.icon" [size]="28" />
                  <span class="today-label">{{ card.labelKey | translate }}</span>
                  <strong class="today-count">{{ card.count | bnNumber }}</strong>
                  @if (card.overdue) {
                    <span class="today-late">{{ 'adminConsole.today.overdue' | translate }}: {{ card.overdue | bnNumber }}</span>
                  }
                  @if (card.dueSoon) {
                    <span class="today-soon">{{ 'adminConsole.today.dueSoon' | translate }}: {{ card.dueSoon | bnNumber }}</span>
                  }
                </a>
              }
            </div>
          }
        }
      }
    </div>
  `,
  styles: `
    .today-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.75rem; }
    .today-card { display: flex; flex-direction: column; gap: 0.25rem; min-height: 48px; padding: 1rem; text-decoration: none; color: inherit; }
    .today-label { font-weight: 600; }
    .today-count { font-size: 2rem; line-height: 1.1; }
    .today-late { color: var(--red-700); font-weight: 700; }
    .today-soon { color: var(--gold-strong); }
  `,
})
export class AdminTodayComponent implements OnInit {
  private readonly service = inject(AdminTodayService);
  readonly state = signal<LoadState>('loading');
  private readonly today = signal<AdminToday | null>(null);
  readonly cards = computed(() => {
    const today = this.today();
    return today ? todayCards(today) : [];
  });
  /** Nothing is waiting: every shown count (and late count) is zero. */
  readonly isEmpty = computed(() => this.cards().every((c) => c.count === 0 && !c.overdue));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.service.today().subscribe({
      next: (today) => {
        this.today.set(today);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
