import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
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
  imports: [FormsModule, TranslatePipe, IconComponent],
  template: `
    <div class="page-container">
      <header class="page-header">
        <h1 class="page-title"><app-icon name="coin" [size]="22" /> {{ 'welfareFund.title' | translate }}</h1>
        <p class="page-subtitle">{{ 'welfareFund.memberSubtitle' | translate }}</p>
      </header>

      @if (error()) {
        <div class="error-box" role="alert"><p style="margin: 0">{{ error() }}</p></div>
      }

      <!-- Apply -->
      <section class="card">
        <h2 class="wf-section-title">{{ 'welfareFund.applyTitle' | translate }}</h2>
        <p class="field-hint">{{ 'welfareFund.applyHint' | translate }}</p>
        <form (ngSubmit)="apply()" #applyForm="ngForm">
          <div class="field">
            <label for="wf-type">{{ 'welfareFund.type' | translate }}</label>
            <select id="wf-type" class="field-control" name="requestType" [(ngModel)]="formType" required>
              @for (type of requestTypes(); track type.key) {
                <option [value]="type.key">{{ typeLabel(type.key) }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="wf-amount">{{ 'welfareFund.amount' | translate }}</label>
            <input id="wf-amount" class="field-control" type="number" min="1" name="amount"
                   [(ngModel)]="formAmount" required />
          </div>
          <div class="field">
            <label for="wf-reason">{{ 'welfareFund.reason' | translate }}</label>
            <textarea id="wf-reason" class="field-control" rows="4" name="reason"
                      [(ngModel)]="formReason" maxlength="5000" required></textarea>
          </div>
          @if (formError()) {
            <p class="field-error">{{ formError() }}</p>
          }
          <button type="submit" class="btn btn-primary"
                  [disabled]="applyForm.invalid || !formAmount || !formReason.trim() || saving()">
            {{ 'welfareFund.apply' | translate }}
          </button>
        </form>
      </section>

      <!-- My requests -->
      <section class="card">
        <h2 class="wf-section-title">{{ 'welfareFund.myRequests' | translate }}</h2>
        @if (loading()) {
          @for (i of [1, 2]; track i) {
            <div class="skeleton-line" style="height: 64px; margin-bottom: 8px"></div>
          }
        } @else if (requests().length === 0) {
          <div class="ds-empty">{{ 'welfareFund.empty' | translate }}</div>
        } @else {
          <div class="wf-list">
            @for (request of requests(); track request.id) {
              <article class="wf-item">
                <div class="wf-item-head">
                  <strong>{{ request.requestNo }}</strong>
                  <span class="ds-tag" [class.ds-tag-blue]="request.status === 'submitted' || request.status === 'under_review'"
                        [class.ds-tag-green]="request.status === 'approved' || request.status === 'disbursed'"
                        [class.ds-tag-amber]="request.status === 'rejected'">
                    {{ 'welfareFund.status.' + request.status | translate }}
                  </span>
                </div>
                <p class="wf-meta">
                  {{ 'welfareFund.types.' + request.requestType | translate }}
                  · {{ 'welfareFund.amountLabel' | translate: { amount: taka(request.amountRequested) } }}
                  @if (request.approvedAmount != null) {
                    · {{ 'welfareFund.approvedLabel' | translate: { amount: taka(request.approvedAmount) } }}
                  }
                </p>
                <p class="wf-reason">{{ request.reason }}</p>
                @if (request.committeeReason) {
                  <div class="wf-decision">
                    <strong>{{ 'welfareFund.committeeReason' | translate }}</strong>
                    <p>{{ request.committeeReason }}</p>
                  </div>
                }
                @if (request.status === 'approved' || request.status === 'rejected' || request.status === 'disbursed') {
                  <button type="button" class="btn btn-secondary btn-sm" (click)="downloadLetter(request)">
                    {{ 'welfareFund.decisionLetter' | translate }}
                  </button>
                }
              </article>
            }
          </div>
        }
      </section>
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .page-title { display: flex; align-items: center; gap: 0.5rem; }
      .wf-section-title { font-size: 1.05rem; font-weight: 700; margin: 0 0 0.5rem; }
      .wf-list { display: grid; gap: 0.85rem; }
      .wf-item { display: grid; gap: 0.45rem; justify-items: start; padding: 0.85rem; border-radius: 0.5rem; background: var(--surface-2, #f7f7f5); border: 1px solid var(--gray-200, #e5e7eb); }
      .wf-item-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .wf-meta { margin: 0; font-size: 0.82rem; color: var(--gray-600); }
      .wf-reason { margin: 0; font-size: 0.9rem; overflow-wrap: anywhere; }
      .wf-decision { border-inline-start: 3px solid var(--emerald-600, #2e5138); padding-inline-start: 0.6rem; }
      .wf-decision p { margin: 0.2rem 0 0; font-size: 0.9rem; white-space: pre-wrap; overflow-wrap: anywhere; }
      .error-box { background: var(--surface-2, #f7f7f5); border: 1px solid var(--red-600, #9c3a2c); border-radius: 0.5rem; padding: 0.75rem; color: var(--red-600, #9c3a2c); }
    `,
  ],
})
export class WelfareFundComponent implements OnInit {
  readonly requestTypeKeys: WelfareRequestType[] = ['medical', 'emergency', 'education', 'other'];
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
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

  requestTypes(): { key: WelfareRequestType; label: string }[] {
    return this.requestTypeKeys.map((key) => ({ key, label: this.typeLabel(key) }));
  }

  typeLabel(key: WelfareRequestType): string {
    const translated = this.translate.instant('welfareFund.types.' + key);
    return translated.startsWith('welfareFund.types.') ? key : translated;
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
    this.fundControls
      .applyForWelfareFund(this.formType, this.formAmount, this.formReason.trim())
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.formAmount = null;
          this.formReason = '';
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
