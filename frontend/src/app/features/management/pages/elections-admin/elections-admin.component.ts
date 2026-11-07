import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { DatePickerComponent } from '../../../../shared/date-picker/date-picker.component';
import { ConfirmModalComponent } from '../../../../shared/confirm-modal/confirm-modal.component';
import { LanguageService } from '../../../../core/services/language.service';
import {
  ElectionsService,
  type Election,
  type ElectionAdminDetail,
} from '../../../../core/services/elections.service';
import { localizeDigits } from '../../../../core/services/resolution-book.service';

const OBJECT_URL_REVOKE_MS = 1000;

/** Lifecycle stages in the order they are walked through. */
const LIFECYCLE_STAGES = [
  'draft',
  'nominations_open',
  'nominations_closed',
  'voting',
  'tabulated',
  'confirmed',
] as const;

type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

interface LifecycleStep {
  key: LifecycleStage;
  state: 'done' | 'current' | 'todo';
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_MS);
}

@Component({
  selector: 'app-elections-admin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, FormsModule, IconComponent, DatePickerComponent, ConfirmModalComponent, SectionLoaderComponent],
  templateUrl: './elections-admin.component.html',
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }

      /* --- create form: two labelled window groups side by side --- */
      .ea-windows {
        display: grid;
        gap: 0.9rem;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr));
        margin-top: 0.25rem;
      }
      .ea-window-group {
        min-width: 0;
        margin: 0;
        padding: 0.8rem 0.9rem 0.9rem;
        border: 1px solid var(--gray-200);
        border-radius: var(--radius-md);
        background: var(--gray-50);
      }
      .ea-window-name {
        padding: 0 0.35rem;
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--emerald-800);
      }
      .ea-window-fields {
        display: grid;
        gap: 0.7rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 0.4rem;
      }
      @media (max-width: 560px) {
        .ea-window-fields { grid-template-columns: 1fr; }
      }
      .ea-hint { margin: 0.9rem 0 0; }
      .form-actions app-icon { vertical-align: -2px; }

      /* --- elections list: status-rail cards; 2-up on wide screens --- */
      .ea-list {
        display: grid;
        gap: 0.6rem;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 26rem), 1fr));
      }
      .ea-list .gov-item { align-content: start; }
      .gov-item.is-selected {
        border-color: color-mix(in srgb, var(--emerald-600) 45%, var(--gray-200));
        background: color-mix(in srgb, var(--emerald-50) 55%, var(--gray-50));
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--emerald-600) 12%, transparent);
      }
      .ea-election-title {
        font-size: 0.95rem;
        color: var(--gray-800);
        overflow-wrap: anywhere;
      }
      .ea-window-chip {
        display: inline-flex;
        flex-direction: column;
        gap: 0.05rem;
        padding: 0.35rem 0.6rem;
        border-radius: var(--radius-sm);
        background: var(--surface);
        border: 1px solid var(--gray-200);
        font-size: 0.78rem;
        color: var(--gray-600);
      }
      .ea-window-chip strong {
        font-size: 0.68rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--gray-500);
      }
      .ea-item-actions { display: flex; justify-content: flex-end; gap: 0.4rem; width: 100%; }
      .ea-item-actions-start { justify-content: flex-start; }

      /* --- detail: pill lifecycle stepper --- */
      .ea-steps {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.45rem;
        list-style: none;
        margin: 0 0 0.9rem;
        padding: 0;
      }
      .ea-step {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.28rem 0.7rem 0.28rem 0.35rem;
        border: 1px solid var(--gray-200);
        border-radius: 999px;
        background: var(--gray-50);
        color: var(--gray-500);
        font-size: 0.76rem;
        font-weight: 600;
        line-height: 1.4;
        position: relative;
      }
      .ea-step + .ea-step { margin-left: 0.85rem; }
      .ea-step + .ea-step::before {
        content: '';
        position: absolute;
        left: -0.68rem;
        top: 50%;
        width: 0.5rem;
        height: 1.5px;
        background: var(--gray-300);
      }
      .ea-step-dot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.15rem;
        height: 1.15rem;
        flex-shrink: 0;
        border-radius: 50%;
        background: var(--gray-200);
        color: transparent;
      }
      .ea-step.is-done {
        color: var(--emerald-800);
        background: var(--emerald-50);
        border-color: color-mix(in srgb, var(--emerald-600) 35%, transparent);
      }
      .ea-step.is-done .ea-step-dot { background: var(--emerald-600); color: #fff; }
      .ea-step.is-current {
        color: var(--emerald-900);
        background: var(--surface);
        border-color: var(--emerald-600);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--emerald-600) 14%, transparent);
      }
      .ea-step.is-current .ea-step-dot {
        background: var(--emerald-800);
        color: #fff;
        box-shadow: 0 0 0 3px var(--emerald-50);
      }

      /* --- frozen voter info strip --- */
      .ea-info {
        display: flex;
        align-items: flex-start;
        gap: 0.55rem;
        margin: 0 0 0.9rem;
        padding: 0.6rem 0.8rem;
        border: 1px solid color-mix(in srgb, var(--emerald-600) 30%, var(--gray-200));
        border-inline-start: 4px solid var(--emerald-600);
        border-radius: var(--radius-sm);
        background: color-mix(in srgb, var(--emerald-50) 55%, var(--surface));
        color: var(--emerald-800);
        font-size: 0.875rem;
        font-weight: 600;
        line-height: 1.6;
      }
      .ea-info app-icon { flex-shrink: 0; margin-top: 0.15rem; }
      .ea-info span { min-width: 0; overflow-wrap: anywhere; }

      /* --- lifecycle actions --- */
      .ea-actions-bar { display: grid; gap: 0.45rem; }
      .ea-actions-primary { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
      .ea-actions-primary .btn { min-height: 40px; }
      .ea-actions-bar .field-hint,
      .ea-actions-bar .ea-frozen-info { margin: 0; }
      .ea-frozen-info { font-weight: 600; color: var(--gray-700); }
      @media (max-width: 640px) {
        .ea-actions-primary .btn { flex: 1 1 100%; justify-content: center; }
      }

      /* --- nominations / complaints cards --- */
      .ea-post-name {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-wrap: wrap;
        margin: 0;
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--gray-800);
      }
      .ea-nominee {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin: 0;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--emerald-800);
      }
      .ea-nominee app-icon { flex-shrink: 0; }
      .ea-statement {
        margin: 0;
        font-size: 0.875rem;
        color: var(--gray-600);
        line-height: 1.65;
        overflow-wrap: anywhere;
      }
      .ea-complaint-subject {
        font-size: 0.9rem;
        color: var(--gray-800);
        overflow-wrap: anywhere;
      }
      .ea-resolution { display: grid; gap: 0.5rem; width: 100%; }

      /* --- vote counts: bars per post --- */
      .ea-count-block { padding: 0.85rem 0; border-top: 1px solid var(--gray-200); }
      .ea-count-block:first-of-type { border-top: none; padding-top: 0.35rem; }
      .ea-count-list { display: grid; gap: 0.45rem; margin-top: 0.5rem; }
      .ea-count-row {
        display: grid;
        grid-template-columns: minmax(6.5rem, 11rem) 1fr auto;
        align-items: center;
        gap: 0.75rem;
        padding: 0.45rem 0.65rem;
        border-radius: var(--radius-sm);
        background: var(--gray-50);
        border: 1px solid transparent;
      }
      .ea-count-leading {
        border-color: color-mix(in srgb, var(--emerald-600) 35%, transparent);
        background: var(--emerald-50);
      }
      .ea-count-name { font-size: 0.88rem; font-weight: 600; overflow-wrap: anywhere; }
      .ea-count-row.ea-count-leading .ea-count-name { color: var(--emerald-800); }
      .ea-count-meter { max-width: none; height: 0.5rem; }
      .ea-count-votes { font-size: 0.95rem; font-variant-numeric: tabular-nums; }
      .ea-count-tag { justify-self: end; grid-column: 3; }
      @media (max-width: 560px) {
        .ea-count-row { grid-template-columns: 1fr auto; }
        .ea-count-meter { grid-column: 1 / -1; grid-row: 2; }
        .ea-count-tag { grid-column: 1; grid-row: 3; justify-self: start; }
      }
    `,
  ],
})
export class ElectionsAdminComponent implements OnInit {
  private readonly electionsService = inject(ElectionsService);
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly lang = this.language.lang;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly busy = signal(false);
  readonly detailLoading = signal(false);
  readonly pdfBusy = signal(false);
  readonly error = signal('');
  readonly justCreated = signal(false);
  readonly elections = signal<Election[]>([]);
  readonly selectedId = signal<number | null>(null);
  readonly detail = signal<ElectionAdminDetail | null>(null);
  readonly confirmKind = signal<'closeNominations' | 'confirm' | 'cancel' | null>(null);

  // Plain form state (ngModel mutation pattern).
  newTitle = '';
  newNominationStart = '';
  newNominationEnd = '';
  newVotingStart = '';
  newVotingEnd = '';
  complaintResolutions: Record<number, string> = {};

  private memberNames = new Map<number, string>();

  ngOnInit(): void {
    this.load();
  }

  /** Localized placeholder for the picker-only date fields. */
  datePlaceholder(): string {
    return this.lang() === 'bn' ? 'তারিখ বাছুন' : 'Select date';
  }

  /** Lifecycle pills: stages before the current one are done, the rest pending. */
  steps(status: string): LifecycleStep[] {
    if (status === 'cancelled') {
      return LIFECYCLE_STAGES.map((key) => ({ key, state: 'todo' as const }));
    }
    const index = LIFECYCLE_STAGES.indexOf(status as LifecycleStage);
    return LIFECYCLE_STAGES.map((key, i) => ({
      key,
      state: i < index ? ('done' as const) : i === index ? ('current' as const) : ('todo' as const),
    }));
  }

  /** Highest vote count in a bucket — the leading candidate marker. */
  topVotes(bucket: { candidates: { votes: number }[] }): number {
    return bucket.candidates.reduce((max, candidate) => Math.max(max, candidate.votes), 0);
  }

  /** Bar width as a share of the bucket's top score (floor keeps 1 vote visible). */
  voteWidth(bucket: { candidates: { votes: number }[] }, votes: number): number {
    const top = this.topVotes(bucket);
    if (top <= 0) return 0;
    return Math.max(6, Math.round((votes * 100) / top));
  }

  load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.electionsService.listElections().subscribe({
      next: (page) => {
        this.elections.set(page.items);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('elections.admin.loadError');
        this.loading.set(false);
      },
    });
  }

  select(electionId: number, silent = false): void {
    this.selectedId.set(electionId);
    this.busy.set(true);
    if (!silent) {
      this.detail.set(null);
      this.detailLoading.set(true);
    }
    this.electionsService.adminDetail(electionId).subscribe({
      next: (detail) => {
        this.memberNames = new Map(
          detail.nominations
            .filter((nomination) => nomination.memberName)
            .map((nomination) => [nomination.memberId, nomination.memberName as string]),
        );
        this.detail.set(detail);
        this.busy.set(false);
        this.detailLoading.set(false);
      },
      error: () => {
        this.error.set('elections.admin.loadError');
        this.busy.set(false);
        this.detailLoading.set(false);
      },
    });
  }

  createElection(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.justCreated.set(false);
    this.electionsService
      .createElection({
        title: this.newTitle.trim(),
        nominationStart: this.newNominationStart,
        nominationEnd: this.newNominationEnd,
        votingStart: this.newVotingStart,
        votingEnd: this.newVotingEnd,
      })
      .subscribe({
        next: (election) => {
          this.saving.set(false);
          this.newTitle = '';
          this.justCreated.set(true);
          this.load(true);
          this.select(election.id);
        },
        error: (err) => this.fail(err),
      });
  }

  lifecycle(action: 'openNominations' | 'openVoting' | 'tabulate'): void {
    const id = this.selectedId();
    if (id === null || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.justCreated.set(false);
    const call =
      action === 'openNominations'
        ? this.electionsService.openNominations(id)
        : action === 'openVoting'
          ? this.electionsService.openVoting(id)
          : this.electionsService.tabulate(id);
    call.subscribe({
      next: () => this.refreshDetail(),
      error: (err) => this.fail(err),
    });
  }

  askCloseNominations(): void {
    this.confirmKind.set('closeNominations');
  }

  confirmCloseNominations(): void {
    const id = this.selectedId();
    if (id === null) return;
    this.busy.set(true);
    this.electionsService.closeNominations(id).subscribe({
      next: () => {
        this.confirmKind.set(null);
        this.refreshDetail();
      },
      error: (err) => {
        this.confirmKind.set(null);
        this.fail(err);
      },
    });
  }

  askConfirm(): void {
    this.confirmKind.set('confirm');
  }

  confirmResults(): void {
    const id = this.selectedId();
    if (id === null) return;
    this.busy.set(true);
    this.electionsService.confirmResults(id).subscribe({
      next: () => {
        this.confirmKind.set(null);
        this.refreshDetail();
      },
      error: (err) => {
        this.confirmKind.set(null);
        this.fail(err);
      },
    });
  }

  askCancel(): void {
    this.confirmKind.set('cancel');
  }

  confirmCancel(): void {
    const id = this.selectedId();
    if (id === null) return;
    this.busy.set(true);
    this.electionsService.cancelElection(id).subscribe({
      next: () => {
        this.confirmKind.set(null);
        this.refreshDetail();
      },
      error: (err) => {
        this.confirmKind.set(null);
        this.fail(err);
      },
    });
  }

  decideNomination(nominationId: number, approved: boolean): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.electionsService.decideNomination(nominationId, approved).subscribe({
      next: () => this.refreshDetail(),
      error: (err) => this.fail(err),
    });
  }

  decideComplaint(complaintId: number, status: 'resolved' | 'rejected'): void {
    const resolution = (this.complaintResolutions[complaintId] || '').trim();
    if (!resolution) return;
    this.busy.set(true);
    this.electionsService.decideComplaint(complaintId, status, resolution).subscribe({
      next: () => this.refreshDetail(),
      error: (err) => this.fail(err),
    });
  }

  downloadResultSheet(): void {
    const id = this.selectedId();
    if (id === null) return;
    this.pdfBusy.set(true);
    this.electionsService.resultSheetPdf(id).subscribe({
      next: (blob) => {
        saveBlob(blob, `election-result-${id}.pdf`);
        this.pdfBusy.set(false);
      },
      error: () => {
        this.error.set('elections.admin.pdfError');
        this.pdfBusy.set(false);
      },
    });
  }

  private refreshDetail(): void {
    this.busy.set(false);
    const id = this.selectedId();
    if (id !== null) this.select(id, true);
    this.load(true);
  }

  private fail(err: { error?: { detail?: string } }): void {
    this.busy.set(false);
    this.saving.set(false);
    this.error.set(err.error?.detail || 'elections.admin.actionError');
  }

  postLabel(postKey: string): string {
    const translation = this.translate.instant(`elections.posts.${postKey}`);
    return translation !== `elections.posts.${postKey}` ? translation : postKey;
  }

  memberName(memberId: number): string {
    return this.memberNames.get(memberId) ?? `#${memberId}`;
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString(this.lang() === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  fmtDateTime(iso: string | null): string {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(this.lang() === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  digits(value: number | string): string {
    return localizeDigits(value, this.lang());
  }
}
