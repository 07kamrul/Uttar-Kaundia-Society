import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map, type Observable } from 'rxjs';
import { errorCodeOf } from '../../../../core/errors/user-error';
import {
  InstallmentPaymentService,
  type AdminInstallmentPayment,
  type PaymentStatus,
} from '../../../../core/services/installment-payment.service';
import {
  OtherFeeVerificationService,
  type AdminOtherFeePayment,
  type OtherFeeKind,
} from '../../../../core/services/other-fee-verification.service';
import type { AdminCostSharePayment } from '../../../../core/services/cost-share-payment.service';
import {
  CostSharePaymentService,
  type BulkApproveResult,
  type BulkItem,
  type PendingVerificationCounts,
} from '../../../../core/services/cost-share-payment.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { LanguageService } from '../../../../core/services/language.service';
import { ConfirmModalComponent } from '../../../../shared/confirm-modal/confirm-modal.component';
import { ReasonPickerComponent } from '../../../../shared/reason-picker/reason-picker.component';
import { REASON_CATEGORY } from '../../../../shared/reason-picker/reject-reasons';
import { formatBnNumber, formatTakaAmount } from '../../../../shared/pipes/bn-format';
import { monthNameKey } from '../../../../shared/constants/months';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { BnNumberPipe } from '../../../../shared/pipes/bn-pipes';
import { IconComponent } from '../../../../shared/icon/icon.component';

const FILTERS: readonly PaymentStatus[] = ['pending', 'approved', 'rejected'];
const BASE_KINDS: readonly VerificationKind[] = ['installment', 'cost_share'];
const OTHER_FEE_KINDS: readonly VerificationKind[] = [...BASE_KINDS, 'other_fee'];
const MIN_REASON_LENGTH = 3;

export type VerificationKind = 'installment' | 'cost_share' | 'other_fee';

/** One queue entry, whichever kind it came from. */
export interface VerificationRow {
  kind: VerificationKind;
  id: number;
  /** other_fee only: which table the id belongs to (fee and picnic ids overlap). */
  feeKind?: OtherFeeKind;
  memberName: string | null;
  memberDisplayId: string | null;
  headline: string;
  amount: number;
  /** Cost shares only: what is still unpaid on the share (before pending payments). */
  remaining: number | null;
  method: string;
  transactionRef: string;
  paidOn: string;
  senderAccount: string | null;
  note: string | null;
  rejectionReason: string | null;
  proofUrl: string | null;
  status: PaymentStatus;
}

/** Committee queue: verify member-reported installment and cost-share payments. */
@Component({
  selector: 'app-payment-verifications',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, BnNumberPipe, IconComponent, SectionLoaderComponent, ConfirmModalComponent, ReasonPickerComponent],
  templateUrl: './payment-verifications.component.html',
  styleUrl: './payment-verifications.component.scss',
})
export class PaymentVerificationsComponent implements OnInit {
  private readonly service = inject(InstallmentPaymentService);
  private readonly shareService = inject(CostSharePaymentService);
  private readonly otherFeeService = inject(OtherFeeVerificationService);
  private readonly translate = inject(TranslateService);
  private readonly flags = inject(FeatureFlagService);
  private readonly language = inject(LanguageService);

  readonly paymentReasonCategory = REASON_CATEGORY.payment;
  /** admin_console: canned reject reasons. */
  readonly consoleOn = computed(() => this.flags.isEnabled('admin_console'));
  /** admin_bulk_verify: tick several pending payments and approve them together. */
  readonly bulkOn = computed(() => this.flags.isEnabled('admin_bulk_verify'));
  readonly selection = signal<ReadonlyMap<string, BulkItem & { amount: number }>>(new Map());
  readonly selectedCount = computed(() => this.selection().size);
  readonly selectedTotal = computed(() => [...this.selection().values()].reduce((sum, i) => sum + i.amount, 0));
  readonly confirmingBulk = signal(false);
  readonly bulkBusy = signal(false);
  readonly bulkMessage = signal<{ kind: 'result' | 'stale' | 'error'; text: string } | null>(null);

  readonly filters = FILTERS;
  /** pay_verify_other_fees: a third tab for other-fee and picnic payments. */
  readonly otherFeesOn = computed(() => this.flags.isEnabled('pay_verify_other_fees'));
  readonly kinds = computed(() => (this.otherFeesOn() ? OTHER_FEE_KINDS : BASE_KINDS));
  readonly kind = signal<VerificationKind>('installment');
  readonly counts = signal<PendingVerificationCounts | null>(null);
  readonly filter = signal<PaymentStatus>('pending');
  readonly payments = signal<VerificationRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busyKey = signal<string | null>(null);
  readonly rejecting = signal<VerificationRow | null>(null);
  rejectReason = '';

  ngOnInit(): void {
    this.load();
    this.loadCounts();
  }

  countOf(kind: VerificationKind): number | null {
    const counts = this.counts();
    if (!counts) return null;
    if (kind === 'other_fee') return counts.otherFee;
    return kind === 'installment' ? counts.installment : counts.costShare;
  }

  // ---- bulk approve (admin_bulk_verify) ----

  /** Unique per row; other fees carry their table (`other_fee:picnic:4`) since fee and picnic ids overlap. */
  private keyOf(p: Pick<VerificationRow, 'kind' | 'id' | 'feeKind'>): string {
    return p.kind === 'other_fee' && p.feeKind ? `other_fee:${p.feeKind}:${p.id}` : `${p.kind}:${p.id}`;
  }

  private keyOfItem(i: BulkItem): string {
    return i.kind === 'other_fee' && i.id_ref ? `other_fee:${i.id_ref}` : `${i.kind}:${i.id}`;
  }

  private bulkItemOf(p: VerificationRow): BulkItem & { amount: number } {
    const item: BulkItem =
      p.kind === 'other_fee' && p.feeKind
        ? OtherFeeVerificationService.bulkItem(p.feeKind, p.id)
        : { kind: p.kind, id: p.id };
    return { ...item, amount: p.amount };
  }

  rowKey(p: VerificationRow): string {
    return this.keyOf(p);
  }

  testId(prefix: string, p: VerificationRow): string {
    return `${prefix}-${this.keyOf(p).replaceAll(':', '-')}`;
  }

  isSelected(p: VerificationRow): boolean {
    return this.selection().has(this.keyOf(p));
  }

  toggle(p: VerificationRow): void {
    const next = new Map(this.selection());
    if (!next.delete(this.keyOf(p))) next.set(this.keyOf(p), this.bulkItemOf(p));
    this.selection.set(next);
  }

  allSelected(): boolean {
    const rows = this.payments();
    return rows.length > 0 && rows.every((r) => this.isSelected(r));
  }

  toggleAll(): void {
    const next = new Map(this.selection());
    const all = this.allSelected();
    for (const r of this.payments()) {
      if (all) next.delete(this.keyOf(r));
      else next.set(this.keyOf(r), this.bulkItemOf(r));
    }
    this.selection.set(next);
  }

  private bulkFigures(): { count: string; total: string } {
    const lang = this.language.lang();
    return { count: formatBnNumber(this.selectedCount(), lang), total: formatTakaAmount(this.selectedTotal(), lang) };
  }

  bulkBarText(): string {
    return this.translate.instant('adminConsole.bulk.selected', this.bulkFigures());
  }

  bulkConfirmText(): string {
    return this.translate.instant('adminConsole.bulk.confirmMessage', this.bulkFigures());
  }

  askBulk(): void {
    if (this.selectedCount() > 0) this.confirmingBulk.set(true);
  }

  runBulk(): void {
    const items: BulkItem[] = [...this.selection().values()].map(({ amount: _amount, ...item }) => item);
    if (items.length === 0 || this.bulkBusy()) return;
    this.bulkBusy.set(true);
    this.bulkMessage.set(null);
    this.shareService.bulkApprove(items, items.length, this.selectedTotal().toFixed(2)).subscribe({
      next: (result) => this.onBulkDone(result),
      error: (err: unknown) => this.onBulkError(err),
    });
  }

  private onBulkDone(result: BulkApproveResult): void {
    this.bulkBusy.set(false);
    this.confirmingBulk.set(false);
    const approved = new Set(result.approved.map((a) => this.keyOfItem(a)));
    const failedKeys = new Set(result.failed.map((f) => this.keyOfItem(f)));
    // Failed rows stay selected so the admin can see them and try again.
    this.selection.set(new Map([...this.selection()].filter(([key]) => failedKeys.has(key))));
    this.payments.update((rows) => rows.filter((r) => !approved.has(this.keyOf(r))));
    this.loadCounts();
    const lang = this.language.lang();
    const reasons = [...new Set(result.failed.map((f) => this.translate.instant(`adminConsole.bulk.fail.${f.code}`)))].join(', ');
    const text =
      result.failed.length === 0
        ? this.translate.instant('adminConsole.bulk.resultAll', { ok: formatBnNumber(result.approvedCount, lang) })
        : this.translate.instant('adminConsole.bulk.result', {
            ok: formatBnNumber(result.approvedCount, lang),
            failed: formatBnNumber(result.failed.length, lang),
            reasons,
          });
    this.bulkMessage.set({ kind: 'result', text });
  }

  private onBulkError(err: unknown): void {
    this.bulkBusy.set(false);
    this.confirmingBulk.set(false);
    const stale = errorCodeOf(err) === 'BULK_SELECTION_STALE' || (err instanceof HttpErrorResponse && err.status === 409);
    if (stale) {
      this.selection.set(new Map());
      this.bulkMessage.set({ kind: 'stale', text: this.translate.instant('adminConsole.bulk.stale') });
      this.load();
      this.loadCounts();
      return;
    }
    this.bulkMessage.set({ kind: 'error', text: this.translate.instant('adminConsole.bulk.error') });
  }

  setKind(kind: VerificationKind): void {
    if (kind === this.kind()) return;
    this.kind.set(kind);
    this.payments.set([]);
    this.load();
  }

  setFilter(status: PaymentStatus): void {
    if (status === this.filter() && this.loading()) return;
    this.filter.set(status);
    this.payments.set([]);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const requested = this.filter();
    const requestedKind = this.kind();
    const source = this.sourceFor(requestedKind, requested);
    source.subscribe({
      next: (rows) => {
        if (this.filter() !== requested || this.kind() !== requestedKind) return;
        this.payments.set(rows);
        this.loading.set(false);
      },
      error: () => {
        if (this.filter() !== requested || this.kind() !== requestedKind) return;
        this.error.set(this.translate.instant('admin.paymentVerifications.loadError'));
        this.loading.set(false);
      },
    });
  }

  private sourceFor(kind: VerificationKind, status: PaymentStatus): Observable<VerificationRow[]> {
    if (kind === 'installment') {
      return this.service.listForAdmin(status).pipe(map((rows) => rows.map((r) => this.fromInstallment(r))));
    }
    if (kind === 'other_fee') {
      return this.otherFeeService.listForAdmin(status).pipe(map((rows) => rows.map((r) => this.fromOtherFee(r))));
    }
    return this.shareService.listForAdmin(status).pipe(map((rows) => rows.map((r) => this.fromShare(r))));
  }

  private loadCounts(): void {
    this.shareService.pendingCounts().subscribe({
      next: (counts) => this.counts.set(counts),
      error: () => this.counts.set(null),
    });
  }

  private fromInstallment(p: AdminInstallmentPayment): VerificationRow {
    return {
      kind: 'installment',
      id: p.id,
      memberName: p.memberName,
      memberDisplayId: p.memberDisplayId,
      headline: p.installments
        .map((i) => `${this.translate.instant(monthNameKey(i.month))} ${i.year}`)
        .join(', '),
      amount: p.amount,
      remaining: null,
      method: p.method,
      transactionRef: p.transactionRef,
      paidOn: p.paidOn,
      senderAccount: p.senderAccount,
      note: p.note,
      rejectionReason: p.rejectionReason,
      proofUrl: p.proofUrl,
      status: p.status,
    };
  }

  private fromShare(p: AdminCostSharePayment): VerificationRow {
    return {
      kind: 'cost_share',
      id: p.id,
      memberName: p.memberName,
      memberDisplayId: p.memberDisplayId,
      headline: p.costTitle ?? this.translate.instant('admin.paymentVerifications.costTitle'),
      amount: p.amount,
      remaining: p.remaining,
      method: p.method,
      transactionRef: p.transactionRef,
      paidOn: p.paidOn,
      senderAccount: p.senderAccount,
      note: p.note,
      rejectionReason: p.rejectionReason,
      proofUrl: p.proofUrl,
      status: p.status,
    };
  }

  private fromOtherFee(p: AdminOtherFeePayment): VerificationRow {
    return {
      kind: 'other_fee',
      feeKind: p.kind,
      id: p.id,
      memberName: p.memberName,
      memberDisplayId: p.memberDisplayId,
      headline: p.feeLabel,
      amount: p.amount,
      remaining: null,
      method: p.method ?? '',
      transactionRef: p.receiptNo ?? '',
      paidOn: p.paymentDate,
      senderAccount: null,
      note: null,
      rejectionReason: p.rejectionReason,
      proofUrl: p.proofUrl,
      status: p.status,
    };
  }

  approve(payment: VerificationRow): void {
    this.error.set('');
    this.busyKey.set(this.keyOf(payment));
    this.approveCall(payment).subscribe({
      next: () => this.afterReview(payment),
      error: (err: HttpErrorResponse) => this.onActionError(err),
    });
  }

  openReject(payment: VerificationRow): void {
    this.rejectReason = '';
    this.rejecting.set(payment);
  }

  get canReject(): boolean {
    return this.rejectReason.trim().length >= MIN_REASON_LENGTH && this.busyKey() === null;
  }

  confirmReject(): void {
    const payment = this.rejecting();
    if (!payment || !this.canReject) return;
    this.error.set('');
    this.busyKey.set(this.keyOf(payment));
    this.rejectCall(payment, this.rejectReason.trim()).subscribe({
      next: () => {
        this.rejecting.set(null);
        this.afterReview(payment);
      },
      error: (err: HttpErrorResponse) => {
        this.rejecting.set(null);
        this.onActionError(err);
      },
    });
  }

  private approveCall(p: VerificationRow): Observable<unknown> {
    if (p.kind === 'other_fee' && p.feeKind) return this.otherFeeService.approve(p.feeKind, p.id);
    return p.kind === 'installment' ? this.service.approve(p.id) : this.shareService.approve(p.id);
  }

  private rejectCall(p: VerificationRow, reason: string): Observable<unknown> {
    if (p.kind === 'other_fee' && p.feeKind) return this.otherFeeService.reject(p.feeKind, p.id, reason);
    return p.kind === 'installment' ? this.service.reject(p.id, reason) : this.shareService.reject(p.id, reason);
  }

  formatAmount(amount: number): string {
    return amount.toLocaleString('en-IN');
  }

  private afterReview(done: VerificationRow): void {
    this.busyKey.set(null);
    this.loadCounts();
    this.payments.set(this.payments().filter((p) => this.keyOf(p) !== this.keyOf(done)));
  }

  private onActionError(err: HttpErrorResponse): void {
    this.busyKey.set(null);
    const detail = typeof err.error?.detail === 'string' ? err.error.detail : '';
    this.error.set(detail || this.translate.instant('admin.paymentVerifications.actionError'));
    this.load();
  }
}
