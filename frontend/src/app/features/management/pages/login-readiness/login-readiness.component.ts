import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LoginReadinessService, type LoginReadiness } from '../../../../core/services/login-readiness.service';
import { LoadErrorComponent } from '../../../../shared/load-error/load-error.component';
import { BnNumberPipe } from '../../../../shared/pipes/bn-pipes';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';

type LoadState = 'loading' | 'error' | 'ready';

/** Advanced › "লগইন প্রস্তুতি": a read-only report to check before turning login_by_phone on. */
@Component({
  selector: 'app-login-readiness',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, BnNumberPipe, SectionLoaderComponent, LoadErrorComponent],
  template: `
    <div class="login-readiness-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ 'adminConsole.readiness.title' | translate }}</h1>
          <p class="page-subtitle">{{ 'adminConsole.readiness.subtitle' | translate }}</p>
        </div>
        @if (state() === 'ready') {
          <button type="button" class="btn btn-secondary" data-testid="readiness-refresh" (click)="load()">
            {{ 'adminConsole.cacheStats.refresh' | translate }}
          </button>
        }
      </div>
      @switch (state()) {
        @case ('loading') {
          <app-section-loader variant="rows" [count]="4" />
        }
        @case ('error') {
          <div data-testid="readiness-error">
            <app-load-error fallbackKey="adminConsole.readiness.loadError" (retry)="load()" />
          </div>
        }
        @default {
          @if (report(); as r) {
            <p>{{ (r.loginByPhoneEnabled ? 'adminConsole.readiness.on' : 'adminConsole.readiness.off') | translate }}</p>
            <p>
              {{ 'adminConsole.readiness.withLogin' | translate }}: <strong>{{ r.membersWithLogin | bnNumber }}</strong>
            </p>
            @if (r.openPhoneFixes > 0) {
              <p>
                <a routerLink="/phone-fixes">{{ 'adminConsole.readiness.openFixes' | translate }}: {{ r.openPhoneFixes | bnNumber }}</a>
              </p>
            }
            @if (isClear(r)) {
              <p data-testid="readiness-clear">{{ 'adminConsole.readiness.clear' | translate }}</p>
            }
            @if (r.duplicateMobileGroups.length > 0) {
              <h2>{{ 'adminConsole.readiness.duplicates' | translate }} ({{ r.duplicateGroupCount | bnNumber }})</h2>
              @for (g of r.duplicateMobileGroups; track g.mobile) {
                <div class="card" style="margin-bottom: 0.75rem">
                  <strong>{{ g.mobile }}</strong>
                  <ul>
                    @for (m of g.members; track m.id) {
                      <li>
                        {{ m.memberId }} · {{ m.fullName }} · {{ m.status }}
                        @if (m.hasLogin) {
                          · {{ 'adminConsole.readiness.hasLogin' | translate }}
                        }
                      </li>
                    }
                  </ul>
                </div>
              }
            }
            @if (r.unparseableMobiles.length > 0) {
              <h2>{{ 'adminConsole.readiness.unparseable' | translate }}</h2>
              <ul>
                @for (u of r.unparseableMobiles; track u.id) {
                  <li>{{ u.memberId }} · {{ u.raw }}</li>
                }
              </ul>
            }
          }
        }
      }
    </div>
  `,
})
export class LoginReadinessComponent implements OnInit {
  private readonly service = inject(LoginReadinessService);
  readonly state = signal<LoadState>('loading');
  readonly report = signal<LoginReadiness | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.service.report().subscribe({
      next: (r) => {
        this.report.set(r);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  isClear(r: LoginReadiness): boolean {
    return r.duplicateMobileGroups.length === 0 && r.unparseableMobiles.length === 0 && r.openPhoneFixes === 0;
  }
}
