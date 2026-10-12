import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IconComponent, type IconName } from '../../../../shared/icon/icon.component';
import { LanguageService } from '../../../../core/services/language.service';
import {
  FundControlsService,
  type WelfareFundRequest,
  type WelfareRequestType,
} from '../../../../core/services/fund-controls.service';
import { formatTaka } from '../../../../core/services/finance.service';
import { localizeDigits } from '../../../../core/services/resolution-book.service';

@Component({
  selector: 'app-member-welfare-fund',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionLoaderComponent, FormsModule, TranslatePipe, IconComponent],
  template: `
    <div class="page-container">
      <header class="gov-hero">
        <span class="gov-hero-icon"><app-icon name="coin" [size]="22" /></span>
        <div class="gov-hero-text">
          <h1 class="gov-hero-title">{{ 'welfareFund.title' | translate }}</h1>
          <p class="gov-hero-sub">{{ 'welfareFund.memberSubtitle' | translate }}</p>
        </div>
      </header>

      @if (error()) {
        <div class="error-box" role="alert"><p style="margin: 0">{{ error() }}</p></div>
      }

      <!-- Apply -->
      <section class="ds-card">
        <div class="ds-card-header">
          <span class="ds-card-icon"><app-icon name="plus" [size]="18" /></span>
          <div class="ds-card-heading">
            <h2 class="ds-card-title">{{ 'welfareFund.applyTitle' | translate }}</h2>
            <p class="ds-card-sub">{{ 'welfareFund.applyHint' | translate }}</p>
          </div>
        </div>
        <div class="ds-card-body">
          <form (ngSubmit)="apply()" #applyForm="ngForm">
            <div class="field">
              <span class="wf-type-label" id="wf-type-label">{{ 'welfareFund.type' | translate }}</span>
              <div class="wf-type-grid" role="radiogroup" aria-labelledby="wf-type-label">
                @for (type of requestTypes(); track type.key) {
                  <button
                    type="button"
                    class="wf-type-card"
                    [class.is-picked]="formType === type.key"
                    [attr.aria-pressed]="formType === type.key"
                    (click)="formType = type.key"
                  >
                    <span class="wf-type-icon"><app-icon [name]="type.icon" [size]="19" /></span>
                    <span class="wf-type-name">{{ type.label }}</span>
                    <span class="wf-type-check"><app-icon name="check" [size]="13" /></span>
                  </button>
                }
              </div>
            </div>
            <div class="field wf-amount-field">
              <label for="wf-amount">{{ 'welfareFund.amount' | translate }}</label>
              <div class="wf-amount-wrap">
                <span class="wf-amount-prefix">৳</span>
                <input id="wf-amount" class="field-control" type="number" min="1" name="amount"
                       [(ngModel)]="formAmount" required />
              </div>
            </div>
            <div class="field">
              <label for="wf-reason">{{ 'welfareFund.reason' | translate }}</label>
              <textarea id="wf-reason" class="field-control" rows="4" name="reason"
                        [(ngModel)]="formReason" maxlength="5000" required></textarea>
            </div>
            @if (formError()) {
              <p class="field-error">{{ formError() }}</p>
            }
            @if (applySuccess()) {
              <p class="gov-success"><app-icon name="check-circle" [size]="16" /> {{ 'welfareFund.applySuccess' | translate }}</p>
            }
            <div class="form-actions">
              <button type="submit" class="btn btn-primary"
                      [disabled]="applyForm.invalid || !formAmount || !formReason.trim() || saving()">
                {{ 'welfareFund.apply' | translate }}
              </button>
            </div>
          </form>
        </div>
      </section>

      <!-- My requests -->
      <section class="ds-card">
        <div class="ds-card-header">
          <span class="ds-card-icon"><app-icon name="inbox" [size]="18" /></span>
          <div class="ds-card-heading">
            <h2 class="ds-card-title">{{ 'welfareFund.myRequests' | translate }}</h2>
          </div>
        </div>
        <div class="ds-card-body">
          @if (loading()) {
            <app-section-loader variant="rows" [count]="3" />
          } @else if (requests().length === 0) {
            <div class="gov-empty">
              <span class="gov-empty-icon"><app-icon name="coin" [size]="22" /></span>
              <p>{{ 'welfareFund.empty' | translate }}</p>
            </div>
          } @else {
            <div class="wf-list">
              @for (request of requests(); track request.id) {
                <article class="gov-item" [class.gov-item-green]="request.status === 'approved' || request.status === 'disbursed'" [class.gov-item-red]="request.status === 'rejected'" [class.gov-item-blue]="request.status === 'submitted' || request.status === 'under_review'">
                  <div class="gov-item-head">
                    <strong class="ds-mono">{{ request.requestNo }}</strong>
                    <span class="ds-tag" [attr.data-tone]="requestTone(request.status)">
                      {{ 'welfareFund.status.' + request.status | translate }}
                    </span>
                  </div>
                  <div class="gov-item-chiprow">
                    <span class="wf-type-chip"><app-icon [name]="typeIcon(request.requestType)" [size]="14" /> {{ 'welfareFund.types.' + request.requestType | translate }}</span>
                    · {{ 'welfareFund.amountLabel' | translate: { amount: taka(request.amountRequested) } }}
                    @if (request.approvedAmount != null) {
                      · <strong>{{ 'welfareFund.approvedLabel' | translate: { amount: taka(request.approvedAmount) } }}</strong>
                    }
                  </div>
                  <p>{{ request.reason }}</p>
                  @if (request.committeeReason) {
                    <div class="gov-item-note">
                      <strong>{{ 'welfareFund.committeeReason' | translate }}</strong>
                      <p>{{ request.committeeReason }}</p>
                    </div>
                  }
                  @if (request.status === 'approved' || request.status === 'rejected' || request.status === 'disbursed') {
                    <button type="button" class="btn btn-secondary btn-sm" (click)="downloadLetter(request)">
                      <span class="wf-btn-icon"><app-icon name="download" [size]="15" /></span>
                      {{ 'welfareFund.decisionLetter' | translate }}
                    </button>
                  }
                </article>
              }
            </div>
          }
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      /* Support-type picker: tap cards instead of a bare select. */
      .wf-type-label { font-size: 0.875rem; font-weight: 500; color: var(--gray-700); margin-bottom: 0.25rem; display: block; }
      .wf-type-grid {
        display: grid;
        gap: 0.6rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      @media (min-width: 640px) {
        .wf-type-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      }
      .wf-type-card {
        position: relative;
        display: grid;
        justify-items: center;
        gap: 0.35rem;
        padding: 0.8rem 0.5rem 0.7rem;
        border: 1.5px solid var(--gray-200);
        border-radius: var(--radius-sm);
        background: var(--surface);
        color: var(--gray-800);
        font: inherit;
        cursor: pointer;
        text-align: center;
        transition: border-color 0.12s, background-color 0.12s, box-shadow 0.12s;
      }
      .wf-type-card:hover { border-color: var(--field-border-hover); }
      .wf-type-card.is-picked {
        border-color: var(--emerald-600);
        background: var(--emerald-50);
        box-shadow: var(--field-focus-ring);
      }
      .wf-type-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.2rem;
        height: 2.2rem;
        border-radius: 50%;
        background: var(--surface-2);
        color: var(--emerald-800);
      }
      .wf-type-card.is-picked .wf-type-icon { background: var(--emerald-800); color: #fff; }
      .wf-type-name { font-size: 0.82rem; font-weight: 700; line-height: 1.35; }
      .wf-type-check {
        position: absolute;
        top: 0.4rem;
        right: 0.4rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.2rem;
        height: 1.2rem;
        border-radius: 50%;
        border: 1.5px solid var(--gray-300);
        color: transparent;
        background: var(--surface);
      }
      .wf-type-card.is-picked .wf-type-check {
        background: var(--emerald-600);
        border-color: var(--emerald-600);
        color: #fff;
      }
      /* Amount with a fixed taka prefix beside the global-styled input. */
      .wf-amount-field { max-width: 18rem; }
      .wf-amount-wrap { display: flex; align-items: stretch; }
      .wf-amount-prefix {
        display: inline-flex;
        align-items: center;
        padding: 0 0.7rem;
        border: 1px solid var(--field-border);
        border-right: none;
        border-radius: var(--field-radius) 0 0 var(--field-radius);
        background: var(--surface-2);
        color: var(--gray-600);
        font-weight: 700;
        font-size: 0.9rem;
        flex-shrink: 0;
      }
      .wf-amount-wrap .field-control { border-radius: 0 var(--field-radius) var(--field-radius) 0; }
      .wf-list { display: grid; gap: 0.85rem; }
      .wf-type-chip { display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600; color: var(--gray-700); }
      .wf-btn-icon { display: inline-flex; vertical-align: -3px; margin-inline-end: 0.3rem; }
    `,
  ],
})
export class WelfareFundComponent implements OnInit {
  readonly requestTypeKeys: WelfareRequestType[] = ['medical', 'emergency', 'education', 'other'];
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly applySuccess = signal(false);
  readonly requests = signal<WelfareFundRequest[]>([]);

  formType: WelfareRequestType = 'medical';
  formAmount: number | null = null;
  formReason = '';

  private readonly fundControls = inject(FundControlsService);
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  readonly lang = this.language.lang;

  ngOnInit(): void {
    this.load();
  }

  requestTypes(): { key: WelfareRequestType; label: string; icon: IconName }[] {
    return this.requestTypeKeys.map((key) => ({
      key,
      label: this.typeLabel(key),
      icon: this.typeIcon(key),
    }));
  }

  typeIcon(key: WelfareRequestType): IconName {
    if (key === 'medical') return 'plus';
    if (key === 'emergency') return 'alert';
    if (key === 'education') return 'doc';
    return 'sparkle';
  }

  typeLabel(key: WelfareRequestType): string {
    const translated = this.translate.instant('welfareFund.types.' + key);
    return translated.startsWith('welfareFund.types.') ? key : translated;
  }

  requestTone(status: string): string {
    if (status === 'approved' || status === 'disbursed') return 'good';
    if (status === 'rejected') return 'bad';
    if (status === 'under_review') return 'warn';
    return 'neutral';
  }

  taka(value: number): string {
    return formatTaka(value, this.lang());
  }

  digits(value: number | string): string {
    return localizeDigits(value, this.lang());
  }

  load(): void {
    this.loading.set(true);
    this.fundControls.myWelfareRequests().subscribe({
      next: (requests) => {
        this.requests.set(requests);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('welfareFund.loadError');
        this.loading.set(false);
      },
    });
  }

  apply(): void {
    if (this.saving()) return;
    if (this.formAmount == null || this.formAmount <= 0 || !this.formReason.trim()) return;
    this.saving.set(true);
    this.formError.set('');
    this.applySuccess.set(false);
    this.fundControls
      .applyForWelfareFund(this.formType, this.formAmount, this.formReason.trim())
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.formAmount = null;
          this.formReason = '';
          this.applySuccess.set(true);
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(err?.error?.detail || 'welfareFund.applyError');
        },
      });
  }

  downloadLetter(request: WelfareFundRequest): void {
    this.fundControls.downloadDecisionLetter(request.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${request.requestNo}-decision.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (err) => this.error.set(err?.error?.detail || 'welfareFund.letterError'),
    });
  }
}
