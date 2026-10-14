import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CacheStatsService, type CacheStats } from '../../../../core/services/cache-stats.service';
import { BnNumberPipe } from '../../../../shared/pipes/bn-pipes';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';

type LoadState = 'loading' | 'error' | 'ready';

/** Read-only cache table (manage_system_config). There is deliberately no flush button; flushing stays an API-only action. */
@Component({
  selector: 'app-cache-stats',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, BnNumberPipe, SectionLoaderComponent],
  template: `
    <div class="cache-stats-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ 'adminConsole.cacheStats.title' | translate }}</h1>
          <p class="page-subtitle">{{ 'adminConsole.cacheStats.subtitle' | translate }}</p>
        </div>
        @if (state() !== 'error') {
          <button type="button" class="btn btn-secondary" data-testid="cache-refresh" [disabled]="state() === 'loading'" (click)="load()">
            {{ 'adminConsole.cacheStats.refresh' | translate }}
          </button>
        }
      </div>
      @switch (state()) {
        @case ('loading') {
          <app-section-loader variant="rows" [count]="4" />
        }
        @case ('error') {
          <div class="error-box" role="alert" data-testid="cache-error">
            <p style="margin: 0 0 0.5rem">{{ 'adminConsole.cacheStats.loadError' | translate }}</p>
            <button type="button" class="btn btn-secondary" (click)="load()">{{ 'common.retry' | translate }}</button>
          </div>
        }
        @default {
          @if (stats(); as s) {
            <p>{{ (s.enabled ? 'adminConsole.cacheStats.on' : 'adminConsole.cacheStats.off') | translate }}</p>
            <div class="data-table-wrap">
              <table class="data-table data-table-cards">
                <thead>
                  <tr>
                    <th>{{ 'adminConsole.cacheStats.name' | translate }}</th>
                    <th>{{ 'adminConsole.cacheStats.entries' | translate }}</th>
                    <th>{{ 'adminConsole.cacheStats.ttl' | translate }}</th>
                    <th>{{ 'adminConsole.cacheStats.hitRatio' | translate }}</th>
                    <th>{{ 'adminConsole.cacheStats.invalidations' | translate }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of s.caches; track c.name) {
                    <tr>
                      <td [attr.data-label]="'adminConsole.cacheStats.name' | translate">{{ c.name }}</td>
                      <td [attr.data-label]="'adminConsole.cacheStats.entries' | translate">{{ c.size | bnNumber }} / {{ c.maxSize | bnNumber }}</td>
                      <td [attr.data-label]="'adminConsole.cacheStats.ttl' | translate">{{ c.ttlSeconds | bnNumber }}</td>
                      <td [attr.data-label]="'adminConsole.cacheStats.hitRatio' | translate">{{ c.hitRatio * 100 | bnNumber: 0 }}%</td>
                      <td [attr.data-label]="'adminConsole.cacheStats.invalidations' | translate">{{ c.invalidations | bnNumber }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      }
    </div>
  `,
})
export class CacheStatsComponent implements OnInit {
  private readonly service = inject(CacheStatsService);
  readonly state = signal<LoadState>('loading');
  readonly stats = signal<CacheStats | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.service.stats().subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
