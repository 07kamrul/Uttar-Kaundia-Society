import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { LanguageService } from '../../../../core/services/language.service';
import {
  AmendmentsService,
  type AmendmentProposal,
  type AmendmentStatus,
  type ConstitutionVersion,
} from '../../../../core/services/amendments.service';
import { ResolutionBookService, type MeetingListItem } from '../../../../core/services/resolution-book.service';
import { localizeDigits } from '../../../../core/services/resolution-book.service';

@Component({
  selector: 'app-amendments-admin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent],
  template: `
    <div class="page-container">
      <header class="page-header">
        <div>
          <h1 class="page-title"><app-icon name="doc" [size]="22" /> {{ 'amendments.adminTitle' | translate }}</h1>
          <p class="page-subtitle">{{ 'amendments.adminSubtitle' | translate }}</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="openCreateForm()">
          {{ 'amendments.adminCreate' | translate }}
        </button>
      </header>

      @if (error()) {
        <div class="card card-pad error-box" role="alert">{{ error() }}</div>
      }

      <!-- Dissolution manual-process banner (always shown once, per spec) -->
      <div class="card card-pad am-dissolution-banner" role="note">
        <app-icon name="alert" [size]="18" />
        <span>{{ dissolutionNotice() }}</span>
      </div>

      <div class="am-toolbar">
        <div class="filter-chips">
          @for (status of statusFilters; track status) {
            <button type="button" class="filter-chip" [class.filter-chip-active]="statusFilter() === status"
                    (click)="setStatusFilter(status)">
              {{ 'amendments.statuses.' + (status === 'all' ? 'all' : status) | translate }}
            </button>
          }
        </div>
      </div>

      <!-- Proposals -->
      <section class="card card-pad">
        @if (loading()) {
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton-line" style="height: 64px; margin-bottom: 8px"></div>
          }
        } @else if (proposals().length === 0) {
          <div class="ds-empty">{{ 'amendments.noProposals' | translate }}</div>
        } @else {
          <div class="am-list">
            @for (proposal of proposals(); track proposal.id) {
              <article class="am-item">
                <div class="am-item-head">
                  <strong>{{ proposal.title }}</strong>
                  <span class="ds-tag" [class.ds-tag-blue]="proposal.status === 'submitted'"
                        [class.ds-tag-amber]="proposal.status === 'scheduled'"
                        [class.ds-tag-green]="proposal.status === 'adopted'"
                        [class.ds-tag-gold]="proposal.status === 'rejected' || proposal.status === 'withdrawn'">
                    {{ 'amendments.statuses.' + proposal.status | translate }}
                  </span>
                  @if (proposal.isDissolution) {
                    <span class="ds-tag ds-tag-amber">{{ 'amendments.dissolutionTag' | translate }}</span>
                  }
                  <span class="ds-tag">{{ 'amendments.majority.' + proposal.requiredMajority | translate }}</span>
                </div>
                <p class="am-meta">
                  {{ proposal.proposalNo }}
                  · {{ 'amendments.proposedBy' | translate: { name: proposal.proposedByMemberName || 'admin' } }}
                  @if (proposal.meetingNo) {
                    · {{ 'amendments.meetingRef' | translate: { meeting: proposal.meetingNo } }}
                  }
                  @if (proposal.adoptedVersionNo) {
                    · {{ 'amendments.adoptedAsVersion' | translate: { version: digits(proposal.adoptedVersionNo) } }}
                  }
                </p>
                <p class="am-rationale">{{ proposal.rationale }}</p>
                @if (proposal.votesFor != null) {
                  <p class="am-meta">
                    {{ 'amendments.votesLine' | translate: {
                      for: digits(proposal.votesFor),
                      against: digits(proposal.votesAgainst ?? 0),
                      abstain: digits(proposal.votesAbstain ?? 0)
                    } }}
                  </p>
                }

                <!-- Schedule: attach a properly-noticed meeting -->
                @if (proposal.status === 'submitted' || proposal.status === 'scheduled') {
                  <div class="am-action-row">
                    <select class="field-control" [(ngModel)]="meetingChoice[proposal.id]" name="meeting-{{ proposal.id }}">
                      <option [ngValue]="null">{{ 'amendments.pickMeeting' | translate }}</option>
                      @for (meeting of meetings(); track meeting.id) {
                        <option [ngValue]="meeting.id">
                          {{ meeting.meetingNo }} ({{ meeting.date }})
                          @if (!meeting.noticePublishedAt) {
                            — {{ 'amendments.meetingNotNoticed' | translate }}
                          }
                        </option>
                      }
                    </select>
                    <button type="button" class="btn btn-secondary btn-sm"
                            [disabled]="!meetingChoice[proposal.id] || busyId() === proposal.id"
                            (click)="attachMeeting(proposal)">
                      {{ 'amendments.schedule' | translate }}
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" (click)="openDecisionForm(proposal)">
                      {{ 'amendments.recordVotes' | translate }}
                    </button>
                    <button type="button" class="btn btn-danger btn-sm" (click)="openRejectForm(proposal)">
                      {{ 'amendments.reject' | translate }}
                    </button>
                  </div>
                }

                <!-- Decision form -->
                @if (decisionId === proposal.id) {
                  <div class="am-decision-form">
                    <p class="field-hint">
                      {{ proposal.isDissolution
                        ? ('amendments.fourFifthsHint' | translate)
                        : ('amendments.simpleHint' | translate) }}
                    </p>
                    <div class="am-votes-grid">
                      <div class="field">
                        <label for="vf-{{ proposal.id }}">{{ 'amendments.votesFor' | translate }}</label>
                        <input id="vf-{{ proposal.id }}" class="field-control" type="number" min="0"
                               name="vf-{{ proposal.id }}" [(ngModel)]="votesFor" />
                      </div>
                      <div class="field">
                        <label for="va-{{ proposal.id }}">{{ 'amendments.votesAgainst' | translate }}</label>
                        <input id="va-{{ proposal.id }}" class="field-control" type="number" min="0"
                               name="va-{{ proposal.id }}" [(ngModel)]="votesAgainst" />
                      </div>
                      <div class="field">
                        <label for="vb-{{ proposal.id }}">{{ 'amendments.votesAbstain' | translate }}</label>
                        <input id="vb-{{ proposal.id }}" class="field-control" type="number" min="0"
                               name="vb-{{ proposal.id }}" [(ngModel)]="votesAbstain" />
                      </div>
                    </div>
                    @if (actionError()) {
                      <p class="field-error">{{ actionError() }}</p>
                    }
                    <div class="am-action-row">
                      <button type="button" class="btn btn-primary btn-sm" (click)="recordDecision(proposal)" [disabled]="busyId() === proposal.id">
                        {{ 'amendments.decide' | translate }}
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm" (click)="decisionId = null">
                        {{ 'common.cancel' | translate }}
                      </button>
                    </div>
                  </div>
                }

                <!-- Reject form -->
                @if (rejectingId === proposal.id) {
                  <div class="am-decision-form">
                    <div class="field">
                      <label for="rej-{{ proposal.id }}">{{ 'amendments.rejectReason' | translate }}</label>
                      <textarea id="rej-{{ proposal.id }}" class="field-control" rows="2" name="rej-{{ proposal.id }}"
                                [(ngModel)]="rejectReason"></textarea>
                    </div>
                    @if (actionError()) {
                      <p class="field-error">{{ actionError() }}</p>
                    }
                    <div class="am-action-row">
                      <button type="button" class="btn btn-danger btn-sm" (click)="confirmReject(proposal)" [disabled]="busyId() === proposal.id">
                        {{ 'amendments.reject' | translate }}
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm" (click)="rejectingId = null">
                        {{ 'common.cancel' | translate }}
                      </button>
                    </div>
                  </div>
                }

                @if (proposal.status === 'adopted') {
                  <button type="button" class="btn btn-secondary btn-sm" (click)="downloadCertificate(proposal)">
                    {{ 'amendments.certificate' | translate }}
                  </button>
                }
              </article>
            }
          </div>
        }
      </section>

      <!-- Constitution versions -->
      <section class="card card-pad">
        <h2 class="am-section-title">{{ 'amendments.versionsTitle' | translate }}</h2>
        <p class="field-hint">{{ 'amendments.versionsAdminHint' | translate }}</p>

        @if (versions().length === 0) {
          <div class="am-seed-form">
            <p class="field-hint">{{ 'amendments.seedHint' | translate }}</p>
            <div class="field">
              <label for="am-seed-text">{{ 'amendments.seedText' | translate }}</label>
              <textarea id="am-seed-text" class="field-control" rows="4" [(ngModel)]="seedText" name="seedText"></textarea>
            </div>
            @if (seedError) {
              <p class="field-error">{{ seedError }}</p>
            }
            <button type="button" class="btn btn-primary" (click)="seedVersion()" [disabled]="!seedText.trim()">
              {{ 'amendments.seed' | translate }}
            </button>
          </div>
        } @else {
          <div class="am-list">
            @for (version of versions(); track version.id) {
              <article class="am-item">
                <div class="am-item-head">
                  <strong>{{ 'amendments.versionLabel' | translate: { version: digits(version.versionNo) } }}</strong>
                  @if (version.isCurrent) {
                    <span class="ds-tag ds-tag-green">{{ 'amendments.currentVersion' | translate }}</span>
                  }
                </div>
                @if (version.changesSummary) {
                  <p class="am-meta">{{ version.changesSummary }}</p>
                }
                @if (expandedVersionId() === version.id) {
                  <pre class="am-version-text">{{ version.fullText }}</pre>
                  <button type="button" class="btn btn-secondary btn-sm" (click)="expandedVersionId.set(null)">
                    {{ 'common.close' | translate }}
                  </button>
                } @else {
                  <button type="button" class="btn btn-secondary btn-sm" (click)="expandedVersionId.set(version.id)">
                    {{ 'amendments.viewText' | translate }}
                  </button>
                }
              </article>
            }
          </div>
        }
      </section>

      <!-- Admin create proposal modal -->
      @if (createOpen) {
        <div class="modal-backdrop" (click)="createOpen = false">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <h3>{{ 'amendments.adminCreate' | translate }}</h3>
            <div class="field">
              <label for="amc-title">{{ 'amendments.title' | translate }}</label>
              <input id="amc-title" class="field-control" name="amcTitle" [(ngModel)]="createFormTitle" />
            </div>
            <div class="field">
              <label for="amc-rationale">{{ 'amendments.rationale' | translate }}</label>
              <textarea id="amc-rationale" class="field-control" rows="3" name="amcRationale" [(ngModel)]="createFormRationale"></textarea>
            </div>
            <div class="field">
              <label for="amc-text">{{ 'amendments.proposedText' | translate }}</label>
              <textarea id="amc-text" class="field-control" rows="5" name="amcText" [(ngModel)]="createFormText"></textarea>
            </div>
            <label class="checkbox-row">
              <input type="checkbox" name="amcDissolution" [(ngModel)]="createFormDissolution" />
              {{ 'amendments.isDissolution' | translate }}
            </label>
            @if (actionError()) {
              <p class="field-error">{{ actionError() }}</p>
            }
            <div class="am-action-row">
              <button type="button" class="btn btn-primary" (click)="submitCreate()" [disabled]="!createFormTitle.trim() || !createFormText.trim()">
                {{ 'common.save' | translate }}
              </button>
              <button type="button" class="btn btn-secondary" (click)="createOpen = false">
                {{ 'common.cancel' | translate }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .page-title { display: flex; align-items: center; gap: 0.5rem; }
      .am-section-title { font-size: 1.05rem; font-weight: 700; margin: 0 0 0.5rem; }
      .am-toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; }
      .filter-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
      .am-list { display: grid; gap: 0.85rem; }
      .am-item { display: grid; gap: 0.5rem; justify-items: start; padding: 0.85rem; border-radius: 0.5rem; background: var(--surface-2, #f7f7f5); border: 1px solid var(--gray-200, #e5e7eb); }
      .am-item-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .am-meta { margin: 0; font-size: 0.82rem; color: var(--gray-600); }
      .am-rationale { margin: 0; font-size: 0.9rem; overflow-wrap: anywhere; }
      .am-action-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
      .am-action-row .field-control { min-width: 220px; }
      .am-decision-form { width: 100%; display: grid; gap: 0.6rem; }
      .am-votes-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.75rem; }
      .am-version-text { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; margin: 0; max-height: 320px; overflow-y: auto; width: 100%; }
      .am-dissolution-banner { display: flex; gap: 0.6rem; align-items: center; border-inline-start: 4px solid var(--gold, #c9a34c); }
      .am-seed-form { display: grid; gap: 0.6rem; max-width: 640px; }
      .modal-backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 45%); display: grid; place-items: center; padding: 1rem; z-index: 60; }
      .modal-card { background: var(--surface, #fff); border-radius: 0.6rem; padding: 1.25rem; width: min(560px, 100%); max-height: 85vh; overflow: auto; display: grid; gap: 0.6rem; }
      .error-box { color: var(--red-600, #9c3a2c); }
    `,
  ],
})
export class AmendmentsComponent implements OnInit {
  readonly statusFilters: (AmendmentStatus | 'all')[] = ['all', 'submitted', 'scheduled', 'adopted', 'rejected', 'withdrawn'];
  readonly loading = signal(true);
  readonly error = signal('');
  readonly actionError = signal('');
  readonly proposals = signal<AmendmentProposal[]>([]);
  readonly versions = signal<ConstitutionVersion[]>([]);
  readonly meetings = signal<MeetingListItem[]>([]);
  readonly statusFilter = signal<AmendmentStatus | 'all'>('all');
  readonly busyId = signal<number | null>(null);
  readonly expandedVersionId = signal<number | null>(null);

  meetingChoice: Record<number, number | null> = {};
  decisionId: number | null = null;
  votesFor = 0;
  votesAgainst = 0;
  votesAbstain = 0;
  rejectingId: number | null = null;
  rejectReason = '';
  createOpen = false;
  createFormTitle = '';
  createFormRationale = '';
  createFormText = '';
  createFormDissolution = false;
  seedText = '';
  seedError = '';

  private readonly amendments = inject(AmendmentsService);
  private readonly resolutionBook = inject(ResolutionBookService);
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  readonly lang = this.language.lang;

  ngOnInit(): void {
    this.load();
    this.loadVersions();
    this.resolutionBook
      .listMeetings({ limit: 50 })
      .subscribe({
        next: (page) => this.meetings.set(page.items),
        error: () => this.meetings.set([]),
      });
  }

  dissolutionNotice(): string {
    return this.translate.instant('amendments.dissolutionNotice');
  }

  digits(value: number | string): string {
    return localizeDigits(value, this.lang());
  }

  setStatusFilter(status: AmendmentStatus | 'all'): void {
    this.statusFilter.set(status);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const filter = this.statusFilter();
    this.amendments
      .adminProposals(filter === 'all' ? undefined : filter)
      .subscribe({
        next: (proposals) => {
          this.proposals.set(proposals);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('amendments.loadError');
          this.loading.set(false);
        },
      });
  }

  loadVersions(): void {
    this.amendments.versions().subscribe({
      next: (versions) => this.versions.set(versions),
      error: () => this.versions.set([]),
    });
  }

  private fail(err: unknown, fallback: string): string {
    const detail = (err as { error?: { detail?: string } })?.error?.detail;
    return (typeof detail === 'string' && detail) || this.translate.instant(fallback);
  }

  attachMeeting(proposal: AmendmentProposal): void {
    const meetingId = this.meetingChoice[proposal.id];
    if (!meetingId) return;
    this.busyId.set(proposal.id);
    this.actionError.set('');
    this.amendments.attachMeeting(proposal.id, meetingId).subscribe({
      next: () => {
        this.busyId.set(null);
        this.load();
      },
      error: (err) => {
        this.busyId.set(null);
        this.error.set(this.fail(err, 'common.saveFailed'));
      },
    });
  }

  openDecisionForm(proposal: AmendmentProposal): void {
    this.decisionId = proposal.id;
    this.rejectingId = null;
    this.votesFor = 0;
    this.votesAgainst = 0;
    this.votesAbstain = 0;
    this.actionError.set('');
  }

  recordDecision(proposal: AmendmentProposal): void {
    this.busyId.set(proposal.id);
    this.actionError.set('');
    this.amendments
      .decide(proposal.id, this.votesFor || 0, this.votesAgainst || 0, this.votesAbstain || 0)
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.decisionId = null;
          this.load();
          this.loadVersions();
        },
        error: (err) => {
          this.busyId.set(null);
          this.actionError.set(this.fail(err, 'common.saveFailed'));
        },
      });
  }

  openRejectForm(proposal: AmendmentProposal): void {
    this.rejectingId = proposal.id;
    this.decisionId = null;
    this.rejectReason = '';
    this.actionError.set('');
  }

  confirmReject(proposal: AmendmentProposal): void {
    if (!this.rejectReason.trim()) {
      this.actionError.set(this.translate.instant('amendments.rejectReasonRequired'));
      return;
    }
    this.busyId.set(proposal.id);
    this.actionError.set('');
    this.amendments.reject(proposal.id, this.rejectReason.trim()).subscribe({
      next: () => {
        this.busyId.set(null);
        this.rejectingId = null;
        this.load();
      },
      error: (err) => {
        this.busyId.set(null);
        this.actionError.set(this.fail(err, 'common.saveFailed'));
      },
    });
  }

  openCreateForm(): void {
    this.createFormTitle = '';
    this.createFormRationale = '';
    this.createFormText = '';
    this.createFormDissolution = false;
    this.actionError.set('');
    this.createOpen = true;
  }

  submitCreate(): void {
    this.amendments
      .adminCreateProposal({
        title: this.createFormTitle.trim(),
        rationale: this.createFormRationale.trim(),
        proposedText: this.createFormText,
        isDissolution: this.createFormDissolution,
      })
      .subscribe({
        next: () => {
          this.createOpen = false;
          this.load();
        },
        error: (err) => this.actionError.set(this.fail(err, 'common.saveFailed')),
      });
  }

  seedVersion(): void {
    this.seedError = '';
    this.amendments.seedInitialVersion(this.seedText).subscribe({
      next: () => {
        this.seedText = '';
        this.loadVersions();
      },
      error: (err) => (this.seedError = this.fail(err, 'common.saveFailed')),
    });
  }

  downloadCertificate(proposal: AmendmentProposal): void {
    this.amendments.downloadCertificate(proposal.id).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${proposal.proposalNo}-certificate.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
}
