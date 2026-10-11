import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { LanguageService } from '../../../../core/services/language.service';
import { localizeDigits } from '../../../../core/services/resolution-book.service';
import { GovernanceService, ServiceStandard } from '../../../../core/services/governance.service';

@Component({
  selector: 'app-service-standard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <div class="ss-page">
      <header class="gov-hero">
        <span class="gov-hero-icon"><app-icon name="check-circle" [size]="22" /></span>
        <div class="gov-hero-text">
          <h1 class="gov-hero-title">{{ 'serviceStandard.title' | translate }}</h1>
          <p class="gov-hero-sub">{{ 'serviceStandard.subtitle' | translate }}</p>
        </div>
      </header>

      @if (loading()) {
        <div class="card ss-skeleton">
          <div class="skeleton-row"></div>
          <div class="skeleton-row"></div>
          <div class="skeleton-line"></div>
        </div>
      } @else {
        <div class="ss-grid">
          @for (standard of standards(); track standard.key) {
            <article class="ss-card">
              <div class="ss-card-head">
                <span class="ss-card-icon"><app-icon name="shield" [size]="17" /></span>
                <h2 class="ss-card-title">{{ standard.bn }}</h2>
              </div>
              <p class="ss-target">
                <span class="ds-badge">{{ 'serviceStandard.target' | translate }}: {{ standard.target }}</span>
              </p>
              @if (standard.live; as live) {
                <div class="ss-live">
                  <div class="ss-live-row">
                    <strong
                      class="ss-live-count"
                      [class.ss-live-count-good]="livePct(live) >= 90"
                      [class.ss-live-count-warn]="livePct(live) < 90"
                    >{{ digits(live.met) }}/{{ digits(live.total) }}</strong>
                    <span class="ds-badge" [attr.data-tone]="livePct(live) >= 90 ? 'good' : 'warn'">
                      {{ 'serviceStandard.met' | translate }}@if (live.met_pct !== undefined) { ({{ digits(live.met_pct) }}%) }
                    </span>
                  </div>
                  <div class="gov-meter" role="progressbar" [attr.aria-valuenow]="livePct(live)" aria-valuemin="0" aria-valuemax="100">
                    <span
                      class="gov-meter-fill"
                      [class.gov-meter-fill-amber]="livePct(live) < 90"
                      [style.width.%]="livePct(live)"
                    ></span>
                  </div>
                  @if (live.avg_working_days !== undefined) {
                    <p class="ss-days">
                      <app-icon name="receipt" [size]="14" />
                      {{ 'serviceStandard.avgDays' | translate }}: {{ digits(live.avg_working_days) }}
                    </p>
                  }
                </div>
              } @else {
                <p class="ss-nolive">
                  <app-icon name="chart" [size]="15" />
                  {{ 'serviceStandard.noLiveData' | translate }}
                </p>
              }
            </article>
          }
        </div>

        <div class="gov-notice">
          <app-icon name="shield" [size]="19" />
          <p>{{ antiRetaliation() }}</p>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .ss-page { display: grid; gap: 0; }
      .ss-skeleton { padding: 1.25rem; display: grid; gap: 0.75rem; }
      .ss-grid {
        display: grid;
        gap: 1rem;
        grid-template-columns: 1fr;
        margin-bottom: 1.25rem;
      }
      @media (min-width: 640px) {
        .ss-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (min-width: 1024px) {
        .ss-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }
      .ss-card {
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        padding: 1.1rem 1.15rem;
        border: 1px solid var(--gray-200);
        border-radius: var(--radius-md);
        background: var(--surface);
        box-shadow: var(--shadow-sm);
      }
      .ss-card-head { display: flex; align-items: center; gap: 0.6rem; }
      .ss-card-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.1rem;
        height: 2.1rem;
        flex-shrink: 0;
        border-radius: 0.5rem;
        background: var(--emerald-50);
        color: var(--emerald-800);
      }
      .ss-card-title { margin: 0; font-size: 1rem; font-weight: 700; color: var(--gray-800); line-height: 1.4; }
      .ss-target { margin: 0; }
      .ss-live { display: grid; gap: 0.5rem; margin-top: auto; }
      .ss-live-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
      .ss-live-count { font-size: 1.3rem; font-weight: 700; color: var(--gray-800); font-variant-numeric: tabular-nums; }
      .ss-live-count-good { color: var(--emerald-700); }
      .ss-live-count-warn { color: var(--gold-strong); }
      .ss-days { display: flex; align-items: center; gap: 0.35rem; margin: 0; font-size: 0.8rem; color: var(--gray-600); }
      .ss-nolive { display: flex; align-items: center; gap: 0.4rem; margin: auto 0 0; padding: 0.55rem 0.7rem; border-radius: var(--radius-sm); background: var(--gray-50); border: 1px dashed var(--gray-200); color: var(--gray-500); font-size: 0.82rem; }
    `,
  ],
})
export class ServiceStandardComponent implements OnInit {
  private readonly governance = inject(GovernanceService);
  private readonly language = inject(LanguageService);
  readonly lang = this.language.lang;
  readonly standards = signal<ServiceStandard[]>([]);
  readonly antiRetaliation = signal('');
  readonly loading = signal(true);

  ngOnInit(): void {
    this.governance.serviceStandard().subscribe({
      next: (data) => {
        this.standards.set(data.standards);
        this.antiRetaliation.set(data.anti_retaliation_notice);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  livePct(live: NonNullable<ServiceStandard['live']>): number {
    return live.met_pct ?? (live.total > 0 ? Math.round((live.met * 100) / live.total) : 0);
  }

  digits(value: number | string): string {
    return localizeDigits(value, this.lang());
  }
}
