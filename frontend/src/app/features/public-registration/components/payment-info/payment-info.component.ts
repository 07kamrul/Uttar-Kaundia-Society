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
  MFS_PAYMENT_METHODS,
  ORG_BANK_INFO,
  ORG_MFS_INFO,
  PAYMENT_METHODS,
  PAYMENT_METHOD_KEYS,
  type PaymentAccount,
  type RegistrationConfig,
  SubscriptionQuote,
} from '../../../../core/models/registration.model';
import { RegistrationService } from '../../../../core/services/registration.service';
import { propertiesArray } from '../../registration-form.builder';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TakaPipe } from '../../../../shared/pipes/bn-pipes';
import { prepareUpload, readAsDataUrl } from '../../file-upload';
import { NO_UI_FLAGS, type RegistrationUiFlags } from '../../registration-ui-flags';

const COPIED_RESET_MS = 2000;
const METHOD_ICONS: Record<string, string> = {
  cash: '💵',
  bkash: '📱',
  nagad: '📱',
  rocket: '📱',
  bank: '🏦',
  other: '➕',
};

const SUBSCRIPTION_QUOTE_DEBOUNCE_MS = 400;

@Component({
  selector: 'app-payment-info',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe, TakaPipe],
  templateUrl: './payment-info.component.html',
})
export class PaymentInfoComponent implements OnInit {
  @Input({ required: true }) form!: FormGroup;
  @Input() submitAttempted = false;
  @Input() feeLoading = false;
  @Input() feeError = false;
  /** Feature flags; all off keeps the original payment step. */
  @Input() ui: RegistrationUiFlags = NO_UI_FLAGS;
  /** Society accounts from the server; null falls back to the built-in details. */
  @Input() config: RegistrationConfig | null = null;
  readonly retryFeeLoad = output<void>();
  // Lets the parent disable "পরবর্তী" while the quote is in flight or failed,
  // the same way it already does for the admission-fee load.
  readonly subscriptionBusyChange = output<boolean>();
  readonly paymentMethods = PAYMENT_METHODS;
  readonly methodKeys = PAYMENT_METHOD_KEYS;
  readonly copiedNumber = signal<string | null>(null);
  readonly subscriptionQuote = signal<SubscriptionQuote | null>(null);
  readonly subscriptionLoading = signal(false);
  readonly subscriptionError = signal(false);
  readonly maxReceiptFileMb = MAX_DOC_FILE_BYTES / (1024 * 1024);
  readonly bankInfo = ORG_BANK_INFO;
  readonly mfsInfo = ORG_MFS_INFO;
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
    return MFS_PAYMENT_METHODS.includes(this.selectedMethod)
      ? 'registration.simplified.payment.refTrx'
      : 'registration.simplified.payment.refReceipt';
  }

  /** Society account details for the chosen method: from the server, else the built-in ones. */
  get accounts(): PaymentAccount[] {
    const method = this.selectedMethod;
    const fromServer = (this.config?.paymentAccounts ?? []).filter((a) => a.method === method);
    if (fromServer.length > 0) return fromServer;
    if (MFS_PAYMENT_METHODS.includes(method)) {
      return [
        {
          method,
          label: `${ORG_MFS_INFO.number} (${ORG_MFS_INFO.type})`,
          number: ORG_MFS_INFO.number,
          accountName: null,
        },
      ];
    }
    if (method === 'bank') {
      return [
        {
          method,
          label: `${ORG_BANK_INFO.bankName}, ${ORG_BANK_INFO.branch} — ${ORG_BANK_INFO.accountName}, ${ORG_BANK_INFO.accountNumber}`,
          number: ORG_BANK_INFO.accountNumber,
          accountName: ORG_BANK_INFO.accountName,
        },
      ];
    }
    return [];
  }

  methodIcon(key: string): string {
    return METHOD_ICONS[key] ?? '';
  }

  async copyNumber(number: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(number);
    } catch {
      return; // Clipboard blocked: the details stay visible to copy by hand.
    }
    this.copiedNumber.set(number);
    this.cdr.markForCheck();
    setTimeout(() => {
      this.copiedNumber.set(null);
      this.cdr.markForCheck();
    }, COPIED_RESET_MS);
  }

  get isBankSelected(): boolean {
    return this.form.get('paymentMethod')?.value === PAYMENT_METHODS[1];
  }

  get isMfsSelected(): boolean {
    return this.form.get('paymentMethod')?.value === PAYMENT_METHODS[2];
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
