import {
  ChangeDetectionStrategy,
  Component,
  ChangeDetectorRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  accountCopyNumber,
  type PaymentAccount,
} from '../../core/models/registration.model';
import { copyText } from '../phone/copy-text';
import { METHOD_ICONS, accountsForMethod, availableAccountMethods } from './payment-methods';

const COPIED_RESET_MS = 2000;

/**
 * Method cards plus the society's active accounts with copy buttons. Shared by
 * the registration payment step and the member pay flow. Account-backed method
 * options only appear when the server has an active account for them, and a
 * specific account (emitted as selectedAccountId) must be picked before submit.
 */
@Component({
  selector: 'app-payment-method-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    @if (loading()) {
      <div class="method-cards" data-testid="picker-loading" aria-hidden="true">
        @for (n of [1, 2, 3, 4]; track n) { <div class="method-card skeleton"></div> }
      </div>
    } @else if (loadError()) {
      <div class="picker-error" data-testid="picker-error">
        <p>{{ 'paymentAccounts.loadFailed' | translate }}</p>
        <button type="button" class="btn btn-secondary tap-48" (click)="retry.emit()">
          {{ 'paymentAccounts.retry' | translate }}
        </button>
      </div>
    } @else {
      <div class="method-cards" role="radiogroup" [attr.aria-label]="'registration.simplified.payment.methodTitle' | translate">
        @for (key of availableMethods(); track key) {
          <button
            type="button"
            role="radio"
            class="method-card tap-48"
            [attr.data-testid]="'method-' + key"
            [attr.aria-checked]="method() === key"
            [class.is-selected]="method() === key"
            (click)="methodChange.emit(key)"
          >
            <span aria-hidden="true">{{ icon(key) }}</span>
            {{ methodLabel(key) | translate }}
          </button>
        }
      </div>
      @if (methodAccounts().length > 0) {
        <div class="account-box" data-testid="account-box">
          <h3>{{ 'registration.simplified.payment.accountTitle' | translate }}</h3>
          @for (account of methodAccounts(); track account.id) {
            <div
              class="account-row"
              [class.is-selected]="isSelected(account)"
              (click)="chooseAccount(account)"
            >
              <label class="account-main">
                <input
                  type="radio"
                  [name]="accountIdGroup"
                  [checked]="isSelected(account)"
                  (change)="chooseAccount(account)"
                />
                <span class="account-details">
                  <strong>{{ account.label }}</strong>
                  <span>{{ accountSummary(account) }}</span>
                </span>
              </label>
              @if (qrUrl(account)) {
                <img [src]="qrUrl(account)" alt="" class="account-qr" />
              }
              <button type="button" class="btn btn-secondary copy-btn tap-48" data-testid="copy-account" (click)="copyNumber(account, $event)">
                <span aria-hidden="true">📋</span>
                {{ (copiedId() === account.id ? 'registration.simplified.payment.copied' : 'registration.simplified.payment.copy') | translate }}
              </button>
            </div>
            @if (account.instructions) {
              <p class="account-instructions">{{ account.instructions }}</p>
            }
          }
        </div>
      }
    }
  `,
  styles: `
    .method-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6rem; }
    .method-card {
      display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
      min-height: 48px; padding: 0.9rem 0.5rem; font: inherit; font-size: 1.05rem; font-weight: 600;
      background: var(--surface, #fff); color: inherit; border: 2px solid var(--gray-300, #d1d5db);
      border-radius: 0.75rem; cursor: pointer;
    }
    .method-card.is-selected { border-color: var(--emerald-600, #059669); background: var(--emerald-50, #ecfdf5); }
    .skeleton { background: linear-gradient(90deg, var(--gray-100, #f3f4f6) 25%, var(--gray-200, #e5e7eb) 50%, var(--gray-100, #f3f4f6) 75%); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
    .picker-error p { margin: 0 0 0.5rem; }
    .account-box { padding: 0.75rem 1rem; margin: 0.75rem 0; border: 1px solid var(--gray-300, #d1d5db); border-radius: 0.75rem; }
    @media (max-width: 340px) { .method-cards { grid-template-columns: 1fr; } }
    .method-card { min-width: 0; overflow-wrap: anywhere; }
    .account-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.5rem; border: 1px solid transparent; border-radius: 0.5rem; cursor: pointer; }
    .account-row.is-selected { border-color: var(--emerald-600, #059669); background: var(--emerald-50, #ecfdf5); }
    .account-main { display: flex; align-items: flex-start; gap: 0.5rem; min-width: 0; flex: 1; }
    .account-details { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
    .account-qr { width: 64px; height: 64px; object-fit: contain; border: 1px solid var(--gray-200, #e5e7eb); border-radius: 0.375rem; }
    .account-instructions { font-size: 0.8125rem; color: var(--gray-600, #4b5563); margin: 0.25rem 0 0; }
    .account-box h3 { margin: 0 0 0.5rem; font-size: 1rem; }
    .copy-btn { min-height: 48px; display: inline-flex; align-items: center; gap: 0.5rem; }
  `,
})
export class PaymentMethodPickerComponent {
  readonly method = input('');
  /** Active accounts from the server; a method with none of these is not offered. */
  readonly serverAccounts = input<readonly PaymentAccount[]>([]);
  readonly loading = input(false);
  readonly loadError = input(false);
  readonly selectedAccountId = input<number | null>(null);
  readonly methodChange = output<string>();
  readonly accountChange = output<number>();
  readonly retry = output<void>();

  readonly copiedId = signal<number | null>(null);
  private readonly cdr = inject(ChangeDetectorRef);
  private static nextGroupId = 0;
  protected readonly accountIdGroup = `picker-accounts-${++PaymentMethodPickerComponent.nextGroupId}`;

  /** cash/other are always offered; account-backed keys only when an active account exists. */
  readonly availableMethods = computed(() => [
    'cash',
    ...availableAccountMethods(this.serverAccounts()),
    'other',
  ]);
  readonly methodAccounts = computed(() =>
    accountsForMethod(this.method(), this.serverAccounts()),
  );

  icon(key: string): string {
    return METHOD_ICONS[key] ?? '';
  }

  methodLabel(key: string): string {
    const account = this.serverAccounts().find((a) => a.method === key);
    return account ? 'paymentAccounts.methodNames.' + key : 'registration.simplified.payment.methods.' + key;
  }

  accountSummary(account: PaymentAccount): string {
    const parts =
      account.type === 'bank'
        ? [account.accountNumber, account.routingNumber ? `রাউটিং ${account.routingNumber}` : null]
        : [account.mfsNumber];
    return parts.filter(Boolean).join(' · ');
  }

  qrUrl(account: PaymentAccount): string | null {
    return account.qrImageUrl || null;
  }

  isSelected(account: PaymentAccount): boolean {
    return this.selectedAccountId() === account.id;
  }

  chooseAccount(account: PaymentAccount): void {
    this.accountChange.emit(account.id);
  }

  async copyNumber(account: PaymentAccount, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await copyText(accountCopyNumber(account));
    } catch {
      return; // Clipboard blocked: the details stay visible to copy by hand.
    }
    this.copiedId.set(account.id);
    this.cdr.markForCheck();
    setTimeout(() => {
      this.copiedId.set(null);
      this.cdr.markForCheck();
    }, COPIED_RESET_MS);
  }
}
