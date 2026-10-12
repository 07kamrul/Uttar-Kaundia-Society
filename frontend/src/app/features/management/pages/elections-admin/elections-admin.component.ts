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
  template: `
    <div class="page-container">
      <header class="page-header">
        <h1 class="page-title"><app-icon name="check-circle" [size]="22" /> {{ 'elections.admin.title' | translate }}</h1>
        <p class="page-subtitle">{{ 'elections.admin.subtitle' | translate }}</p>
      </header>

      @if (error()) {
        <div class="error-box" role="alert"><p style="margin: 0">{{ error() }}</p></div>
      }

      <!-- নির্বাচন তৈরি -->
      <section class="card">
        <h2 class="ea-section-title">{{ 'elections.admin.createTitle' | translate }}</h2>
        <form (ngSubmit)="createElection()" #createForm="ngForm">
          <div class="field">
            <label for="ea-title">{{ 'elections.admin.electionTitle' | translate }}</label>
            <input id="ea-title" class="field-control" name="title" [(ngModel)]="newTitle" maxlength="255" required />
          </div>
          <div class="ea-window-grid">
            <div class="field">
              <label>{{ 'elections.windows.nominationStart' | translate }}</label>
              <app-date-picker [value]="newNominationStart" (valueChange)="newNominationStart = $event" />
            </div>
            <div class="field">
              <label>{{ 'elections.windows.nominationEnd' | translate }}</label>
              <app-date-picker [value]="newNominationEnd" (valueChange)="newNominationEnd = $event" />
            </div>
            <div class="field">
              <label>{{ 'elections.windows.votingStart' | translate }}</label>
              <app-date-picker [value]="newVotingStart" (valueChange)="newVotingStart = $event" />
            </div>
            <div class="field">
              <label>{{ 'elections.windows.votingEnd' | translate }}</label>
              <app-date-picker [value]="newVotingEnd" (valueChange)="newVotingEnd = $event" />
            </div>
          </div>
          <p class="field-hint">{{ 'elections.admin.windowOrderHint' | translate }}</p>
          <button type="submit" class="btn btn-primary" [disabled]="createForm.invalid || !newTitle.trim() || !newNominationStart || !newNominationEnd || !newVotingStart || !newVotingEnd || saving()">
            {{ 'elections.admin.create' | translate }}
          </button>
        </form>
      </section>

      <!-- নির্বাচন তালিকা -->
      <section class="card">
        <h2 class="ea-section-title">{{ 'elections.admin.listTitle' | translate }}</h2>
        @if (loading()) {
          <app-section-loader variant="rows" [count]="3" />
        } @else if (elections().length === 0) {
          <div class="ds-empty">{{ 'elections.admin.empty' | translate }}</div>
        } @else {
          <div class="data-table data-table-cards">
            <table>
              <thead>
                <tr>
                  <th>{{ 'elections.admin.electionTitle' | translate }}</th>
                  <th>{{ 'elections.admin.nominationWindow' | translate }}</th>
                  <th>{{ 'elections.admin.votingWindow' | translate }}</th>
                  <th>{{ 'committeeRegistry.status' | translate }}</th>
                  <th>{{ 'common.actions' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                @for (election of elections(); track election.id) {
                  <tr [class.ea-selected]="selectedId() === election.id">
                    <td [attr.data-label]="'elections.admin.electionTitle' | translate"><strong>{{ election.title }}</strong></td>
                    <td [attr.data-label]="'elections.admin.nominationWindow' | translate">{{ fmtDate(election.nominationStart) }} → {{ fmtDate(election.nominationEnd) }}</td>
                    <td [attr.data-label]="'elections.admin.votingWindow' | translate">{{ fmtDate(election.votingStart) }} → {{ fmtDate(election.votingEnd) }}</td>
                    <td [attr.data-label]="'committeeRegistry.status' | translate">
                      <span class="ds-tag" [class.ds-tag-green]="election.status === 'confirmed'" [class.ds-tag-amber]="election.status === 'cancelled'" [class.ds-tag-blue]="election.status !== 'confirmed' && election.status !== 'cancelled'">
                        {{ 'elections.statuses.' + election.status | translate }}
                      </span>
                    </td>
                    <td [attr.data-label]="'common.actions' | translate">
                      <button type="button" class="btn btn-secondary btn-sm" [disabled]="detailLoading()" (click)="select(election.id)">
                        {{ 'elections.admin.manage' | translate }}
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <!-- লাইফসাইকেল উইজার্ড -->
      @if (detailLoading()) {
        <section class="card"><app-section-loader variant="form" [count]="3" /></section>
      } @else if (detail(); as d) {
        <section class="card">
          <div class="ea-detail-head">
            <h2 class="ea-section-title">{{ d.title }}</h2>
            <span class="ds-tag" [class.ds-tag-green]="d.status === 'confirmed'" [class.ds-tag-amber]="d.status === 'cancelled'" [class.ds-tag-blue]="d.status !== 'confirmed' && d.status !== 'cancelled'">
              {{ 'elections.statuses.' + d.status | translate }}
            </span>
          </div>
          @if (d.eligibleVoters != null) {
            <p class="ea-frozen-info">{{ 'elections.admin.eligibleVoters' | translate: { count: digits(d.eligibleVoters) } }}</p>
          }

          <div class="ea-lifecycle">
            @switch (d.status) {
              @case ('draft') {
                <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="lifecycle('openNominations')">
                  {{ 'elections.admin.openNominations' | translate }}
                </button>
              }
              @case ('nominations_open') {
                <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="askCloseNominations()">
                  {{ 'elections.admin.closeNominations' | translate }}
                </button>
                <p class="field-hint">{{ 'elections.admin.closeNominationsHint' | translate }}</p>
              }
              @case ('nominations_closed') {
                <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="lifecycle('openVoting')">
                  {{ 'elections.admin.openVoting' | translate }}
                </button>
                <p class="field-hint">{{ 'elections.admin.openVotingHint' | translate }}</p>
              }
              @case ('voting') {
                <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="lifecycle('tabulate')">
                  {{ 'elections.admin.tabulate' | translate }}
                </button>
              }
              @case ('tabulated') {
                <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="askConfirm()">
                  {{ 'elections.admin.confirmResults' | translate }}
                </button>
              }
              @case ('confirmed') {
                <p class="ea-frozen-info">{{ 'elections.admin.confirmedAt' | translate: { date: fmtDateTime(d.confirmedAt) } }}</p>
              }
              @case ('cancelled') {
                <p class="ea-frozen-info">{{ 'elections.admin.cancelledNote' | translate }}</p>
              }
            }
            @if (d.status === 'tabulated' || d.status === 'confirmed') {
              <button type="button" class="btn btn-secondary" [disabled]="pdfBusy()" (click)="downloadResultSheet()">
                <app-icon name="download" [size]="14" /> {{ 'elections.admin.resultSheet' | translate }}
              </button>
            }
            @if (d.status !== 'confirmed' && d.status !== 'cancelled') {
              <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="askCancel()">
                {{ 'elections.admin.cancel' | translate }}
              </button>
            }
          </div>

          <!-- মনোনয়ন তালিকা -->
          @if (d.nominations.length > 0) {
            <h3 class="ea-sub-title">{{ 'elections.admin.nominationsTitle' | translate }}</h3>
            <div class="data-table data-table-cards">
              <table>
                <thead>
                  <tr>
                    <th>{{ 'elections.admin.post' | translate }}</th>
                    <th>{{ 'committeeRegistry.member' | translate }}</th>
                    <th>{{ 'elections.admin.statement' | translate }}</th>
                    <th>{{ 'committeeRegistry.status' | translate }}</th>
                    @if (d.status === 'nominations_open') { <th>{{ 'common.actions' | translate }}</th> }
                  </tr>
                </thead>
                <tbody>
                  @for (nomination of d.nominations; track nomination.id) {
                    <tr>
                      <td [attr.data-label]="'elections.admin.post' | translate">{{ postLabel(nomination.postKey) }}</td>
                      <td [attr.data-label]="'committeeRegistry.member' | translate">{{ nomination.memberName || nomination.memberId }}</td>
                      <td [attr.data-label]="'elections.admin.statement' | translate">{{ nomination.statement || '—' }}</td>
                      <td [attr.data-label]="'committeeRegistry.status' | translate">
                        <span class="ds-tag" [class.ds-tag-green]="nomination.status === 'approved'" [class.ds-tag-amber]="nomination.status === 'rejected'">
                          {{ 'elections.nominationStatuses.' + nomination.status | translate }}
                        </span>
                      </td>
                      @if (d.status === 'nominations_open') {
                        <td [attr.data-label]="'common.actions' | translate" class="ea-actions">
                          <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="decideNomination(nomination.id, true)">
                            {{ 'elections.admin.approve' | translate }}
                          </button>
                          <button type="button" class="btn btn-danger btn-sm" [disabled]="busy()" (click)="decideNomination(nomination.id, false)">
                            {{ 'elections.admin.reject' | translate }}
                          </button>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <!-- ভোটের হিসাব -->
          @if (d.counts.length > 0) {
            <h3 class="ea-sub-title">{{ 'elections.admin.countsTitle' | translate }}</h3>
            <div class="data-table data-table-cards">
              <table>
                <thead>
                  <tr>
                    <th>{{ 'elections.admin.post' | translate }}</th>
                    <th>{{ 'elections.admin.candidate' | translate }}</th>
                    <th>{{ 'elections.admin.votes' | translate }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (bucket of d.counts; track bucket.postKey) {
                    @for (candidate of bucket.candidates; track candidate.nominationId) {
                      <tr>
                        <td [attr.data-label]="'elections.admin.post' | translate">{{ postLabel(bucket.postKey) }}</td>
                        <td [attr.data-label]="'elections.admin.candidate' | translate">{{ memberName(candidate.memberId) }}</td>
                        <td [attr.data-label]="'elections.admin.votes' | translate">{{ digits(candidate.votes) }}</td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          }

          <!-- নির্বাচনী অভিযোগ -->
          <h3 class="ea-sub-title">{{ 'elections.admin.complaintsTitle' | translate }}</h3>
          @if (d.complaints.length === 0) {
            <div class="ds-empty">{{ 'elections.admin.emptyComplaints' | translate }}</div>
          } @else {
            <div class="data-table data-table-cards">
              <table>
                <tbody>
                  @for (complaint of d.complaints; track complaint.id) {
                    <tr>
                      <td [attr.data-label]="'elections.admin.complaintSubject' | translate">
                        <strong>{{ complaint.subject }}</strong>
                        <p class="ea-details">{{ complaint.details }}</p>
                        @if (complaint.against) {
                          <p class="ea-details">{{ 'elections.admin.against' | translate }}: {{ complaint.against }}</p>
                        }
                        @if (complaint.resolution) {
                          <p class="ea-details"><em>{{ 'elections.admin.resolution' | translate }}: {{ complaint.resolution }}</em></p>
                        }
                      </td>
                      <td [attr.data-label]="'committeeRegistry.status' | translate">
                        <span class="ds-tag" [class.ds-tag-green]="complaint.status === 'resolved'" [class.ds-tag-amber]="complaint.status === 'rejected'" [class.ds-tag-blue]="complaint.status === 'submitted'">
                          {{ 'elections.complaintStatuses.' + complaint.status | translate }}
                        </span>
                      </td>
                      @if (complaint.status === 'submitted') {
                        <td [attr.data-label]="'common.actions' | translate" class="ea-actions">
                          <div class="field">
                            <label [for]="'ea-resolution-' + complaint.id">{{ 'elections.admin.resolution' | translate }}</label>
                            <textarea
                              [id]="'ea-resolution-' + complaint.id"
                              class="field-control"
                              rows="2"
                              maxlength="5000"
                              [name]="'resolution-' + complaint.id"
                              [(ngModel)]="complaintResolutions[complaint.id]"
                            ></textarea>
                          </div>
                          <button type="button" class="btn btn-primary btn-sm" [disabled]="!(complaintResolutions[complaint.id] || '').trim() || busy()" (click)="decideComplaint(complaint.id, 'resolved')">
                            {{ 'elections.admin.resolve' | translate }}
                          </button>
                          <button type="button" class="btn btn-danger btn-sm" [disabled]="!(complaintResolutions[complaint.id] || '').trim() || busy()" (click)="decideComplaint(complaint.id, 'rejected')">
                            {{ 'elections.admin.reject' | translate }}
                          </button>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }

      <!-- ভোটার তালিকা হিমায়িতকরণ সতর্কতা -->
      <app-confirm-modal
        [open]="confirmKind() === 'closeNominations'"
        [title]="'elections.admin.closeNominations' | translate"
        [message]="'elections.admin.freezeWarning' | translate"
        [confirmLabel]="'elections.admin.closeNominations' | translate"
        [danger]="true"
        [loading]="busy()"
        (confirm)="confirmCloseNominations()"
        (cancel)="confirmKind.set(null)"
      />

      <!-- ফলাফল নিশ্চিতকরণ -->
      <app-confirm-modal
        [open]="confirmKind() === 'confirm'"
        [title]="'elections.admin.confirmResults' | translate"
        [message]="'elections.admin.confirmWarning' | translate"
        [confirmLabel]="'elections.admin.confirmResults' | translate"
        [loading]="busy()"
        (confirm)="confirmResults()"
        (cancel)="confirmKind.set(null)"
      />

      <!-- বাতিলকরণ -->
      <app-confirm-modal
        [open]="confirmKind() === 'cancel'"
        [title]="'elections.admin.cancel' | translate"
        [message]="'elections.admin.cancelWarning' | translate"
        [confirmLabel]="'elections.admin.cancel' | translate"
        [danger]="true"
        [loading]="busy()"
        (confirm)="confirmCancel()"
        (cancel)="confirmKind.set(null)"
      />
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .page-title { display: flex; align-items: center; gap: 0.5rem; }
      .ea-section-title { font-size: 1.05rem; font-weight: 700; margin: 0 0 0.75rem; }
      .ea-sub-title { font-size: 0.95rem; font-weight: 700; margin: 1.25rem 0 0.5rem; }
      .ea-window-grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12.5rem), 1fr)); }
      .ea-detail-head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
      .ea-detail-head .ea-section-title { margin-bottom: 0; }
      .ea-lifecycle { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0 0.25rem; }
      .ea-lifecycle .field-hint { margin: 0; width: 100%; }
      .ea-frozen-info { margin: 0.25rem 0; font-weight: 600; }
      .ea-actions { display: grid; gap: 0.35rem; }
      .ea-details { margin: 0.3rem 0 0; font-size: 0.88rem; color: var(--gray-600); overflow-wrap: anywhere; }
      .ea-lifecycle .btn { min-height: 40px; }
      @media (max-width: 640px) { .ea-lifecycle .btn { flex: 1 1 100%; } }
      .ea-selected { outline: 2px solid color-mix(in srgb, var(--emerald-600, #2e5138) 35%, transparent); }
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
