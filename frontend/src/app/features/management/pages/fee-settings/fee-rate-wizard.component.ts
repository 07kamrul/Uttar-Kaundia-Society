import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toUserMessageKey } from '../../../../core/errors/user-error';
import type { FeeSetting } from '../../../../core/models/admin.model';
import { AdminService, type AdminFeeType } from '../../../../core/services/admin.service';
import { toAsciiDigits } from '../../../../core/utils/bd-input';
import { DatePickerComponent } from '../../../../shared/date-picker/date-picker.component';
import { formatBnDate, formatBnNumber, formatTakaAmount } from '../../../../shared/pipes/bn-format';
import {
  currentRate,
  effectiveDateBounds,
  futureVersion,
  isAmountAllowed,
  isEffectiveDateAllowed,
  isWizardFee,
  todayIso,
} from './fee-rate-logic';

type WizardStep = 1 | 2 | 3;

const TOTAL_STEPS = 3;
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * "নতুন রেট চালু করুন": pick a fixed fee, type the new amount, choose when it
 * starts and confirm old -> new. Uses the existing fee-settings endpoints; the
 * server keeps the previous rate running until the day before the new one starts.
 */
@Component({
  selector: 'app-fee-rate-wizard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, DatePickerComponent],
  template: `
    <section class="card card-pad section-card" data-testid="wiz-root">
      <h2 class="section-title">{{ 'admin.feeSettings.wizard.title' | translate }}</h2>

      @if (done(); as finished) {
        <div class="success-banner" role="status" data-testid="wiz-done">
          {{ 'admin.feeSettings.wizard.done' | translate: { date: day(finished.date) } }}
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" data-testid="wiz-again" (click)="startOver()">
            {{ 'admin.feeSettings.wizard.again' | translate }}
          </button>
        </div>
      } @else if (wizardFees().length === 0) {
        <p data-testid="wiz-no-fees">{{ 'admin.feeSettings.wizard.noFees' | translate }}</p>
        @if (hasOtherShapes()) {
          <p class="field-hint" data-testid="wiz-other-hint">{{ 'admin.feeSettings.wizard.otherHint' | translate }}</p>
        }
      } @else {
        <p class="field-hint" data-testid="wiz-step">
          {{ 'admin.feeSettings.wizard.step' | translate: stepParams() }}
        </p>
        <div class="wizard-progress" aria-hidden="true">
          @for (n of [1, 2, 3]; track n) {
            <span class="wizard-progress-seg" [class.is-done]="n <= step()"></span>
          }
        </div>

        @if (step() === 1) {
          <h3 class="wizard-heading">{{ 'admin.feeSettings.wizard.feeStep' | translate }}</h3>
          <div class="field">
            <label for="wizFee">{{ 'admin.feeSettings.wizard.feeLabel' | translate }}</label>
            <select id="wizFee" data-testid="wiz-fee" (change)="onFeeChange($any($event.target).value)">
              <option value="" [selected]="selectedKey() === ''">{{ 'admin.feeSettings.wizard.choose' | translate }}</option>
              @for (ft of wizardFees(); track ft.key) {
                <option [value]="ft.key" [selected]="ft.key === selectedKey()">{{ label(ft) }}</option>
              }
            </select>
          </div>

          @if (historyFailed()) {
            <div class="error-box" role="alert" data-testid="wiz-error">
              <p style="margin: 0 0 0.5rem">{{ 'admin.feeSettings.wizard.historyError' | translate }}</p>
              <button type="button" class="btn btn-secondary" data-testid="wiz-retry" (click)="reloadHistory()">
                {{ 'admin.feeSettings.wizard.retry' | translate }}
              </button>
            </div>
          } @else if (history()) {
            @if (current(); as rate) {
              <p data-testid="wiz-current">
                {{ 'admin.feeSettings.wizard.current' | translate: { amount: money(rate.value), date: day(rate.startDate) } }}
              </p>
            } @else {
              <p data-testid="wiz-current-none">{{ 'admin.feeSettings.wizard.noCurrent' | translate }}</p>
            }
            @if (scheduled(); as upcoming) {
              <div class="error-box" role="status" data-testid="wiz-scheduled">
                {{ 'admin.feeSettings.wizard.scheduled' | translate: { amount: money(upcoming.value), date: day(upcoming.startDate) } }}
              </div>
            }
          }

          <div class="field">
            <label for="wizAmount">{{ 'admin.feeSettings.wizard.newAmount' | translate }}</label>
            <input
              id="wizAmount"
              data-testid="wiz-amount"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              [value]="amountText()"
              [disabled]="history() === null"
              (input)="onAmountInput($any($event.target).value)"
            />
            @if (sameAsCurrent()) {
              <p class="field-hint" data-testid="wiz-same">{{ 'admin.feeSettings.wizard.same' | translate }}</p>
            }
          </div>
          @if (hasOtherShapes()) {
            <p class="field-hint" data-testid="wiz-other-hint">{{ 'admin.feeSettings.wizard.otherHint' | translate }}</p>
          }
        }

        @if (step() === 2) {
          <h3 class="wizard-heading">{{ 'admin.feeSettings.wizard.dateStep' | translate }}</h3>
          <div class="field">
            <label for="wizDate">{{ 'admin.feeSettings.wizard.dateLabel' | translate }}</label>
            <app-date-picker
              inputId="wizDate"
              [value]="effectiveDate()"
              [min]="bounds().min"
              [max]="bounds().max"
              [placeholder]="'admin.feeSettings.wizard.dateLabel' | translate"
              (valueChange)="effectiveDate.set($event)"
            ></app-date-picker>
            <p class="field-hint">{{ 'admin.feeSettings.wizard.dateHint' | translate }}</p>
          </div>
        }

        @if (step() === 3) {
          <h3 class="wizard-heading">{{ 'admin.feeSettings.wizard.confirmStep' | translate }}</h3>
          <p class="wizard-summary" data-testid="wiz-summary">
            @if (current(); as rate) {
              {{ 'admin.feeSettings.wizard.summary' | translate: { old: money(rate.value), new: money(amount()), date: day(effectiveDate()) } }}
            } @else {
              {{ 'admin.feeSettings.wizard.summaryNoOld' | translate: { new: money(amount()), date: day(effectiveDate()) } }}
            }
          </p>
          @if (saveErrorKey(); as errorKey) {
            <div class="error-box" role="alert" data-testid="wiz-error">{{ errorKey | translate }}</div>
          }
        }

        <div class="form-actions wizard-actions">
          @if (step() > 1) {
            <button type="button" class="btn btn-secondary" data-testid="wiz-back" [disabled]="saving()" (click)="back()">
              {{ 'admin.feeSettings.wizard.back' | translate }}
            </button>
          }
          @if (step() < 3) {
            <button type="button" class="btn btn-primary" data-testid="wiz-next" [disabled]="!canNext()" (click)="next()">
              {{ 'admin.feeSettings.wizard.next' | translate }}
            </button>
          } @else {
            <button type="button" class="btn btn-primary" data-testid="wiz-confirm" [disabled]="saving()" (click)="confirm()">
              {{ (saving() ? 'admin.feeSettings.wizard.saving' : 'admin.feeSettings.wizard.confirm') | translate }}
            </button>
          }
        </div>
      }
    </section>
  `,
  styles: `
    .wizard-heading {
      margin: 0.5rem 0 0.75rem;
      font-size: 1.05rem;
    }
    .wizard-summary {
      font-size: 1.05rem;
      font-weight: 600;
    }
    .wizard-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .wizard-actions .btn {
      min-height: 48px;
    }
    .wizard-progress {
      display: flex;
      gap: 0.35rem;
      margin: 0.25rem 0 0.75rem;
    }
    .wizard-progress-seg {
      flex: 1;
      height: 0.35rem;
      border-radius: 999px;
      background: var(--gray-200);
    }
    .wizard-progress-seg.is-done {
      background: var(--emerald-600);
    }
    @media (max-width: 639.98px) {
      .wizard-actions {
        flex-direction: column-reverse;
      }
      .wizard-actions .btn {
        width: 100%;
      }
    }
  `,
})
export class FeeRateWizardComponent {
  private readonly admin = inject(AdminService);
  private readonly translate = inject(TranslateService);

  readonly feeTypes = input.required<AdminFeeType[]>();
  /** `yyyy-MM-dd`; an input so tests can pin the calendar day. */
  readonly today = input<string>(todayIso());
  /** Emitted after a rate was saved so the page can reload its fee list. */
  readonly saved = output<void>();

  readonly step = signal<WizardStep>(1);
  readonly selectedKey = signal('');
  readonly history = signal<FeeSetting[] | null>(null);
  readonly historyFailed = signal(false);
  readonly amountText = signal('');
  readonly effectiveDate = signal('');
  readonly saving = signal(false);
  readonly saveErrorKey = signal<string | null>(null);
  readonly done = signal<{ date: string } | null>(null);

  private readonly lang = computed(() => (this.translate.currentLang() === 'en' ? 'en' : 'bn'));

  readonly wizardFees = computed(() => this.feeTypes().filter(isWizardFee));
  readonly hasOtherShapes = computed(() => this.feeTypes().some((ft) => ft.isActive && !isWizardFee(ft)));
  readonly selectedFee = computed(() => this.wizardFees().find((ft) => ft.key === this.selectedKey()) ?? null);
  readonly current = computed(() => {
    const rows = this.history();
    return rows ? currentRate(rows, this.today()) : null;
  });
  readonly scheduled = computed(() => {
    const rows = this.history();
    return rows ? futureVersion(rows, this.today()) : null;
  });
  readonly amount = computed<number | null>(() => {
    const cleaned = toAsciiDigits(this.amountText()).replace(/,/g, '').trim();
    return AMOUNT_PATTERN.test(cleaned) ? Number(cleaned) : null;
  });
  readonly sameAsCurrent = computed(() => {
    const amount = this.amount();
    const rate = this.current();
    return isAmountAllowed(amount) && rate !== null && Number(rate.value) === amount;
  });
  readonly bounds = computed(() => effectiveDateBounds(this.today()));
  readonly stepParams = computed(() => ({
    current: formatBnNumber(this.step(), this.lang()),
    total: formatBnNumber(TOTAL_STEPS, this.lang()),
  }));

  readonly canNext = computed(() => {
    if (this.step() === 1) {
      return (
        this.selectedFee() !== null &&
        this.history() !== null &&
        this.scheduled() === null &&
        isAmountAllowed(this.amount()) &&
        !this.sameAsCurrent()
      );
    }
    return isEffectiveDateAllowed(this.effectiveDate(), this.today());
  });

  label(fee: AdminFeeType): string {
    return this.lang() === 'bn' ? fee.labelBn : fee.labelEn;
  }

  money(value: number | null): string {
    return formatTakaAmount(value, this.lang());
  }

  day(iso: string): string {
    return formatBnDate(iso, this.lang());
  }

  onFeeChange(key: string): void {
    this.selectedKey.set(key);
    this.history.set(null);
    this.historyFailed.set(false);
    this.saveErrorKey.set(null);
    if (key) this.loadHistory(key);
  }

  reloadHistory(): void {
    const key = this.selectedKey();
    if (key) this.loadHistory(key);
  }

  onAmountInput(text: string): void {
    this.amountText.set(text);
  }

  next(): void {
    if (!this.canNext()) return;
    if (this.step() === 1) {
      if (!this.effectiveDate()) this.effectiveDate.set(this.today());
      this.step.set(2);
    } else if (this.step() === 2) {
      this.step.set(3);
    }
  }

  back(): void {
    if (this.saving()) return;
    this.saveErrorKey.set(null);
    if (this.step() === 3) this.step.set(2);
    else if (this.step() === 2) this.step.set(1);
  }

  confirm(): void {
    const fee = this.selectedFee();
    const amount = this.amount();
    const startDate = this.effectiveDate();
    if (this.saving() || !fee || !isAmountAllowed(amount)) return;
    if (!isEffectiveDateAllowed(startDate, this.today())) return;

    this.saving.set(true);
    this.saveErrorKey.set(null);
    this.admin
      .createFeeSettingVersion({
        key: fee.key,
        value: amount,
        unit: fee.unit,
        startDate,
        feeCategory: fee.feeCategory,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.done.set({ date: startDate });
          this.saved.emit();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.saveErrorKey.set(toUserMessageKey(err));
        },
      });
  }

  startOver(): void {
    this.done.set(null);
    this.step.set(1);
    this.selectedKey.set('');
    this.history.set(null);
    this.historyFailed.set(false);
    this.amountText.set('');
    this.effectiveDate.set('');
    this.saveErrorKey.set(null);
  }

  private loadHistory(key: string): void {
    this.historyFailed.set(false);
    this.admin.getFeeSettingHistory(key).subscribe({
      next: (rows) => {
        if (this.selectedKey() === key) this.history.set(rows);
      },
      error: () => {
        if (this.selectedKey() === key) this.historyFailed.set(true);
      },
    });
  }
}
