import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  Input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { debounceTime } from 'rxjs';
import {
  ALLOWED_DOC_MIME_TYPES,
  MAX_DOC_FILE_BYTES,
  type PaymentAccount,
  type RegistrationConfig,
  SubscriptionQuote,
} from '../../../../core/models/registration.model';
import { accountsForMethod } from '../../../../shared/payment-method/payment-methods';
import { RegistrationService } from '../../../../core/services/registration.service';
import { propertiesArray } from '../../registration-form.builder';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TakaPipe } from '../../../../shared/pipes/bn-pipes';
import { prepareUpload, readAsDataUrl } from '../../file-upload';
import { PaymentMethodPickerComponent } from '../../../../shared/payment-method/payment-method-picker.component';
import { referenceLabelKey } from '../../../../shared/payment-method/payment-methods';
import { NO_UI_FLAGS, type RegistrationUiFlags } from '../../registration-ui-flags';

const SUBSCRIPTION_QUOTE_DEBOUNCE_MS = 400;

@Component({
  selector: 'app-payment-info',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe, TakaPipe, PaymentMethodPickerComponent],
  templateUrl: './payment-info.component.html',
})
export class PaymentInfoComponent implements OnInit {
  @Input({ required: true }) form!: FormGroup;
  @Input() submitAttempted = false;
  @Input() feeLoading = false;
  @Input() feeError = false;
  /** Feature flags; all off keeps the original payment step. */
  @Input() ui: RegistrationUiFlags = NO_UI_FLAGS;
  /** Society accounts from the server; null while loading or after a failed load. */
  @Input() config: RegistrationConfig | null = null;
  readonly retryFeeLoad = output<void>();
  // Lets the parent disable "পরবর্তী" while the quote is in flight or failed,
  // the same way it already does for the admission-fee load.
  readonly subscriptionBusyChange = output<boolean>();
  readonly subscriptionQuote = signal<SubscriptionQuote | null>(null);
  readonly subscriptionLoading = signal(false);
  readonly subscriptionError = signal(false);
  readonly maxReceiptFileMb = MAX_DOC_FILE_BYTES / (1024 * 1024);
  receiptFileError = '';

  private readonly translate = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly registrationService = inject(RegistrationService);

  constructor(private destroyRef: DestroyRef) {}

  ngOnInit(): void {
    this.loadSubscriptionQuote();
    this.properties.valueChanges
      .pipe(debounceTime(SUBSCRIPTION_QUOTE_DEBOUNCE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadSubscriptionQuote());
  }

  private get properties(): FormArray {
    return propertiesArray(this.form);
  }

  private totalShareQuantity(): number {
    return this.properties.controls.reduce((sum, property) => {
      const value = parseFloat(property.get('myShareQuantity')?.value);
      return sum + (Number.isFinite(value) && value > 0 ? value : 0);
    }, 0);
  }

  // The চাঁদা amount is always backend-quoted from the admin-configured,
  // tiered Fee Settings - never computed or hard-coded on the client, and
  // never restored from a saved draft (see RegistrationDraftService).
  loadSubscriptionQuote(): void {
    const totalDecimal = this.totalShareQuantity();

    if (totalDecimal <= 0) {
      this.subscriptionQuote.set(null);
      this.subscriptionError.set(false);
      this.form.get('subscription')?.setValue('', { emitEvent: false });
      this.subscriptionBusyChange.emit(false);
      return;
    }

    this.subscriptionLoading.set(true);
    this.subscriptionError.set(false);
    this.subscriptionBusyChange.emit(true);
    this.registrationService
      .getSubscriptionQuote(totalDecimal)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (quote) => {
          this.subscriptionLoading.set(false);
          this.subscriptionQuote.set(quote);
          this.form.get('subscription')?.setValue(quote.total, { emitEvent: false });
          this.subscriptionBusyChange.emit(false);
          this.cdr.markForCheck();
        },
        error: () => {
          this.subscriptionLoading.set(false);
          this.subscriptionError.set(true);
          this.subscriptionQuote.set(null);
          this.form.get('subscription')?.setValue('', { emitEvent: false });
          this.subscriptionBusyChange.emit(true);
          this.cdr.markForCheck();
        },
      });
  }

  async onReceiptFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;

    if (!ALLOWED_DOC_MIME_TYPES.includes(picked.type)) {
      this.receiptFileError = this.translate.instant('registration.payment.fileTypeError');
      return;
    }
    // Screenshots and phone photos are shrunk first (simplified UI); only the result is size-checked.
    const file = await prepareUpload(picked, this.ui.simplified);
    if (file.size > MAX_DOC_FILE_BYTES) {
      this.receiptFileError = this.translate.instant('registration.payment.fileSizeError', {
        maxMb: this.maxReceiptFileMb,
      });
      this.cdr.markForCheck();
      return;
    }
    this.receiptFileError = '';
    this.form.patchValue({
      receiptFileName: file.name,
      receiptFileDataUrl: await readAsDataUrl(file),
    });
    this.cdr.markForCheck();
  }

  removeReceiptFile(): void {
    this.form.patchValue({ receiptFileName: '', receiptFileDataUrl: '' });
  }

  selectMethod(method: string): void {
    this.form.get('paymentMethod')?.setValue(method);
    this.autoSelectAccount(method);
  }

  /** Picking a method picks its first active account (single-account case is then automatic). */
  private autoSelectAccount(method: string): void {
    const accounts = accountsForMethod(method, this.config?.paymentAccounts ?? []);
    this.setAccount(accounts[0] ?? null);
  }

  private setAccount(account: PaymentAccount | null): void {
    this.form.get('paymentAccountId')?.setValue(account?.id ?? null);
  }

  onAccountChange(accountId: number): void {
    this.form.get('paymentAccountId')?.setValue(accountId);
  }

  get selectedAccountId(): number | null {
    return this.form.get('paymentAccountId')?.value ?? null;
  }

  /** The abroad note only matters to members who ticked "বিদেশে থাকি". */
  get isAbroad(): boolean {
    return this.ui.abroadAddress && this.form.get('currentAddressAbroad')?.value === true;
  }

  get selectedMethod(): string {
    return this.form.get('paymentMethod')?.value ?? '';
  }

  /** TrxID for mobile banking, receipt number for cash, bank and other. */
  get referenceLabelKey(): string {
    return referenceLabelKey(this.selectedMethod);
  }

  showError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.touched || this.submitAttempted);
  }

  errorMessage(controlName: string): string {
    const keys: Record<string, string> = {
      admissionFee: 'registration.payment.admissionFeeRequired',
      subscription: 'registration.payment.subscriptionRequired',
      paymentMethod: 'registration.payment.paymentMethodRequired',
    };
    const key = keys[controlName];
    return key ? this.translate.instant(key) : '';
  }
}
