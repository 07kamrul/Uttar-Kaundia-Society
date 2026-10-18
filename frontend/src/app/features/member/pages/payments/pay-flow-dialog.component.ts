import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, concatMap, from, map, of, switchMap, toArray, type Observable } from 'rxjs';
import { toUserMessageKey } from '../../../../core/errors/user-error';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { InstallmentPaymentService } from '../../../../core/services/installment-payment.service';
import {
  MemberPaymentsService,
  type DueItem,
  type PaymentSummary,
} from '../../../../core/services/member-payments.service';
import { OtherFeesService, type OtherFeeType } from '../../../../core/services/other-fees.service';
import { compressImage } from '../../../../core/utils/image-compress';
import { PAYMENT_METHOD_KEYS } from '../../../../core/models/registration.model';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { PaymentMethodPickerComponent } from '../../../../shared/payment-method/payment-method-picker.component';
import { referenceLabelKey } from '../../../../shared/payment-method/payment-methods';
import { PayTitlePipe } from './pay-title.pipe';
import { TakaPipe } from '../../../../shared/pipes/bn-pipes';
import { formatBnNumber } from '../../../../shared/pipes/bn-format';
import type { PaymentAccount as RegistrationAccount } from '../../../../core/models/registration.model';

type Step = 1 | 2;

export interface PayFlowPreselect {
  kind?: string;
  fee?: string;
}

export interface PayFlowOutcome {
  succeeded: number;
  total: number;
}

interface RequestItem {
  /** Selection keys this request settles; they leave the list once it succeeds. */
  keys: readonly string[];
  label: string;
  run: () => Observable<unknown>;
}

interface ItemResult {
  label: string;
  ok: boolean;
  errorKey: string | null;
}

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const PROOF_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const TRANSACTION_REF_PATTERN = /^[A-Za-z0-9\-_/ ]{4,64}$/;
const MAX_ADDITIONAL_HEADS = 20;

const dueKey = (due: Pick<DueItem, 'kind' | 'refId'>): string => `${due.kind}:${due.refId}`;
const feeKey = (fee: OtherFeeType): string => `fee:${fee.key}`;

function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * The single "পেমেন্ট করুন" flow: pick what to pay for, say how it was paid
 * (method, TrxID, screenshot), submit. One request goes out per kind; when
 * some fail the rest stay done and only the failed items remain selected.
 */
@Component({
  selector: 'app-pay-flow-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, TakaPipe, PayTitlePipe, IconComponent, PaymentMethodPickerComponent],
  templateUrl: './pay-flow-dialog.component.html',
  styleUrl: './pay-flow-dialog.component.scss',
})
export class PayFlowDialogComponent {
  readonly summary = input.required<PaymentSummary>();
  readonly preselect = input<PayFlowPreselect>({});
  readonly closed = output<void>();
  /** Everything went through; the page closes the dialog and refreshes. */
  readonly finished = output<PayFlowOutcome>();

  private readonly installmentService = inject(InstallmentPaymentService);
  private readonly paymentsService = inject(MemberPaymentsService);
  private readonly feesService = inject(OtherFeesService);
  private readonly translate = inject(TranslateService);
  private readonly flags = inject(FeatureFlagService);

  readonly today = todayIso();
  readonly maxHeads = MAX_ADDITIONAL_HEADS;
  readonly step = signal<Step>(1);
  readonly method = signal('');
  readonly reference = signal('');
  readonly paidOn = signal(todayIso());
  readonly proof = signal<File | null>(null);
  readonly proofError = signal('');
  readonly submitting = signal(false);
  readonly results = signal<readonly ItemResult[]>([]);
  readonly referenceTouched = signal(false);

  private readonly selected = signal<ReadonlySet<string> | null>(null);
  private readonly done = signal<ReadonlySet<string>>(new Set());
  private readonly heads = signal<Readonly<Record<string, number>>>({});
  private readonly amounts = signal<Readonly<Record<string, number>>>({});

  readonly dues = computed(() =>
    this.summary().dues.filter((d) => !d.pending && !this.done().has(dueKey(d))),
  );
  readonly pendingDues = computed(() => this.summary().dues.filter((d) => d.pending));
  readonly fees = computed(() =>
    this.summary().payableFeeTypes.filter((f) => f.alreadyPaid !== true && !this.done().has(feeKey(f))),
  );
  readonly accounts = computed<RegistrationAccount[]>(() => this.summary().accounts);
  readonly selectedAccountId = signal<number | null>(null);
  readonly isEmpty = computed(
    () => this.dues().length === 0 && this.pendingDues().length === 0 && this.fees().length === 0,
  );

  readonly selection = computed<ReadonlySet<string>>(() => this.selected() ?? this.defaultSelection());
  readonly selectedDues = computed(() => this.dues().filter((d) => this.selection().has(dueKey(d))));
  readonly selectedFees = computed(() => this.fees().filter((f) => this.selection().has(feeKey(f))));
  readonly total = computed(
    () =>
      this.selectedDues().reduce((sum, d) => sum + d.amount, 0) +
      this.selectedFees().reduce((sum, f) => sum + this.feeAmount(f), 0),
  );
  readonly canNext = computed(
    () =>
      this.total() > 0 &&
      this.selectedDues().length + this.selectedFees().length > 0 &&
      this.selectedFees().every((f) => this.feeAmount(f) > 0),
  );

  get referenceValid(): boolean {
    return TRANSACTION_REF_PATTERN.test(this.reference().trim());
  }

  get referenceLabel(): string {
    return referenceLabelKey(this.method());
  }

  get canSubmit(): boolean {
    const date = this.paidOn();
    return (
      PAYMENT_METHOD_KEYS.some((k) => k === this.method()) &&
      this.referenceValid &&
      !!date &&
      date <= this.today &&
      !this.proofError() &&
      !this.submitting()
    );
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.submitting()) this.closed.emit();
  }

  isSelected(key: string): boolean {
    return this.selection().has(key);
  }

  dueId(due: DueItem): string {
    return dueKey(due);
  }

  feeId(fee: OtherFeeType): string {
    return feeKey(fee);
  }

  toggle(key: string): void {
    const next = new Set(this.selection());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.selected.set(next);
  }

  headsOf(fee: OtherFeeType): number {
    return this.heads()[fee.key] ?? 0;
  }

  changeHeads(fee: OtherFeeType, delta: number): void {
    const next = Math.min(Math.max(this.headsOf(fee) + delta, 0), MAX_ADDITIONAL_HEADS);
    this.heads.set({ ...this.heads(), [fee.key]: next });
  }

  amountOf(fee: OtherFeeType): number {
    return this.amounts()[fee.key] ?? 0;
  }

  setAmount(fee: OtherFeeType, raw: string): void {
    const value = Number(raw);
    this.amounts.set({ ...this.amounts(), [fee.key]: Number.isFinite(value) && value > 0 ? value : 0 });
  }

  feeAmount(fee: OtherFeeType): number {
    if (fee.calculation === 'picnic') {
      return (fee.headFee ?? 0) + this.headsOf(fee) * (fee.additionalHeadFee ?? 0);
    }
    if (fee.calculation === 'variable') return this.amountOf(fee);
    return fee.amount ?? 0;
  }

  goTo(step: Step): void {
    this.step.set(step);
  }

  /** Picking a method auto-picks its first active account, when it has one. */
  onMethodChange(key: string): void {
    this.method.set(key);
    this.selectedAccountId.set(
      this.accounts().find((a) => a.method === key)?.id ?? null,
    );
  }

  onReferenceInput(event: Event): void {
    this.reference.set((event.target as HTMLInputElement).value);
  }

  onDateInput(event: Event): void {
    this.paidOn.set((event.target as HTMLInputElement).value);
  }

  async onProofSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0] ?? null;
    this.proofError.set('');
    if (!picked) {
      this.proof.set(null);
      return;
    }
    if (!PROOF_TYPES.includes(picked.type)) {
      this.proof.set(null);
      this.proofError.set(this.translate.instant('member.payDues.proofTypeError'));
      return;
    }
    const file = await compressImage(picked);
    if (file.size > MAX_PROOF_BYTES) {
      this.proof.set(null);
      this.proofError.set(this.translate.instant('member.payDues.proofSizeError'));
      return;
    }
    this.proof.set(file);
  }

  removeProof(): void {
    this.proof.set(null);
    this.proofError.set('');
  }

  get summaryLine(): string {
    const lang = this.translate.currentLang() === 'en' ? 'en' : 'bn';
    const succeeded = this.results().filter((r) => r.ok).length;
    return this.translate.instant('member.pay.partial', {
      total: formatBnNumber(this.results().length, lang),
      ok: formatBnNumber(succeeded, lang),
    });
  }

  submit(): void {
    this.referenceTouched.set(true);
    if (!this.canSubmit) return;
    const requests = this.buildRequests();
    if (requests.length === 0) return;
    this.submitting.set(true);
    this.results.set([]);
    from(requests)
      .pipe(
        concatMap((request) =>
          request.run().pipe(
            map(() => ({ request, errorKey: null as string | null })),
            catchError((err: unknown) => of({ request, errorKey: toUserMessageKey(err) })),
          ),
        ),
        toArray(),
      )
      .subscribe((outcomes) => this.finish(outcomes));
  }

  private finish(outcomes: { request: RequestItem; errorKey: string | null }[]): void {
    const doneKeys = new Set(this.done());
    for (const o of outcomes) {
      if (o.errorKey === null) o.request.keys.forEach((k) => doneKeys.add(k));
    }
    this.done.set(doneKeys);
    this.submitting.set(false);
    const succeeded = outcomes.filter((o) => o.errorKey === null).length;
    if (succeeded === outcomes.length) {
      this.finished.emit({ succeeded, total: outcomes.length });
      return;
    }
    this.results.set(
      outcomes.map((o) => ({ label: o.request.label, ok: o.errorKey === null, errorKey: o.errorKey })),
    );
  }

  private buildRequests(): RequestItem[] {
    const common = { method: this.method(), transactionRef: this.reference().trim(), paidOn: this.paidOn() };
    const proof = this.proof();
    const requests: RequestItem[] = [];
    const installments = this.selectedDues().filter((d) => d.kind === 'installment');
    if (installments.length > 0) {
      requests.push({
        keys: installments.map(dueKey),
        label: installments.map((d) => d.title).join(', '),
        run: () =>
          this.installmentService.submit({
            ...common,
            installmentIds: installments.map((d) => d.refId),
            paymentAccountId: this.selectedAccountId(),
            proof,
          }),
      });
    }
    for (const share of this.selectedDues().filter((d) => d.kind === 'cost_share')) {
      requests.push({
        keys: [dueKey(share)],
        label: share.title,
        run: () => this.paymentsService.submitCostShare({ ...common, shareId: share.refId, amount: share.amount, proof }),
      });
    }
    for (const fee of this.selectedFees()) {
      requests.push({
        keys: [feeKey(fee)],
        label: fee.label,
        run: () =>
          this.feesService
            .createPayment({
              feeType: fee.key,
              paymentDate: common.paidOn,
              paymentMethod: common.method,
              paymentAccountId: this.selectedAccountId(),
              receiptNo: common.transactionRef,
              amount: fee.calculation === 'variable' ? this.amountOf(fee) : undefined,
              additionalHeads: fee.calculation === 'picnic' ? this.headsOf(fee) : undefined,
            })
            .pipe(switchMap((created) => this.attachProof(created.id, proof))),
      });
    }
    return requests;
  }

  /**
   * pay_verify_other_fees: the screenshot goes to the new pending payment. The payment
   * itself is already saved, so a failed upload must not report the whole item as failed.
   */
  private attachProof(paymentId: number, proof: File | null): Observable<unknown> {
    if (!proof || !this.flags.isEnabled('pay_verify_other_fees')) return of(null);
    return this.feesService.uploadProof(paymentId, proof).pipe(catchError(() => of(null)));
  }

  /** Dues pre-ticked; a deep link (?kind=other_fee&fee=picnic) narrows that to what was asked for. */
  private defaultSelection(): ReadonlySet<string> {
    const { kind, fee } = this.preselect();
    const keys = new Set<string>();
    if (kind === 'other_fee') {
      for (const f of this.fees()) if (!fee || f.key === fee) keys.add(feeKey(f));
      return keys;
    }
    for (const d of this.dues()) {
      if (!kind || d.kind === kind) keys.add(dueKey(d));
    }
    return keys;
  }
}
