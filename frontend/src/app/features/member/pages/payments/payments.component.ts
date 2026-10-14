import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import {
  MemberPaymentsService,
  type HistoryStatus,
  type PaymentHistoryItem,
  type PaymentKind,
  type PaymentSummary,
} from '../../../../core/services/member-payments.service';
import { BnDatePipe, TakaPipe } from '../../../../shared/pipes/bn-pipes';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { PayTitlePipe } from './pay-title.pipe';
import { PayFlowDialogComponent, type PayFlowPreselect } from './pay-flow-dialog.component';

type LoadState = 'loading' | 'error' | 'ready';

const KINDS: readonly PaymentKind[] = ['installment', 'other_fee', 'cost_share'];
const STATUSES: readonly HistoryStatus[] = ['pending', 'approved', 'rejected', 'recorded'];
const PAGE_SIZE = 20;

function parseOne<T extends string>(raw: string | null, allowed: readonly T[]): T | null {
  return allowed.find((v) => v === raw) ?? null;
}

/** The merged "পেমেন্ট" page: what I owe, one pay flow, one combined history. */
@Component({
  selector: 'app-member-payments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, TakaPipe, BnDatePipe, PayTitlePipe, SectionLoaderComponent, PayFlowDialogComponent],
  templateUrl: './payments.component.html',
  styleUrl: './payments.component.scss',
})
export class PaymentsComponent implements OnInit {
  private readonly service = inject(MemberPaymentsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly flags = inject(FeatureFlagService);

  readonly kinds = KINDS;
  readonly statuses = STATUSES;

  readonly summary = signal<PaymentSummary | null>(null);
  readonly summaryState = signal<LoadState>('loading');
  readonly items = signal<readonly PaymentHistoryItem[]>([]);
  readonly historyState = signal<LoadState>('loading');
  readonly total = signal(0);
  readonly kind = signal<PaymentKind | null>(null);
  readonly status = signal<HistoryStatus | null>(null);
  readonly dialogOpen = signal(false);
  readonly preselect = signal<PayFlowPreselect>({});
  readonly thanks = signal(false);

  private page = 1;
  private historyKey: string | null = null;

  ngOnInit(): void {
    this.loadSummary();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.kind.set(parseOne(params.get('kind'), KINDS));
      this.status.set(parseOne(params.get('status'), STATUSES));
      this.reloadHistoryIfFilterChanged();
      const fee = params.get('fee');
      if (params.get('pay') === '1' || fee) {
        this.preselect.set({ kind: this.kind() ?? undefined, fee: fee ?? undefined });
        this.dialogOpen.set(true);
        void this.router.navigate([], { queryParams: { pay: null }, queryParamsHandling: 'merge', replaceUrl: true });
      }
    });
  }

  /**
   * With pay_verify_other_fees off an other fee is recorded as paid at once, so it reads
   * "জমা হয়েছে" rather than the approved wording.
   */
  statusOf(item: PaymentHistoryItem): HistoryStatus {
    const legacy = item.kind === 'other_fee' && item.status === 'approved' && !this.flags.isEnabled('pay_verify_other_fees');
    return legacy ? 'recorded' : item.status;
  }

  get hasMore(): boolean {
    return this.items().length < this.total();
  }

  setKind(kind: PaymentKind | null): void {
    void this.router.navigate([], { queryParams: { kind }, queryParamsHandling: 'merge' });
  }

  setStatus(status: HistoryStatus | null): void {
    void this.router.navigate([], { queryParams: { status }, queryParamsHandling: 'merge' });
  }

  openPay(): void {
    this.thanks.set(false);
    this.preselect.set({});
    this.dialogOpen.set(true);
  }

  closePay(): void {
    this.dialogOpen.set(false);
  }

  onFinished(): void {
    this.dialogOpen.set(false);
    this.thanks.set(true);
    this.refresh();
  }

  refresh(): void {
    this.loadSummary();
    this.loadHistory(true);
  }

  loadSummary(): void {
    this.summaryState.set('loading');
    this.service.summary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.summaryState.set('ready');
      },
      error: () => this.summaryState.set('error'),
    });
  }

  loadHistory(reset: boolean): void {
    if (reset) this.page = 1;
    else this.page += 1;
    this.historyState.set('loading');
    this.service
      .history({
        kind: this.kind() ?? undefined,
        status: this.status() ?? undefined,
        page: this.page,
        pageSize: PAGE_SIZE,
      })
      .subscribe({
        next: (result) => {
          this.items.set(reset ? result.items : [...this.items(), ...result.items]);
          this.total.set(result.total);
          this.historyState.set('ready');
        },
        error: () => {
          if (!reset) this.page -= 1;
          this.historyState.set('error');
        },
      });
  }

  retryHistory(): void {
    this.loadHistory(true);
  }

  private reloadHistoryIfFilterChanged(): void {
    const key = `${this.kind()}|${this.status()}`;
    if (key === this.historyKey) return;
    this.historyKey = key;
    this.loadHistory(true);
  }
}
