import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  ChangeDetectorRef,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PAYMENT_METHOD_KEYS, type PaymentAccount } from '../../core/models/registration.model';
import { METHOD_ICONS, accountsForMethod } from './payment-methods';

const COPIED_RESET_MS = 2000;

/**
 * Method cards plus the society's account details with a copy button. Shared by
 * the registration payment step and the member pay flow so both behave the same.
 */
@Component({
  selector: 'app-payment-method-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="method-cards" role="radiogroup" [attr.aria-label]="'registration.simplified.payment.methodTitle' | translate">
      @for (key of methodKeys; track key) {
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
          {{ 'registration.simplified.payment.methods.' + key | translate }}
        </button>
      }
    </div>
    @if (accounts().length > 0) {
      <div class="account-box" data-testid="account-box">
        <h3>{{ 'registration.simplified.payment.accountTitle' | translate }}</h3>
        @for (account of accounts(); track $index) {
          <div class="account-row">
            <span class="account-details">{{ account.label }}</span>
            @if (account.number) {
              <button type="button" class="btn btn-secondary copy-btn tap-48" data-testid="copy-account" (click)="copy(account.number)">
                <span aria-hidden="true">📋</span>
                {{ (copied() === account.number ? 'registration.simplified.payment.copied' : 'registration.simplified.payment.copy') | translate }}
              </button>
            }
          </div>
        }
      </div>
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
    .account-box { padding: 0.75rem 1rem; margin: 0.75rem 0; border: 1px solid var(--gray-300, #d1d5db); border-radius: 0.75rem; }
    @media (max-width: 340px) { .method-cards { grid-template-columns: 1fr; } }
    .method-card { min-width: 0; overflow-wrap: anywhere; }
    .account-details { min-width: 0; overflow-wrap: anywhere; }
    .account-box h3 { margin: 0 0 0.5rem; font-size: 1rem; }
    .account-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .copy-btn { min-height: 48px; display: inline-flex; align-items: center; gap: 0.5rem; }
  `,
})
export class PaymentMethodPickerComponent {
  readonly method = input('');
  /** Accounts from the server; the built-in details fill in when it has none for a method. */
  readonly serverAccounts = input<readonly PaymentAccount[]>([]);
  readonly methodChange = output<string>();

  readonly methodKeys = PAYMENT_METHOD_KEYS;
  readonly copied = signal<string | null>(null);
  readonly accounts = computed(() => accountsForMethod(this.method(), this.serverAccounts()));
  private readonly cdr = inject(ChangeDetectorRef);

  icon(key: string): string {
    return METHOD_ICONS[key] ?? '';
  }

  async copy(number: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(number);
    } catch {
      return; // Clipboard blocked: the details stay visible to copy by hand.
    }
    this.copied.set(number);
    this.cdr.markForCheck();
    setTimeout(() => {
      this.copied.set(null);
      this.cdr.markForCheck();
    }, COPIED_RESET_MS);
  }
}
