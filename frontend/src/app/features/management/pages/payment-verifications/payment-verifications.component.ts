import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map, type Observable } from 'rxjs';
import {
  InstallmentPaymentService,
  type AdminInstallmentPayment,
  type PaymentStatus,
} from '../../../../core/services/installment-payment.service';
import type { AdminCostSharePayment } from '../../../../core/services/cost-share-payment.service';
import {
  CostSharePaymentService,
  type PendingVerificationCounts,
} from '../../../../core/services/cost-share-payment.service';
import { monthNameKey } from '../../../../shared/constants/months';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { BnNumberPipe } from '../../../../shared/pipes/bn-pipes';
import { IconComponent } from '../../../../shared/icon/icon.component';

const FILTERS: readonly PaymentStatus[] = ['pending', 'approved', 'rejected'];
const KINDS: readonly VerificationKind[] = ['installment', 'cost_share'];
const MIN_REASON_LENGTH = 3;

interface ReviewApi {
  approve(id: number): Observable<unknown>;
  reject(id: number, reason: string): Observable<unknown>;
}

export type VerificationKind = 'installment' | 'cost_share';

/** One queue entry, whichever kind it came from. */
export interface VerificationRow {
  kind: VerificationKind;
  id: number;
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
  imports: [FormsModule, TranslatePipe, BnNumberPipe, IconComponent, SectionLoaderComponent],
  templateUrl: './payment-verifications.component.html',
  styleUrl: './payment-verifications.component.scss',
})
export class PaymentVerificationsComponent implements OnInit {
  private readonly service = inject(InstallmentPaymentService);
  private readonly shareService = inject(CostSharePaymentService);
  private readonly translate = inject(TranslateService);

  readonly filters = FILTERS;
  readonly kinds = KINDS;
  readonly kind = signal<VerificationKind>('installment');
  readonly counts = signal<PendingVerificationCounts | null>(null);
  readonly filter = signal<PaymentStatus>('pending');
  readonly payments = signal<VerificationRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busyId = signal<number | null>(null);
  readonly rejecting = signal<VerificationRow | null>(null);
  rejectReason = '';

  ngOnInit(): void {
    this.load();
    this.loadCounts();
  }

  countOf(kind: VerificationKind): number | null {
    const counts = this.counts();
    if (!counts) return null;
    return kind === 'installment' ? counts.installment : counts.costShare;
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
    const source =
      requestedKind === 'installment'
        ? this.service.listForAdmin(requested).pipe(map((rows) => rows.map((r) => this.fromInstallment(r))))
        : this.shareService.listForAdmin(requested).pipe(map((rows) => rows.map((r) => this.fromShare(r))));
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

  approve(payment: VerificationRow): void {
    this.error.set('');
    this.busyId.set(payment.id);
    this.reviewApi(payment).approve(payment.id).subscribe({
      next: () => this.afterReview(payment.id),
      error: (err: HttpErrorResponse) => this.onActionError(err),
    });
  }

  openReject(payment: VerificationRow): void {
    this.rejectReason = '';
    this.rejecting.set(payment);
  }

  get canReject(): boolean {
    return this.rejectReason.trim().length >= MIN_REASON_LENGTH && this.busyId() === null;
  }

  confirmReject(): void {
    const payment = this.rejecting();
    if (!payment || !this.canReject) return;
    this.error.set('');
    this.busyId.set(payment.id);
    this.reviewApi(payment).reject(payment.id, this.rejectReason.trim()).subscribe({
      next: () => {
        this.rejecting.set(null);
        this.afterReview(payment.id);
      },
      error: (err: HttpErrorResponse) => {
        this.rejecting.set(null);
        this.onActionError(err);
      },
    });
  }

  private reviewApi(payment: VerificationRow): ReviewApi {
    return payment.kind === 'installment' ? this.service : this.shareService;
  }

  formatAmount(amount: number): string {
    return amount.toLocaleString('en-IN');
  }

  private afterReview(id: number): void {
    this.busyId.set(null);
    this.loadCounts();
    this.payments.set(this.payments().filter((p) => p.id !== id));
  }

  private onActionError(err: HttpErrorResponse): void {
    this.busyId.set(null);
    const detail = typeof err.error?.detail === 'string' ? err.error.detail : '';
    this.error.set(detail || this.translate.instant('admin.paymentVerifications.actionError'));
    this.load();
  }
}
