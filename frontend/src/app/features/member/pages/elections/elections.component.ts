import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { ConfirmModalComponent } from '../../../../shared/confirm-modal/confirm-modal.component';
import { LanguageService } from '../../../../core/services/language.service';
import { GovernanceService, type CouncilPost } from '../../../../core/services/governance.service';
import {
  ElectionsService,
  type MyElection,
} from '../../../../core/services/elections.service';
import { localizeDigits } from '../../../../core/services/resolution-book.service';

interface VotePick {
  [postKey: string]: number | null;
}

@Component({
  selector: 'app-member-elections',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, FormsModule, IconComponent, ConfirmModalComponent],
  template: `
    <div class="page-container">
      <header class="page-header">
        <h1 class="page-title"><app-icon name="check-circle" [size]="22" /> {{ 'elections.member.title' | translate }}</h1>
        <p class="page-subtitle">{{ 'elections.member.subtitle' | translate }}</p>
      </header>

      <!-- নির্বাচন নির্বাচন -->
      @if (loading()) {
        <div class="card skeleton-line skeleton-lg"></div>
      } @else if (elections().length === 0) {
        <div class="card">
          <div class="ds-empty">{{ 'elections.member.empty' | translate }}</div>
        </div>
      } @else {
        <nav class="me-election-row" aria-label="{{ 'elections.member.pickElection' | translate }}">
          @for (election of elections(); track election.id) {
            <button
              type="button"
              class="tab"
              [class.active]="selectedId() === election.id"
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
        <!-- যোগ্যতা কার্ড -->
        <section class="card me-eligibility" [class.me-ineligible]="!d.eligible">
          <h2 class="me-section-title">
            <app-icon [name]="d.eligible ? 'check-circle' : 'alert'" [size]="18" />
            {{ 'elections.member.eligibilityTitle' | translate }}
          </h2>
          @if (d.eligible) {
            <p class="me-eligibility-text">{{ 'elections.member.eligibleYes' | translate }}</p>
          } @else {
            <p class="me-eligibility-text">
              {{ (d.eligibilitySource === 'snapshot' ? 'elections.member.eligibleNoSnapshot' : 'elections.member.eligibleNo') | translate }}
            </p>
          }
          <p class="field-hint">
            {{ 'elections.statuses.' + d.status | translate }}
            · {{ 'elections.windows.nomination' | translate }}: {{ fmtDate(d.nominationStart) }} → {{ fmtDate(d.nominationEnd) }}
            · {{ 'elections.windows.voting' | translate }}: {{ fmtDate(d.votingStart) }} → {{ fmtDate(d.votingEnd) }}
          </p>
        </section>

        <!-- নিজেকে মনোনীত করা -->
        @if (nominationsOpen(d)) {
          <section class="card">
            <h2 class="me-section-title">{{ 'elections.member.nominateTitle' | translate }}</h2>
            <p class="field-hint">{{ 'elections.member.nominateHint' | translate }}</p>
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
              <button type="submit" class="btn btn-primary" [disabled]="nominateForm.invalid || !nominatePostKey || busy()">
                {{ 'elections.member.nominateSubmit' | translate }}
              </button>
            </form>
            @if (d.myNominations.length > 0) {
              <ul class="me-my-nominations">
                @for (nomination of d.myNominations; track nomination.id) {
                  <li>
                    {{ postLabelByKey(nomination.postKey) }}
                    <span class="ds-tag" [class.ds-tag-green]="nomination.status === 'approved'" [class.ds-tag-amber]="nomination.status === 'rejected'" [class.ds-tag-blue]="nomination.status === 'pending'">
                      {{ 'elections.nominationStatuses.' + nomination.status | translate }}
                    </span>
                  </li>
                }
              </ul>
            }
          </section>
        }

        <!-- গোপন ভোট -->
        @if (votingOpen(d)) {
          <section class="card">
            <h2 class="me-section-title">{{ 'elections.member.voteTitle' | translate }}</h2>
            <p class="field-hint">{{ 'elections.member.voteHint' | translate }}</p>
            @if (roster(d).length === 0) {
              <div class="ds-empty">{{ 'elections.member.noCandidates' | translate }}</div>
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
                  <div class="field">
                    <label [for]="'me-candidate-' + bucket.postKey">{{ 'elections.admin.candidate' | translate }}</label>
                    <select
                      [id]="'me-candidate-' + bucket.postKey"
                      class="field-control"
                      [name]="'candidate-' + bucket.postKey"
                      [(ngModel)]="votePicks[bucket.postKey]"
                    >
                      <option [ngValue]="null" disabled>{{ 'common.select' | translate }}</option>
                      @for (candidate of bucket.candidates; track candidate.nominationId) {
                        <option [ngValue]="candidate.nominationId">{{ candidate.name || candidate.memberId }}</option>
                      }
                    </select>
                  </div>
                  <button
                    type="button"
                    class="btn btn-primary"
                    [disabled]="votePicks[bucket.postKey] == null || busy()"
                    (click)="askCastVote(bucket.postKey)"
                  >
                    {{ 'elections.member.castVote' | translate }}
                  </button>
                  @if (voteErrors()[bucket.postKey]; as voteError) {
                    <p class="field-error">{{ voteError }}</p>
                  }
                }
              </div>
            }
          </section>
        }

        <!-- ফলাফল -->
        @if (d.results; as results) {
          <section class="card">
            <h2 class="me-section-title">{{ 'elections.member.resultsTitle' | translate }}</h2>
            @for (bucket of results; track bucket.postKey) {
              <h3 class="me-post-name">{{ postLabelByKey(bucket.postKey) }}</h3>
              <ul class="me-result-list">
                @for (candidate of bucket.candidates; track candidate.memberId) {
                  <li class="me-result-row">
                    <span>{{ candidate.name || candidate.memberId }}</span>
                    <strong>{{ digits(candidate.votes) }}</strong>
                  </li>
                }
              </ul>
              <p class="field-hint">{{ 'elections.member.votesTotal' | translate: { total: digits(bucket.votesTotal) } }}</p>
            }
          </section>
        }

        <!-- নির্বাচনী অভিযোগ -->
        <section class="card">
          <h2 class="me-section-title">{{ 'elections.member.complaintTitle' | translate }}</h2>
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
              <p class="me-success">{{ complaintSuccess() | translate }}</p>
            }
            <button type="submit" class="btn btn-secondary" [disabled]="complaintForm.invalid || !complaintSubject.trim() || !complaintDetails.trim() || busy()">
              {{ 'elections.member.fileComplaint' | translate }}
            </button>
          </form>
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
      .page-title { display: flex; align-items: center; gap: 0.5rem; }
      .me-section-title { display: flex; align-items: center; gap: 0.45rem; font-size: 1.05rem; font-weight: 700; margin: 0 0 0.5rem; }
      .me-election-row { display: flex; gap: 0.35rem; flex-wrap: wrap; }
      .tab { border: none; background: transparent; padding: 0.4rem 0.8rem; border-radius: 999px; cursor: pointer; }
      .tab.active { background: var(--emerald-600, #2e5138); color: #fff; }
      .me-eligibility { border-inline-start: 4px solid var(--emerald-600, #2e5138); }
      .me-eligibility.me-ineligible { border-inline-start-color: #b45309; }
      .me-eligibility-text { font-weight: 600; margin: 0 0 0.35rem; }
      .me-vote-block { padding: 0.75rem 0; border-top: 1px solid var(--gray-200, #e5e7eb); display: grid; gap: 0.5rem; justify-items: start; }
      .me-vote-block:first-of-type { border-top: none; }
      .me-post-name { display: flex; align-items: center; gap: 0.5rem; font-size: 0.95rem; font-weight: 700; margin: 0.75rem 0 0.35rem; }
      .me-my-nominations { list-style: none; margin: 0.75rem 0 0; padding: 0; display: grid; gap: 0.35rem; }
      .me-my-nominations li { display: flex; align-items: center; gap: 0.4rem; }
      .me-result-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }
      .me-result-row { display: flex; justify-content: space-between; gap: 1rem; padding: 0.35rem 0.5rem; border-radius: 0.375rem; background: var(--surface-2, #f7f7f5); }
      .me-success { color: var(--emerald-700, #2e5138); font-weight: 600; margin: 0 0 0.5rem; }
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
  readonly elections = signal<MyElection[]>([]);
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
