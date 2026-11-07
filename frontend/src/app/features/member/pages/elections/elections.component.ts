import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { ConfirmModalComponent } from '../../../../shared/confirm-modal/confirm-modal.component';
import { LanguageService } from '../../../../core/services/language.service';
import { GovernanceService, type CouncilPost } from '../../../../core/services/governance.service';
import {
  ElectionsService,
  type Election,
  type MyElection,
} from '../../../../core/services/elections.service';
import { localizeDigits } from '../../../../core/services/resolution-book.service';

interface VotePick {
  [postKey: string]: number | null;
}

interface ResultCandidate {
  memberId: number | string;
  name?: string | null;
  votes: number;
}

interface ResultBucket {
  postKey: string;
  votesTotal: number;
  candidates: ResultCandidate[];
}

@Component({
  selector: 'app-member-elections',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionLoaderComponent, TranslatePipe, FormsModule, IconComponent, ConfirmModalComponent],
  templateUrl: './elections.component.html',
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .me-election-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
      /* Eligibility banner: green when eligible, amber otherwise. */
      .me-banner {
        display: flex;
        align-items: flex-start;
        gap: 0.85rem;
        padding: 1rem 1.1rem;
        border: 1px solid color-mix(in srgb, var(--emerald-600) 30%, var(--gray-200));
        border-inline-start: 4px solid var(--emerald-600);
        border-radius: var(--radius-md);
        background: color-mix(in srgb, var(--emerald-50) 55%, var(--surface));
      }
      .me-banner-warn {
        border-color: color-mix(in srgb, var(--gold) 40%, var(--gray-200));
        border-inline-start-color: var(--gold);
        background: color-mix(in srgb, var(--amber-50) 55%, var(--surface));
      }
      .me-banner-icon { color: var(--emerald-700); flex-shrink: 0; margin-top: 0.15rem; }
      .me-banner-warn .me-banner-icon { color: var(--gold-strong); }
      .me-banner-body { flex: 1; min-width: 0; }
      .me-banner-title { margin: 0 0 0.2rem; font-size: 1rem; font-weight: 700; color: var(--gray-800); }
      .me-banner-text { margin: 0 0 0.55rem; font-size: 0.9rem; font-weight: 600; color: var(--gray-700); line-height: 1.6; }
      .me-window-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .me-window {
        display: inline-flex;
        flex-direction: column;
        gap: 0.1rem;
        padding: 0.45rem 0.7rem;
        border-radius: var(--radius-sm);
        background: var(--surface);
        border: 1px solid var(--gray-200);
        font-size: 0.78rem;
        color: var(--gray-600);
      }
      .me-window strong { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--gray-500); }
      .me-my-nominations { margin-top: 1.1rem; padding-top: 0.9rem; border-top: 1px dashed var(--gray-200); display: grid; gap: 0.45rem; }
      /* Ballot: tap-to-pick candidate cards. */
      .me-vote-block { padding: 1rem 0; border-top: 1px solid var(--gray-200); display: grid; gap: 0.65rem; }
      .me-vote-block:first-of-type { border-top: none; padding-top: 0; }
      .me-post-name { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; font-size: 0.95rem; font-weight: 700; margin: 0; }
      .me-candidate-grid {
        display: grid;
        gap: 0.6rem;
        grid-template-columns: 1fr;
      }
      @media (min-width: 560px) {
        .me-candidate-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      .me-candidate {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        width: 100%;
        padding: 0.65rem 0.75rem;
        border: 1.5px solid var(--gray-200);
        border-radius: var(--radius-sm);
        background: var(--surface);
        color: var(--gray-800);
        font: inherit;
        text-align: start;
        cursor: pointer;
        transition: border-color 0.12s, background-color 0.12s, box-shadow 0.12s;
      }
      .me-candidate:hover { border-color: var(--field-border-hover); }
      .me-candidate.is-picked {
        border-color: var(--emerald-600);
        background: var(--emerald-50);
        box-shadow: var(--field-focus-ring);
      }
      .me-candidate-avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.1rem;
        height: 2.1rem;
        flex-shrink: 0;
        border-radius: 50%;
        background: var(--surface-2);
        color: var(--emerald-800);
        font-size: 0.85rem;
        font-weight: 700;
      }
      .me-candidate.is-picked .me-candidate-avatar { background: var(--emerald-800); color: #fff; }
      .me-candidate-name { flex: 1; min-width: 0; font-weight: 600; font-size: 0.9rem; line-height: 1.4; overflow-wrap: anywhere; }
      .me-candidate-check {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.35rem;
        height: 1.35rem;
        flex-shrink: 0;
        border-radius: 50%;
        border: 1.5px solid var(--gray-300);
        color: transparent;
      }
      .me-candidate.is-picked .me-candidate-check {
        background: var(--emerald-600);
        border-color: var(--emerald-600);
        color: #fff;
      }
      /* Results: horizontal vote bars, top scorer highlighted. */
      .me-result-list { display: grid; gap: 0.45rem; margin: 0.35rem 0 0.5rem; }
      .me-result-row {
        display: grid;
        grid-template-columns: minmax(7rem, 12rem) 1fr auto;
        align-items: center;
        gap: 0.75rem;
        padding: 0.45rem 0.65rem;
        border-radius: var(--radius-sm);
        background: var(--gray-50);
        border: 1px solid transparent;
      }
      .me-result-winner { border-color: color-mix(in srgb, var(--emerald-600) 35%, transparent); background: var(--emerald-50); }
      .me-result-name { font-size: 0.88rem; font-weight: 600; overflow-wrap: anywhere; }
      .me-result-row.me-result-winner .me-result-name { color: var(--emerald-800); }
      .me-result-meter { max-width: none; height: 0.5rem; }
      .me-result-votes { font-size: 0.95rem; font-variant-numeric: tabular-nums; }
      @media (max-width: 560px) {
        .me-result-row { grid-template-columns: 1fr auto; }
        .me-result-meter { grid-column: 1 / -1; grid-row: 2; }
      }
    `,
  ],
})
export class MemberElectionsComponent implements OnInit {
  private readonly electionsService = inject(ElectionsService);
  private readonly governance = inject(GovernanceService);
  private readonly language = inject(LanguageService);

  readonly lang = this.language.lang;
  readonly loading = signal(true);
  readonly detailLoading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly elections = signal<Election[]>([]);
  readonly selectedId = signal<number | null>(null);
  readonly detail = signal<MyElection | null>(null);
  readonly councilPostsState = signal<CouncilPost[]>([]);
  readonly voteTarget = signal<string | null>(null);
  readonly voteErrors = signal<Record<string, string>>({});
  readonly nominateError = signal('');
  readonly complaintError = signal('');
  readonly complaintSuccess = signal('');

  // Plain form state (ngModel mutation pattern).
  nominatePostKey = '';
  nominateStatement = '';
  complaintSubject = '';
  complaintAgainst = '';
  complaintDetails = '';
  votePicks: VotePick = {};

  ngOnInit(): void {
    this.governance.constants().subscribe({
      next: (constants) => this.councilPostsState.set(constants.council_posts),
      error: () => this.councilPostsState.set([]),
    });
    this.electionsService.listElections().subscribe({
      next: (page) => {
        this.elections.set(
          page.items.filter((election) => election.status !== 'draft' && election.status !== 'cancelled'),
        );
        this.loading.set(false);
        if (this.elections().length > 0) this.select(this.elections()[0].id);
      },
      error: () => {
        this.error.set('elections.member.loadError');
        this.loading.set(false);
      },
    });
  }

  select(electionId: number, silent = false): void {
    this.selectedId.set(electionId);
    this.busy.set(true);
    if (!silent) this.detailLoading.set(true);
    this.error.set('');
    this.votePicks = {};
    this.voteErrors.set({});
    this.electionsService.myElection(electionId).subscribe({
      next: (detail) => {
        // Every post with a roster starts unselected so the disabled
        // placeholder option matches.
        for (const bucket of detail.candidates ?? []) {
          this.votePicks[bucket.postKey] = null;
        }
        this.detail.set(detail);
        this.busy.set(false);
        this.detailLoading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.detail || 'elections.member.loadError');
        this.busy.set(false);
        this.detailLoading.set(false);
      },
    });
  }

  councilPosts(): CouncilPost[] {
    return this.councilPostsState();
  }

  postLabel(post: CouncilPost): string {
    return this.lang() === 'bn' ? post.bn : post.en;
  }

  postLabelByKey(postKey: string): string {
    const post = this.councilPostsState().find((candidate) => candidate.key === postKey);
    return post ? this.postLabel(post) : postKey;
  }

  alreadyNominated(d: MyElection, postKey: string): boolean {
    return d.myNominations.some((nomination) => nomination.postKey === postKey);
  }

  roster(d: MyElection) {
    return d.candidates ?? [];
  }

  voted(d: MyElection, postKey: string): boolean {
    return d.votedPosts.includes(postKey);
  }

  nominationsOpen(d: MyElection): boolean {
    return d.status === 'nominations_open' && d.eligible && windowOpen(d.nominationStart, d.nominationEnd, d.today);
  }

  votingOpen(d: MyElection): boolean {
    return d.status === 'voting' && d.eligible && windowOpen(d.votingStart, d.votingEnd, d.today);
  }

  /** Ballot card tap: records the pick for one post. */
  pickVote(postKey: string, nominationId: number): void {
    this.votePicks[postKey] = this.votePicks[postKey] === nominationId ? null : nominationId;
  }

  candidateInitial(candidate: { name?: string | null; memberId: number | string }): string {
    return (candidate.name || candidate.memberId || '?').toString().trim().charAt(0);
  }

  /** Highest vote count in a result bucket — used to highlight the winner. */
  topVotes(bucket: ResultBucket): number {
    return bucket.candidates.reduce((max, candidate) => Math.max(max, candidate.votes), 0);
  }

  /** Bar width as a share of the bucket's top score (floor so 1 vote stays visible). */
  voteWidth(bucket: ResultBucket, votes: number): number {
    const top = this.topVotes(bucket);
    if (top <= 0) return 0;
    return Math.max(6, Math.round((votes * 100) / top));
  }

  nominateSelf(): void {
    const id = this.selectedId();
    if (id === null || !this.nominatePostKey || this.busy()) return;
    this.busy.set(true);
    this.nominateError.set('');
    this.electionsService.nominateSelf(id, this.nominatePostKey, this.nominateStatement.trim()).subscribe({
      next: () => {
        this.busy.set(false);
        this.nominatePostKey = '';
        this.nominateStatement = '';
        this.select(id, true);
      },
      error: (err) => {
        this.busy.set(false);
        this.nominateError.set(err?.error?.detail || 'elections.member.nominateError');
      },
    });
  }

  askCastVote(postKey: string): void {
    this.voteTarget.set(postKey);
  }

  confirmCastVote(): void {
    const id = this.selectedId();
    const postKey = this.voteTarget();
    const nominationId = postKey ? this.votePicks[postKey] : null;
    if (id === null || !postKey || nominationId == null) return;
    this.busy.set(true);
    this.electionsService.castVote(id, postKey, nominationId).subscribe({
      next: () => {
        this.busy.set(false);
        this.voteTarget.set(null);
        this.select(id, true);
      },
      error: (err) => {
        this.busy.set(false);
        this.voteTarget.set(null);
        this.voteErrors.set({ ...this.voteErrors(), [postKey]: err?.error?.detail || 'elections.member.voteError' });
      },
    });
  }

  fileComplaint(): void {
    const id = this.selectedId();
    if (id === null || this.busy()) return;
    this.busy.set(true);
    this.complaintError.set('');
    this.complaintSuccess.set('');
    this.electionsService
      .fileComplaint(id, this.complaintSubject.trim(), this.complaintDetails.trim(), this.complaintAgainst.trim() || undefined)
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.complaintSubject = '';
          this.complaintAgainst = '';
          this.complaintDetails = '';
          this.complaintSuccess.set('elections.member.complaintFiled');
        },
        error: (err) => {
          this.busy.set(false);
          this.complaintError.set(err?.error?.detail || 'elections.member.complaintError');
        },
      });
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

  digits(value: number | string): string {
    return localizeDigits(value, this.lang());
  }
}

function windowOpen(start: string, end: string, today: string): boolean {
  if (!start || !end || !today) return false;
  const startDay = start.slice(0, 10);
  const endDay = end.slice(0, 10);
  const todayDay = today.slice(0, 10);
  return startDay <= todayDay && todayDay <= endDay;
}
