import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { ConfirmModalComponent } from '../../../../shared/confirm-modal/confirm-modal.component';
import { LanguageService } from '../../../../core/services/language.service';
import { formatTaka } from '../../../../core/services/finance.service';
import {
  ArrearItem,
  DataCorrectionRequest,
  FeeWaiver,
  GovernanceService,
  MembershipAction,
  MembershipAppeal,
} from '../../../../core/services/governance.service';

type Tab = 'waivers' | 'actions' | 'appeals' | 'corrections' | 'arrears';

const TABS: Tab[] = ['waivers', 'actions', 'appeals', 'corrections', 'arrears'];

@Component({
  selector: 'app-membership-governance',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, FormsModule, IconComponent, SectionLoaderComponent, ConfirmModalComponent, DatePipe],
  templateUrl: './membership-governance.component.html',
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .ds-tab app-icon { vertical-align: -3px; margin-inline-end: 0.3rem; }
      .ds-tab-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.35rem;
        margin-inline-start: 0.35rem;
        padding: 0.05rem 0.4rem;
        border-radius: 999px;
        background: var(--emerald-800);
        color: #fff;
        font-size: 0.7rem;
        font-weight: 700;
        vertical-align: 1px;
      }
      .field-row { display: grid; gap: 0.75rem; grid-template-columns: 1fr; }
      @media (min-width: 640px) {
        .field-row { grid-template-columns: minmax(0, 14rem) 1fr; align-items: end; }
      }
      .member-cell { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
      .member-name { font-weight: 600; color: var(--gray-800); word-break: break-word; }
      .member-id { font-size: 0.72rem; color: var(--gray-500); }
      .reason-cell { max-width: 22rem; word-break: break-word; }
      .months-note { display: inline-block; margin-inline-start: 0.4rem; font-size: 0.75rem; color: var(--gray-500); }
      .row-date { font-size: 0.78rem; color: var(--gray-500); }
      .change-cell { display: inline-flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; font-size: 0.82rem; color: var(--gray-600); }
      .change-value { color: var(--emerald-800); font-weight: 600; }
      .assign-cell { gap: 0.5rem; }
      .assign-input { max-width: 9.5rem; }
      /* Dates and row-action labels stay on one line (auto-layout narrows those columns). */
      .data-table td > .ds-mono { white-space: nowrap; }
      .row-actions .btn { white-space: nowrap; }
      /* Mobile card cells: value spans must be shrinkable so long values wrap, not overflow. */
      @media (max-width: 640px) {
        .data-table-cards tbody td > .member-cell,
        .data-table-cards tbody td > .ds-mono,
        .data-table-cards tbody td > .ds-tag,
        .data-table-cards tbody td > .ds-badge { min-width: 0; max-width: 100%; }
        .data-table-cards tbody td > .ds-mono { overflow-wrap: anywhere; }
        /* The reviewer-assign control stacks below its label on narrow screens. */
        .data-table-cards tbody td:last-child .assign-cell { flex-direction: column; align-items: stretch; }
        .data-table-cards tbody td:last-child .assign-cell .assign-input { max-width: none; }
      }
      /* Arrears summary tiles. */
      .totals-grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); margin-bottom: 1rem; }
      .totals-tile {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        padding: 0.8rem 0.95rem;
        border: 1px solid var(--gray-200);
        border-radius: var(--radius-md, 0.5rem);
        background: var(--gray-50);
      }
      .totals-tile.is-due { border-color: color-mix(in srgb, var(--red-500, #c0392b) 35%, var(--gray-200)); background: color-mix(in srgb, var(--red-500, #c0392b) 5%, var(--surface)); }
      .totals-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--gray-500); }
      .totals-value { font-size: 1.05rem; font-weight: 700; color: var(--gray-800); }
      .totals-value.is-good { color: var(--emerald-700); }
      .totals-value.is-bad { color: var(--red-600, #b03a2e); }
      /* The reviewer-rule notice sits inside the card body. */
      .ds-card-body .gov-notice { margin-bottom: 1rem; }
    `,
  ],
})
export class MembershipGovernanceComponent implements OnInit {
  private readonly governance = inject(GovernanceService);
  private readonly lang = inject(LanguageService).lang;

  readonly tab = signal<Tab>('waivers');
  readonly pending = signal<Record<Tab, boolean>>({ waivers: true, actions: true, appeals: true, corrections: true, arrears: true });
  readonly failed = signal<Record<Tab, boolean>>({ waivers: false, actions: false, appeals: false, corrections: false, arrears: false });
  readonly waivers = signal<FeeWaiver[]>([]);
  readonly actions = signal<MembershipAction[]>([]);
  readonly appeals = signal<MembershipAppeal[]>([]);
  readonly corrections = signal<DataCorrectionRequest[]>([]);
  readonly arrears = signal<ArrearItem[]>([]);
  readonly noticeSuccess = signal(false);
  readonly suspending = signal(false);
  readonly suspendTarget = signal<MembershipAction | null>(null);
  reviewerIds: Record<number, number | undefined> = {};

  noticeMemberId: number | null = null;
  noticeReason = '';

  readonly arrearsTotals = computed(() => {
    const items = this.arrears();
    return {
      expected: items.reduce((sum, item) => sum + (item.expected_amount || 0), 0),
      paid: items.reduce((sum, item) => sum + (item.paid_amount || 0), 0),
      due: items.reduce((sum, item) => sum + (item.arrears_amount || 0), 0),
    };
  });

  /** A tab is ready once its first load finished (loader gone, no error): counts may show. */
  ready(tab: Tab): boolean {
    return !this.pending()[tab] && !this.failed()[tab];
  }

  taka(value: number): string {
    return formatTaka(value, this.lang());
  }

  statusTone(status: string): string {
    if (status === 'approved' || status === 'applied' || status === 'upheld') return 'good';
    if (status === 'rejected' || status === 'decided' || status === 'overturned') return 'bad';
    if (status === 'cancelled') return 'neutral';
    return 'warn';
  }

  /** Backend data uses suspension/termination spellings (older rows may say suspend/terminate). */
  typeTone(type: string): string {
    return type === 'terminate' || type === 'termination' ? 'bad' : 'warn';
  }

  ngOnInit(): void {
    this.loadTab('waivers');
    this.loadTab('actions');
    this.loadTab('appeals');
    this.loadTab('corrections');
    this.loadTab('arrears');
  }

  /** Switching tabs refreshes that tab's data and shows its loader until it arrives. */
  selectTab(tab: Tab): void {
    this.tab.set(tab);
    this.loadTab(tab);
    // On narrow screens the bar scrolls: keep the selected tab visible.
    setTimeout(() => {
      const index = TABS.indexOf(tab);
      document.querySelectorAll('.ds-tab')[index]?.scrollIntoView({ inline: 'center', block: 'nearest' });
    });
  }

  /** Silent refresh after an action: keeps current rows on screen (the global bar shows progress). */
  load(): void {
    this.refresh('waivers');
    this.refresh('actions');
    this.refresh('appeals');
    this.refresh('corrections');
    this.refresh('arrears');
  }

  loadTab(tab: Tab): void {
    this.pending.update((p) => ({ ...p, [tab]: true }));
    this.failed.update((f) => ({ ...f, [tab]: false }));
    this.refresh(tab);
  }

  private refresh(tab: Tab): void {
    const done = () => this.pending.update((p) => ({ ...p, [tab]: false }));
    const fail = () => {
      done();
      this.failed.update((f) => ({ ...f, [tab]: true }));
    };
    const handlers = {
      waivers: () => this.governance.adminWaivers().subscribe({ next: (rows) => { this.waivers.set(rows); done(); }, error: fail }),
      actions: () => this.governance.adminActions().subscribe({ next: (rows) => { this.actions.set(rows); done(); }, error: fail }),
      appeals: () => this.governance.adminAppeals().subscribe({ next: (rows) => { this.appeals.set(rows); done(); }, error: fail }),
      corrections: () => this.governance.adminCorrections().subscribe({ next: (rows) => { this.corrections.set(rows); done(); }, error: fail }),
      arrears: () => this.governance.membersArrears().subscribe({ next: (data) => { this.arrears.set(data.items); done(); }, error: fail }),
    } satisfies Record<Tab, () => unknown>;
    handlers[tab]();
  }

  decideWaiver(id: number, status: 'approved' | 'rejected'): void {
    this.governance.decideWaiver(id, status).subscribe({ next: () => this.load() });
  }

  issueNotice(): void {
    if (!this.noticeMemberId || !this.noticeReason.trim()) return;
    this.noticeSuccess.set(false);
    this.governance.suspensionNotice(this.noticeMemberId, this.noticeReason).subscribe({
      next: () => {
        this.noticeReason = '';
        this.noticeSuccess.set(true);
        this.load();
      },
    });
  }

  notice(id: number): void {
    this.governance.noticeAction(id).subscribe({ next: () => this.load() });
  }

  askSuspend(action: MembershipAction): void {
    this.suspendTarget.set(action);
  }

  confirmSuspend(): void {
    const action = this.suspendTarget();
    if (!action) return;
    this.suspending.set(true);
    this.governance.decideAction(action.id, 'সাসপেনশন নিশ্চিত', true).subscribe({
      next: () => {
        this.suspending.set(false);
        this.suspendTarget.set(null);
        this.load();
      },
      error: () => {
        this.suspending.set(false);
        this.suspendTarget.set(null);
      },
    });
  }

  decide(id: number, confirm: boolean): void {
    this.governance
      .decideAction(id, confirm ? 'সাসপেনশন নিশ্চিত' : 'মামলা খারিজ', confirm)
      .subscribe({ next: () => this.load() });
  }

  cancel(id: number): void {
    this.governance.cancelAction(id).subscribe({ next: () => this.load() });
  }

  assign(appealId: number): void {
    const reviewerId = this.reviewerIds[appealId];
    if (!reviewerId) return;
    this.governance.assignAppeal(appealId, reviewerId).subscribe({ next: () => this.load() });
  }

  decideCorrection(id: number, status: 'applied' | 'rejected'): void {
    this.governance.decideCorrection(id, status).subscribe({ next: () => this.load() });
  }
}
