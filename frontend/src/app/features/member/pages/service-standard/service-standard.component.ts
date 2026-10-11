import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { GovernanceService, ServiceStandard } from '../../../../core/services/governance.service';

@Component({
  selector: 'app-service-standard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <div class="page-container">
      <header class="page-header">
        <h1><app-icon name="check-circle" /> {{ 'serviceStandard.title' | translate }}</h1>
        <p class="muted">{{ 'serviceStandard.subtitle' | translate }}</p>
      </header>

      @if (loading()) {
        <div class="card"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-line"></div></div>
      } @else {
        <div class="grid">
          @for (standard of standards(); track standard.key) {
            <div class="card">
              <h2>{{ standard.bn }}</h2>
              <p class="target"><span class="muted">{{ 'serviceStandard.target' | translate }}:</span> {{ standard.target }}</p>
              @if (standard.live; as live) {
                <p>
                  <span class="ds-badge" [attr.data-tone]="live.met_pct !== undefined && live.met_pct >= 90 ? 'good' : 'warn'">
                    {{ 'serviceStandard.met' | translate }}: {{ live.met }}/{{ live.total }}
                    @if (live.met_pct !== undefined) { ({{ live.met_pct }}%) }
                  </span>
                </p>
                @if (live.avg_working_days !== undefined) {
                  <p class="muted">{{ 'serviceStandard.avgDays' | translate }}: {{ live.avg_working_days }}</p>
                }
              } @else {
                <p class="muted">{{ 'serviceStandard.noLiveData' | translate }}</p>
              }
            </div>
          }
        </div>
        <div class="card notice-card">
          <app-icon name="shield" />
          <p>{{ antiRetaliation() }}</p>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .page-header h1 { display: flex; align-items: center; gap: 0.5rem; }
      .muted { color: var(--gray-600, #667); }
      .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
      .notice-card { display: flex; gap: 0.75rem; align-items: flex-start; border-inline-start: 4px solid var(--gold, #c9a34c); }
    `,
  ],
})
export class ServiceStandardComponent implements OnInit {
  private readonly governance = inject(GovernanceService);
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
}
