import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { map, switchMap } from 'rxjs';
import type { Observable } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  AdminPaymentAccountsService,
  accountIdentityLine,
  type AdminPaymentAccount,
  type PaymentAccountInput,
  type PaymentAccountStatus,
  type PaymentAccountType,
} from '../../../../core/services/admin-payment-accounts.service';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { ConfirmModalComponent } from '../../../../shared/confirm-modal/confirm-modal.component';

const MFS_PROVIDERS: { value: string; labelKey: string }[] = [
  { value: 'bkash', labelKey: 'paymentAccounts.providers.bkash' },
  { value: 'nagad', labelKey: 'paymentAccounts.providers.nagad' },
  { value: 'rocket', labelKey: 'paymentAccounts.providers.rocket' },
  { value: 'upay', labelKey: 'paymentAccounts.providers.upay' },
  { value: 'other', labelKey: 'paymentAccounts.providers.other' },
];

const ACCOUNT_KINDS: { value: string; labelKey: string }[] = [
  { value: 'personal', labelKey: 'paymentAccounts.kinds.personal' },
  { value: 'agent', labelKey: 'paymentAccounts.kinds.agent' },
  { value: 'merchant', labelKey: 'paymentAccounts.kinds.merchant' },
];

/** 422/409 detail codes from the backend translated for the admin. */
const ERROR_KEYS: Record<string, string> = {
  PAYMENT_ACCOUNT_TYPE_INVALID: 'paymentAccounts.errors.typeInvalid',
  BANK_NAME_REQUIRED: 'paymentAccounts.errors.bankNameRequired',
  ACCOUNT_NUMBER_INVALID: 'paymentAccounts.errors.accountNumberInvalid',
  ROUTING_NUMBER_INVALID: 'paymentAccounts.errors.routingNumberInvalid',
  MFS_NUMBER_INVALID: 'paymentAccounts.errors.mfsNumberInvalid',
  DUPLICATE_ACCOUNT: 'paymentAccounts.errors.duplicate',
  PAYMENT_ACCOUNT_NOT_FOUND: 'paymentAccounts.errors.notFound',
  PAYMENT_ACCOUNT_TYPE_MISMATCH: 'paymentAccounts.errors.typeMismatch',
  PAYMENT_ACCOUNT_INACTIVE: 'paymentAccounts.errors.inactive',
};

/** Type tabs + status filter + reorder/activate rows, and a guided type-dependent form. */
@Component({
  selector: 'app-payment-accounts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent, SectionLoaderComponent, ConfirmModalComponent],
  templateUrl: './payment-accounts.component.html',
  styleUrl: './payment-accounts.component.scss',
})
export class PaymentAccountsComponent implements OnInit {
  readonly typeTabs: { value: PaymentAccountType | 'all'; labelKey: string }[] = [
    { value: 'all', labelKey: 'paymentAccounts.typeTabs.all' },
    { value: 'bank', labelKey: 'paymentAccounts.typeTabs.bank' },
    { value: 'mfs', labelKey: 'paymentAccounts.typeTabs.mfs' },
  ];
  readonly statusFilters: { value: PaymentAccountStatus | 'all'; labelKey: string }[] = [
    { value: 'all', labelKey: 'paymentAccounts.statusFilters.all' },
    { value: 'active', labelKey: 'paymentAccounts.statusFilters.active' },
    { value: 'inactive', labelKey: 'paymentAccounts.statusFilters.inactive' },
  ];
  readonly providers = MFS_PROVIDERS;
  readonly kinds = ACCOUNT_KINDS;

  readonly identityLine = accountIdentityLine;

  typeFilter: PaymentAccountType | 'all' = 'all';
  statusFilter: PaymentAccountStatus | 'all' = 'all';
  accounts: AdminPaymentAccount[] = [];
  loading = true;
  loadFailed = false;

  /** Edit/create modal state; null `editing` means "create". */
  formOpen = false;
  editing: AdminPaymentAccount | null = null;
  formType: PaymentAccountType = 'bank';
  formLabel = '';
  formBankName = '';
  formBranchName = '';
  formAccountName = '';
  formAccountNumber = '';
  formRoutingNumber = '';
  formProvider = 'bkash';
  formMfsNumber = '';
  formAccountKind = 'personal';
  formAccountHolder = '';
  formInstructions = '';
  qrFile: File | null = null;
  qrPreview = '';
  saving = false;
  formError = '';

  confirmOpen = false;
  confirmTitle = '';
  confirmMessage = '';
  private pendingToggle: AdminPaymentAccount | null = null;
  toggling = false;

  private readonly accountsService = inject(AdminPaymentAccountsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly translate = inject(TranslateService);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadFailed = false;
    this.accountsService
      .list({
        type: this.typeFilter === 'all' ? undefined : this.typeFilter,
        status: this.statusFilter === 'all' ? undefined : this.statusFilter,
      })
      .subscribe({
        next: (rows) => {
          this.accounts = rows;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadFailed = true;
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  setTypeFilter(value: PaymentAccountType | 'all'): void {
    this.typeFilter = value;
    this.load();
  }

  setStatusFilter(value: PaymentAccountStatus | 'all'): void {
    this.statusFilter = value;
    this.load();
  }

  // --- Create / edit -------------------------------------------------------

  openCreate(): void {
    this.editing = null;
    this.formType = 'bank';
    this.formLabel = '';
    this.formBankName = '';
    this.formBranchName = '';
    this.formAccountName = '';
    this.formAccountNumber = '';
    this.formRoutingNumber = '';
    this.formProvider = 'bkash';
    this.formMfsNumber = '';
    this.formAccountKind = 'personal';
    this.formAccountHolder = '';
    this.formInstructions = '';
    this.qrFile = null;
    this.qrPreview = '';
    this.formError = '';
    this.formOpen = true;
  }

  openEdit(account: AdminPaymentAccount): void {
    this.editing = account;
    this.formType = account.type;
    this.formLabel = account.label;
    this.formBankName = account.bankName ?? '';
    this.formBranchName = account.branchName ?? '';
    this.formAccountName = account.accountName ?? '';
    this.formAccountNumber = account.accountNumber ?? '';
    this.formRoutingNumber = account.routingNumber ?? '';
    this.formProvider = account.provider ?? 'bkash';
    this.formMfsNumber = account.mfsNumber ?? '';
    this.formAccountKind = account.accountKind ?? 'personal';
    this.formAccountHolder = account.accountHolder ?? '';
    this.formInstructions = account.instructions ?? '';
    this.qrFile = null;
    this.qrPreview = account.qrImageUrl ?? '';
    this.formError = '';
    this.formOpen = true;
  }

  closeForm(): void {
    if (!this.saving) this.formOpen = false;
  }

  setFormType(type: PaymentAccountType): void {
    this.formType = type;
  }

  onQrSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.qrFile = file;
    this.qrPreview = file ? URL.createObjectURL(file) : (this.editing?.qrImageUrl ?? '');
  }

  payload(): PaymentAccountInput {
    const base: PaymentAccountInput = {
      type: this.formType,
      label: this.formLabel.trim(),
      instructions: this.formInstructions.trim() || undefined,
    };
    if (this.formType === 'bank') {
      return {
        ...base,
        bankName: this.formBankName.trim(),
        branchName: this.formBranchName.trim() || undefined,
        accountName: this.formAccountName.trim(),
        accountNumber: this.formAccountNumber.trim(),
        routingNumber: this.formRoutingNumber.trim() || undefined,
      };
    }
    return {
      ...base,
      provider: this.formProvider,
      mfsNumber: this.formMfsNumber.trim(),
      accountKind: this.formAccountKind,
      accountHolder: this.formAccountHolder.trim() || undefined,
    };
  }

  save(): void {
    if (this.saving) return;
    this.saving = true;
    this.formError = '';
    const request = this.editing
      ? this.accountsService.update(this.editing.id, this.payload())
      : this.accountsService.create(this.payload());
    const withQr = this.qrFile
      ? request.pipe(
          switchMap(() => this.accountsService.uploadQr(this.qrFile!)),
          map(() => null as AdminPaymentAccount | null),
        )
      : request.pipe(map((r) => r as AdminPaymentAccount | null));
    withQr.subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.load();
      },
      error: (err: unknown) => {
        this.saving = false;
        this.formError = this.errorMessage(err);
        this.cdr.markForCheck();
      },
    });
  }

  private errorMessage(err: unknown): string {
    const detail = (err as HttpErrorResponse).error?.detail;
    if (typeof detail === 'string' && ERROR_KEYS[detail]) {
      return this.translate.instant(ERROR_KEYS[detail]);
    }
    if (Array.isArray(detail) && detail.length > 0 && typeof detail[0]?.msg === 'string') {
      return detail[0].msg;
    }
    return this.translate.instant('paymentAccounts.errors.saveFailed');
  }

  // --- Activate / deactivate ----------------------------------------------

  askToggle(account: AdminPaymentAccount): void {
    this.pendingToggle = account;
    const deactivating = account.status === 'active';
    const lastOfType =
      deactivating &&
      this.accounts.filter((a) => a.type === account.type && a.status === 'active').length <= 1;
    this.confirmTitle = this.translate.instant(
      deactivating ? 'paymentAccounts.confirm.deactivateTitle' : 'paymentAccounts.confirm.activateTitle',
    );
    const key = lastOfType
      ? 'paymentAccounts.confirm.deactivateLastWarning'
      : deactivating
        ? 'paymentAccounts.confirm.deactivateMessage'
        : 'paymentAccounts.confirm.activateMessage';
    this.confirmMessage = this.translate.instant(key, { label: account.label });
    this.confirmOpen = true;
  }

  confirmToggle(): void {
    const account = this.pendingToggle;
    if (!account || this.toggling) return;
    this.toggling = true;
    const next: PaymentAccountStatus = account.status === 'active' ? 'inactive' : 'active';
    this.accountsService.setStatus(account.id, next).subscribe({
      next: () => {
        this.toggling = false;
        this.confirmOpen = false;
        this.pendingToggle = null;
        this.load();
      },
      error: () => {
        this.toggling = false;
        this.confirmOpen = false;
        this.pendingToggle = null;
        this.load();
      },
    });
  }

  cancelToggle(): void {
    if (!this.toggling) {
      this.confirmOpen = false;
      this.pendingToggle = null;
    }
  }

  // --- Reorder (up/down swap, pattern from config-lists) -------------------

  move(account: AdminPaymentAccount, delta: -1 | 1): void {
    const ids = this.accounts.map((a) => a.id);
    const index = ids.indexOf(account.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    this.accountsService.reorder(ids).subscribe({
      next: () => this.load(),
      error: () => this.load(),
    });
  }

  canMove(account: AdminPaymentAccount, delta: -1 | 1): boolean {
    const index = this.accounts.indexOf(account);
    const target = index + delta;
    return target >= 0 && target < this.accounts.length;
  }
}
