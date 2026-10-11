import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  imports: [TranslatePipe, FormsModule, IconComponent, ConfirmModalComponent],
  template: `
    <div class="page-container">
      <header class="gov-hero">
        <span class="gov-hero-icon"><app-icon name="check-circle" [size]="22" /></span>
        <div class="gov-hero-text">
          <h1 class="gov-hero-title">{{ 'elections.member.title' | translate }}</h1>
          <p class="gov-hero-sub">{{ 'elections.member.subtitle' | translate }}</p>
        </div>
        @if (detail(); as d) {
          <div class="gov-hero-side">
            <span class="ds-badge" [attr.data-tone]="d.eligible ? 'good' : 'warn'">
              {{ 'elections.statuses.' + d.status | translate }}
            </span>
          </div>
        }
      </header>

      <!-- নির্বাচন বাছাই -->
      @if (loading()) {
        <div class="card skeleton-line skeleton-lg"></div>
      } @else if (elections().length === 0) {
        <div class="card">
          <div class="gov-empty">
            <span class="gov-empty-icon"><app-icon name="check-circle" [size]="22" /></span>
            <p>{{ 'elections.member.empty' | translate }}</p>
          </div>
        </div>
      } @else {
        <nav class="me-election-row" aria-label="{{ 'elections.member.pickElection' | translate }}">
          @for (election of elections(); track election.id) {
            <button
              type="button"
              class="ds-tab"
              [class.is-active]="selectedId() === election.id"
              (click)="select(election.id)"
            >
              {{ election.title }}
            </button>
          }
        </nav>
      }

      @if (error()) {
        <div class="error-box" role="alert"><p style="margin: 0">{{ error() }}</p></div>
      }

      @if (detail(); as d) {
        <!-- যোগ্যতা -->
        <section class="me-banner" [class.me-banner-warn]="!d.eligible">
          <span class="me-banner-icon">
            <app-icon [name]="d.eligible ? 'check-circle' : 'alert'" [size]="20" />
          </span>
          <div class="me-banner-body">
            <h2 class="me-banner-title">{{ 'elections.member.eligibilityTitle' | translate }}</h2>
            @if (d.eligible) {
              <p class="me-banner-text">{{ 'elections.member.eligibleYes' | translate }}</p>
            } @else {
              <p class="me-banner-text">
                {{ (d.eligibilitySource === 'snapshot' ? 'elections.member.eligibleNoSnapshot' : 'elections.member.eligibleNo') | translate }}
              </p>
            }
            <div class="me-window-row">
              <span class="me-window">
                <strong>{{ 'elections.windows.nomination' | translate }}</strong>
                {{ fmtDate(d.nominationStart) }} → {{ fmtDate(d.nominationEnd) }}
              </span>
              <span class="me-window">
                <strong>{{ 'elections.windows.voting' | translate }}</strong>
                {{ fmtDate(d.votingStart) }} → {{ fmtDate(d.votingEnd) }}
              </span>
            </div>
          </div>
        </section>

        <!-- নিজেকে মনোনীত করা -->
        @if (nominationsOpen(d)) {
          <section class="ds-card">
            <div class="ds-card-header">
              <span class="ds-card-icon"><app-icon name="users" [size]="18" /></span>
              <div class="ds-card-heading">
                <h2 class="ds-card-title">{{ 'elections.member.nominateTitle' | translate }}</h2>
                <p class="ds-card-sub">{{ 'elections.member.nominateHint' | translate }}</p>
              </div>
            </div>
            <div class="ds-card-body">
              <form (ngSubmit)="nominateSelf()" #nominateForm="ngForm">
                <div class="field">
                  <label for="me-post">{{ 'elections.admin.post' | translate }}</label>
                  <select id="me-post" class="field-control" name="postKey" [(ngModel)]="nominatePostKey" required>
                    <option value="" disabled>{{ 'common.select' | translate }}</option>
                    @for (post of councilPosts(); track post.key) {
                      <option [value]="post.key" [disabled]="alreadyNominated(d, post.key)">{{ postLabel(post) }}</option>
                    }
                  </select>
                </div>
                <div class="field">
                  <label for="me-statement">{{ 'elections.member.statement' | translate }}</label>
                  <textarea id="me-statement" class="field-control" rows="3" maxlength="2000" name="statement" [(ngModel)]="nominateStatement"></textarea>
                </div>
                @if (nominateError()) {
                  <p class="field-error">{{ nominateError() }}</p>
                }
                <div class="form-actions">
                  <button type="submit" class="btn btn-primary" [disabled]="nominateForm.invalid || !nominatePostKey || busy()">
                    {{ 'elections.member.nominateSubmit' | translate }}
                  </button>
                </div>
              </form>
              @if (d.myNominations.length > 0) {
                <div class="me-my-nominations">
                  <p class="ds-subblock-title">{{ 'elections.member.nominateTitle' | translate }}</p>
                  <div class="gov-item-chiprow">
                    @for (nomination of d.myNominations; track nomination.id) {
                      <span class="ds-tag" [class.ds-tag-green]="nomination.status === 'approved'" [class.ds-tag-amber]="nomination.status === 'rejected'" [class.ds-tag-blue]="nomination.status === 'pending'">
                        {{ postLabelByKey(nomination.postKey) }} · {{ 'elections.nominationStatuses.' + nomination.status | translate }}
                      </span>
                    }
                  </div>
                </div>
              }
            </div>
          </section>
        }

        <!-- গোপন ভোট -->
        @if (votingOpen(d)) {
          <section class="ds-card">
            <div class="ds-card-header">
              <span class="ds-card-icon"><app-icon name="check" [size]="18" /></span>
              <div class="ds-card-heading">
                <h2 class="ds-card-title">{{ 'elections.member.voteTitle' | translate }}</h2>
                <p class="ds-card-sub">{{ 'elections.member.voteHint' | translate }}</p>
              </div>
            </div>
            <div class="ds-card-body">
              @if (roster(d).length === 0) {
                <div class="gov-empty">
                  <span class="gov-empty-icon"><app-icon name="users" [size]="22" /></span>
                  <p>{{ 'elections.member.noCandidates' | translate }}</p>
                </div>
              }
              @for (bucket of roster(d); track bucket.postKey) {
                <div class="me-vote-block">
                  <h3 class="me-post-name">
                    {{ postLabelByKey(bucket.postKey) }}
                    @if (voted(d, bucket.postKey)) {
                      <span class="ds-badge ds-badge-green">{{ 'elections.member.voted' | translate }}</span>
                    }
                  </h3>
                  @if (voted(d, bucket.postKey)) {
                    <p class="field-hint">{{ 'elections.member.alreadyVoted' | translate }}</p>
                  } @else {
                    <div class="me-candidate-grid">
                      @for (candidate of bucket.candidates; track candidate.nominationId) {
                        <button
                          type="button"
                          class="me-candidate"
                          [class.is-picked]="votePicks[bucket.postKey] === candidate.nominationId"
                          [attr.aria-pressed]="votePicks[bucket.postKey] === candidate.nominationId"
                          (click)="pickVote(bucket.postKey, candidate.nominationId)"
                        >
                          <span class="me-candidate-avatar">{{ candidateInitial(candidate) }}</span>
                          <span class="me-candidate-name">{{ candidate.name || candidate.memberId }}</span>
                          <span class="me-candidate-check"><app-icon name="check" [size]="14" /></span>
                        </button>
                      }
                    </div>
                    <div class="form-actions">
                      <button
                        type="button"
                        class="btn btn-primary"
                        [disabled]="votePicks[bucket.postKey] == null || busy()"
                        (click)="askCastVote(bucket.postKey)"
                      >
                        {{ 'elections.member.castVote' | translate }}
                      </button>
                    </div>
                    @if (voteErrors()[bucket.postKey]; as voteError) {
                      <p class="field-error">{{ voteError }}</p>
                    }
                  }
                </div>
              }
            </div>
          </section>
        }

        <!-- ফলাফল -->
        @if (d.results; as results) {
          <section class="ds-card">
            <div class="ds-card-header">
              <span class="ds-card-icon"><app-icon name="chart" [size]="18" /></span>
              <div class="ds-card-heading">
                <h2 class="ds-card-title">{{ 'elections.member.resultsTitle' | translate }}</h2>
              </div>
            </div>
            <div class="ds-card-body">
              @for (bucket of results; track bucket.postKey) {
                <h3 class="me-post-name">{{ postLabelByKey(bucket.postKey) }}</h3>
                <div class="me-result-list">
                  @for (candidate of bucket.candidates; track candidate.memberId) {
                    <div class="me-result-row" [class.me-result-winner]="candidate.votes === topVotes(bucket) && candidate.votes > 0">
                      <span class="me-result-name">{{ candidate.name || candidate.memberId }}</span>
                      <div class="gov-meter me-result-meter" aria-hidden="true">
                        <span
                          class="gov-meter-fill"
                          [style.width.%]="voteWidth(bucket, candidate.votes)"
                        ></span>
                      </div>
                      <strong class="me-result-votes">{{ digits(candidate.votes) }}</strong>
                    </div>
                  }
                </div>
                <p class="field-hint">{{ 'elections.member.votesTotal' | translate: { total: digits(bucket.votesTotal) } }}</p>
              }
            </div>
          </section>
        }

        <!-- নির্বাচনী অভিযোগ -->
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="shield" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'elections.member.complaintTitle' | translate }}</h2>
            </div>
          </div>
          <div class="ds-card-body">
            <form (ngSubmit)="fileComplaint()" #complaintForm="ngForm">
              <div class="field">
                <label for="me-complaint-subject">{{ 'elections.admin.complaintSubject' | translate }}</label>
                <input id="me-complaint-subject" class="field-control" name="complaintSubject" [(ngModel)]="complaintSubject" maxlength="255" required />
              </div>
              <div class="field">
                <label for="me-complaint-against">{{ 'elections.member.againstOptional' | translate }}</label>
                <input id="me-complaint-against" class="field-control" name="complaintAgainst" [(ngModel)]="complaintAgainst" maxlength="255" />
              </div>
              <div class="field">
                <label for="me-complaint-details">{{ 'elections.member.complaintDetails' | translate }}</label>
                <textarea id="me-complaint-details" class="field-control" rows="4" maxlength="5000" name="complaintDetails" [(ngModel)]="complaintDetails" required></textarea>
              </div>
              @if (complaintError()) {
                <p class="field-error">{{ complaintError() }}</p>
              }
              @if (complaintSuccess()) {
                <p class="gov-success"><app-icon name="check-circle" [size]="16" /> {{ complaintSuccess() | translate }}</p>
              }
              <div class="form-actions">
                <button type="submit" class="btn btn-secondary" [disabled]="complaintForm.invalid || !complaintSubject.trim() || !complaintDetails.trim() || busy()">
                  {{ 'elections.member.fileComplaint' | translate }}
                </button>
              </div>
            </form>
          </div>
        </section>
      }

      <!-- ভোট দেওয়ার নিশ্চিতকরণ -->
      <app-confirm-modal
        [open]="voteTarget() !== null"
        [title]="'elections.member.castVote' | translate"
        [message]="'elections.member.voteConfirm' | translate"
        [confirmLabel]="'elections.member.castVote' | translate"
        [loading]="busy()"
        (confirm)="confirmCastVote()"
        (cancel)="voteTarget.set(null)"
      />
    </div>
  `,
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

  select(electionId: number): void {
    this.selectedId.set(electionId);
    this.busy.set(true);
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
      },
      error: (err) => {
        this.error.set(err?.error?.detail || 'elections.member.loadError');
        this.busy.set(false);
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
        this.select(id);
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
        this.select(id);
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
