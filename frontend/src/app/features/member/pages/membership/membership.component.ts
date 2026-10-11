import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { LanguageService } from '../../../../core/services/language.service';
import {
  GovernanceService,
  MembershipAction,
  MembershipApplication,
  MembershipAppeal,
  FeeWaiver,
  SlaInfo,
} from '../../../../core/services/governance.service';

type Tab = 'applications' | 'appeals' | 'waivers' | 'notices';

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

@Component({
  selector: 'app-membership',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, DatePipe, FormsModule, IconComponent],
  template: `
    <div class="page-container">
      <header class="gov-hero">
        <span class="gov-hero-icon"><app-icon name="id-card" [size]="22" /></span>
        <div class="gov-hero-text">
          <h1 class="gov-hero-title">{{ 'membershipGov.title' | translate }}</h1>
          <p class="gov-hero-sub">{{ 'membershipGov.subtitle' | translate }}</p>
        </div>
      </header>

      <nav class="ds-tab-bar mb-tab-bar" role="tablist">
        <button type="button" class="ds-tab" [class.is-active]="tab() === 'applications'" (click)="tab.set('applications')">
          <app-icon name="id-card" [size]="16" /> {{ 'membershipGov.tabs.applications' | translate }}
        </button>
        <button type="button" class="ds-tab" [class.is-active]="tab() === 'appeals'" (click)="tab.set('appeals')">
          <app-icon name="shield" [size]="16" /> {{ 'membershipGov.tabs.appeals' | translate }}
        </button>
        <button type="button" class="ds-tab" [class.is-active]="tab() === 'waivers'" (click)="tab.set('waivers')">
          <app-icon name="coin" [size]="16" /> {{ 'membershipGov.tabs.waivers' | translate }}
        </button>
        <button type="button" class="ds-tab" [class.is-active]="tab() === 'notices'" (click)="tab.set('notices')">
          <app-icon name="alert" [size]="16" /> {{ 'membershipGov.tabs.notices' | translate }}
        </button>
      </nav>

      @if (loading()) {
        <div class="card mb-skeleton"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-line"></div></div>
      } @else if (error()) {
        <div class="card"><p class="field-error">{{ 'common.loadFailed' | translate }}</p></div>
      }

      <!-- ================= Applications ================= -->
      @if (!loading() && !error() && tab() === 'applications') {
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="doc" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'membershipGov.apply.title' | translate }}</h2>
            </div>
          </div>
          <div class="ds-card-body">
            <form (ngSubmit)="submitApplication()" #applyForm="ngForm">
              <div class="mb-grid">
                <div class="field">
                  <label for="fullName">{{ 'membershipGov.apply.fullName' | translate }}</label>
                  <input id="fullName" class="field-control" name="fullName" [(ngModel)]="apply.fullName" required />
                </div>
                <div class="field-row">
                  <div class="field">
                    <label for="fatherName">{{ 'membershipGov.apply.fatherName' | translate }}</label>
                    <input id="fatherName" class="field-control" name="fatherName" [(ngModel)]="apply.fatherName" required />
                  </div>
                  <div class="field">
                    <label for="motherName">{{ 'membershipGov.apply.motherName' | translate }}</label>
                    <input id="motherName" class="field-control" name="motherName" [(ngModel)]="apply.motherName" required />
                  </div>
                </div>
                <div class="field-row">
                  <div class="field">
                    <label for="mobile">{{ 'membershipGov.apply.mobile' | translate }}</label>
                    <input id="mobile" class="field-control" name="mobile" [(ngModel)]="apply.mobile" required />
                  </div>
                  <div class="field">
                    <label for="email">{{ 'membershipGov.apply.email' | translate }}</label>
                    <input id="email" class="field-control" name="email" type="email" [(ngModel)]="apply.email" required />
                  </div>
                </div>
                <div class="field">
                  <label for="ownership">{{ 'membershipGov.apply.ownershipType' | translate }}</label>
                  <select id="ownership" class="field-control" name="ownership" [(ngModel)]="apply.ownershipType" required>
                    <option value="owner">{{ 'membershipGov.ownership.owner' | translate }}</option>
                    <option value="co_owner">{{ 'membershipGov.ownership.co_owner' | translate }}</option>
                    <option value="inheritance">{{ 'membershipGov.ownership.inheritance' | translate }}</option>
                    <option value="purchased">{{ 'membershipGov.ownership.purchased' | translate }}</option>
                    <option value="other">{{ 'membershipGov.ownership.other' | translate }}</option>
                  </select>
                </div>
                <div class="field">
                  <label for="addressHouse">{{ 'membershipGov.apply.address' | translate }}</label>
                  <input id="addressHouse" class="field-control" name="addressHouse" [(ngModel)]="apply.addressHouse" />
                </div>
              </div>
              <div class="mb-docs">
                <div class="field">
                  <label for="nidDoc">{{ 'membershipGov.apply.nidDoc' | translate }}</label>
                  <input id="nidDoc" type="file" accept=".jpg,.jpeg,.png,.pdf" (change)="onNid($event)" />
                </div>
                <div class="field">
                  <label for="ownDoc">{{ 'membershipGov.apply.ownershipDoc' | translate }}</label>
                  <input id="ownDoc" type="file" accept=".jpg,.jpeg,.png,.pdf" (change)="onOwnership($event)" />
                </div>
              </div>
              <label class="checkbox-item mb-consent">
                <input id="consent" type="checkbox" [(ngModel)]="apply.consent" name="consent" required />
                <span>{{ 'membershipGov.apply.consent' | translate }}</span>
              </label>
              @if (applyError()) { <p class="field-error">{{ applyError() | translate }}</p> }
              @if (applySuccess()) {
                <p class="gov-success"><app-icon name="check-circle" [size]="16" /> {{ 'membershipGov.apply.success' | translate }}</p>
              }
              <div class="form-actions">
                <button class="btn btn-primary" type="submit" [disabled]="applyForm.invalid || submitting()">
                  {{ 'membershipGov.apply.submit' | translate }}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="inbox" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'membershipGov.myApplications' | translate }}</h2>
            </div>
          </div>
          <div class="ds-card-body">
            @if (applications().length === 0) {
              <div class="gov-empty">
                <span class="gov-empty-icon"><app-icon name="doc" [size]="22" /></span>
                <p>{{ 'membershipGov.empty.applications' | translate }}</p>
              </div>
            }
            <div class="data-table data-table-cards">
              <table>
                <tbody>
                  @for (app of applications(); track app.id) {
                    <tr>
                      <td [attr.data-label]="'membershipGov.no' | translate"><span class="ds-mono">{{ app.application_no }}</span></td>
                      <td [attr.data-label]="'membershipGov.status' | translate">
                        <span class="ds-tag" [attr.data-tone]="statusTone(app.status)">{{ 'membershipGov.statuses.' + app.status | translate }}</span>
                      </td>
                      <td [attr.data-label]="'membershipGov.sla' | translate">
                        <span class="ds-badge" [attr.data-tone]="slaTone(app.sla)">{{ slaLabel(app.sla) }}</span>
                      </td>
                      <td [attr.data-label]="'membershipGov.submittedAt' | translate">{{ (app.submitted_at | date: 'yyyy-MM-dd') }}</td>
                    </tr>
                    <tr class="timeline-row">
                      <td colspan="4">
                        <ol class="gov-timeline">
                          @for (event of app.timeline; track $index) {
                            <li>
                              <strong>{{ 'membershipGov.events.' + event.event | translate }}</strong>
                              — {{ event.at | date: 'yyyy-MM-dd' }}
                              @if (event.note) { <span class="mb-note">( {{ event.note }} )</span> }
                            </li>
                          }
                        </ol>
                        @if (app.status === 'rejected') {
                          <p class="field-error">{{ 'membershipGov.rejectionReason' | translate }}: {{ app.rejection_reason }}</p>
                          <button type="button" class="btn btn-secondary btn-sm" (click)="fileAppealFor(app)">
                            {{ 'membershipGov.appealThis' | translate }}
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </section>
      }

      <!-- ================= Appeals ================= -->
      @if (!loading() && !error() && tab() === 'appeals') {
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="shield" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'membershipGov.appeals.file' | translate }}</h2>
            </div>
          </div>
          <div class="ds-card-body">
            <form (ngSubmit)="submitAppeal()" #appealForm="ngForm">
              <div class="field">
                <label for="appealTarget">{{ 'membershipGov.appeals.target' | translate }}</label>
                <select id="appealTarget" class="field-control" name="target" [(ngModel)]="appealTarget" required>
                  <option value="">{{ 'membershipGov.appeals.selectTarget' | translate }}</option>
                  @for (app of decidableApplications(); track app.id) {
                    <option [value]="'app-' + app.id">{{ app.application_no }}</option>
                  }
                  @for (action of decidableActions(); track action.id) {
                    <option [value]="'action-' + action.id">{{ 'membershipGov.actionNo' | translate }} #{{ action.id }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label for="grounds">{{ 'membershipGov.appeals.grounds' | translate }}</label>
                <textarea id="grounds" class="field-control" name="grounds" rows="3" [(ngModel)]="appealGrounds" required></textarea>
              </div>
              <p class="field-hint">{{ 'membershipGov.appeals.windowNote' | translate }}</p>
              @if (appealError()) { <p class="field-error">{{ appealError() | translate }}</p> }
              <div class="form-actions">
                <button class="btn btn-primary" type="submit" [disabled]="appealForm.invalid || submitting()">
                  {{ 'membershipGov.appeals.submit' | translate }}
                </button>
              </div>
            </form>
          </div>
        </section>
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="inbox" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'membershipGov.myAppeals' | translate }}</h2>
            </div>
          </div>
          <div class="ds-card-body">
            @if (appeals().length === 0) {
              <div class="gov-empty">
                <span class="gov-empty-icon"><app-icon name="shield" [size]="22" /></span>
                <p>{{ 'membershipGov.empty.appeals' | translate }}</p>
              </div>
            }
            <div class="data-table data-table-cards">
              <table>
                <tbody>
                  @for (appeal of appeals(); track appeal.id) {
                    <tr>
                      <td [attr.data-label]="'common.id' | translate"><span class="ds-mono">#{{ appeal.id }}</span></td>
                      <td [attr.data-label]="'membershipGov.status' | translate">
                        <span class="ds-tag" [attr.data-tone]="statusTone(appeal.status)">{{ 'membershipGov.appealStatuses.' + appeal.status | translate }}</span>
                      </td>
                      <td [attr.data-label]="'membershipGov.appeals.window' | translate">{{ appeal.window_expires_at }}</td>
                      <td [attr.data-label]="'membershipGov.appeals.decision' | translate">{{ appeal.decision || '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </section>
      }

      <!-- ================= Waivers ================= -->
      @if (!loading() && !error() && tab() === 'waivers') {
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="coin" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'membershipGov.waivers.apply' | translate }}</h2>
            </div>
          </div>
          <div class="ds-card-body">
            <form (ngSubmit)="submitWaiver()" #waiverForm="ngForm">
              <div class="field">
                <label for="waiverType">{{ 'membershipGov.waivers.type' | translate }}</label>
                <select id="waiverType" class="field-control" name="waiverType" [(ngModel)]="waiverType" required>
                  <option value="waiver">{{ 'membershipGov.waivers.typewaiver' | translate }}</option>
                  <option value="installment">{{ 'membershipGov.waivers.typeinstallment' | translate }}</option>
                </select>
              </div>
              <div class="field">
                <label for="waiverReason">{{ 'membershipGov.waivers.reason' | translate }}</label>
                <textarea id="waiverReason" class="field-control" name="waiverReason" rows="3" [(ngModel)]="waiverReason" required></textarea>
              </div>
              <div class="field mb-months">
                <label for="waiverMonths">{{ 'membershipGov.waivers.months' | translate }}</label>
                <input id="waiverMonths" class="field-control" type="number" min="1" name="waiverMonths" [(ngModel)]="waiverMonths" />
              </div>
              @if (waiverError()) { <p class="field-error">{{ waiverError() | translate }}</p> }
              <div class="form-actions">
                <button class="btn btn-primary" type="submit" [disabled]="waiverForm.invalid || submitting()">
                  {{ 'membershipGov.waivers.submit' | translate }}
                </button>
              </div>
            </form>
          </div>
        </section>
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="inbox" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'membershipGov.myWaivers' | translate }}</h2>
            </div>
          </div>
          <div class="ds-card-body">
            @if (waivers().length === 0) {
              <div class="gov-empty">
                <span class="gov-empty-icon"><app-icon name="coin" [size]="22" /></span>
                <p>{{ 'membershipGov.empty.waivers' | translate }}</p>
              </div>
            }
            <div class="data-table data-table-cards">
              <table>
                <tbody>
                  @for (waiver of waivers(); track waiver.id) {
                    <tr>
                      <td [attr.data-label]="'membershipGov.waivers.type' | translate">{{ 'membershipGov.waivers.type' + waiver.type | translate }}</td>
                      <td [attr.data-label]="'membershipGov.waivers.reason' | translate">{{ waiver.reason }}</td>
                      <td [attr.data-label]="'membershipGov.status' | translate">
                        <span class="ds-tag" [attr.data-tone]="statusTone(waiver.status)">{{ 'membershipGov.waiverStatuses.' + waiver.status | translate }}</span>
                      </td>
                      <td [attr.data-label]="'membershipGov.waivers.note' | translate">{{ waiver.decision_note || '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </section>
      }

      <!-- ================= Notices / suspension ================= -->
      @if (!loading() && !error() && tab() === 'notices') {
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="alert" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'membershipGov.notices.title' | translate }}</h2>
            </div>
          </div>
          <div class="ds-card-body">
            @if (actions().length === 0) {
              <div class="gov-empty">
                <span class="gov-empty-icon"><app-icon name="check-circle" [size]="22" /></span>
                <p>{{ 'membershipGov.empty.notices' | translate }}</p>
              </div>
            }
            <div class="data-table data-table-cards">
              <table>
                <tbody>
                  @for (action of actions(); track action.id) {
                    <tr>
                      <td [attr.data-label]="'membershipGov.notices.type' | translate">{{ 'membershipGov.notices.type' + action.type | translate }}</td>
                      <td [attr.data-label]="'membershipGov.notices.reason' | translate">{{ action.reason }}</td>
                      <td [attr.data-label]="'membershipGov.notices.deadline' | translate">{{ action.response_deadline || '—' }}</td>
                      <td [attr.data-label]="'membershipGov.status' | translate">
                        <span class="ds-tag" [attr.data-tone]="statusTone(action.status)">{{ 'membershipGov.actionStatuses.' + action.status | translate }}</span>
                      </td>
                    </tr>
                    @if (canRespond(action)) {
                      <tr class="timeline-row">
                        <td colspan="4">
                          <div class="field">
                            <label for="response-{{ action.id }}">{{ 'membershipGov.notices.respond' | translate }}</label>
                            <textarea id="response-{{ action.id }}" class="field-control" rows="2" [(ngModel)]="action.responseText"></textarea>
                          </div>
                          <div class="form-actions">
                            <button type="button" class="btn btn-primary" (click)="submitResponse(action)">
                              {{ 'membershipGov.notices.sendResponse' | translate }}
                            </button>
                          </div>
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          </div>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .mb-tab-bar { margin-bottom: 0.25rem; }
      .ds-tab app-icon { vertical-align: -3px; margin-inline-end: 0.3rem; }
      .mb-skeleton { padding: 1.25rem; display: grid; gap: 0.75rem; }
      /* Two-column field grid on wide screens; fields keep their global look. */
      .mb-grid { display: grid; gap: 0 1.1rem; }
      @media (min-width: 768px) {
        .mb-grid { grid-template-columns: 1fr 1fr; }
        .mb-grid .field-row { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 0 1.1rem; }
      }
      .mb-docs {
        display: grid;
        gap: 0 1.1rem;
        margin-top: 0.4rem;
        padding-top: 0.9rem;
        border-top: 1px dashed var(--gray-200);
      }
      @media (min-width: 768px) {
        .mb-docs { grid-template-columns: 1fr 1fr; }
      }
      .mb-consent { margin: 0.6rem 0 0.4rem; font-size: 0.875rem; line-height: 1.6; }
      .mb-months { max-width: 12rem; }
      .timeline-row td { background: var(--gray-50); }
      .mb-note { color: var(--gray-500); }
    `,
  ],
})
export class MembershipComponent implements OnInit {
  private readonly governance = inject(GovernanceService);
  private readonly translate = inject(TranslateService);
  readonly lang = inject(LanguageService).lang;

  readonly tab = signal<Tab>('applications');
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly submitting = signal(false);
  readonly applications = signal<MembershipApplication[]>([]);
  readonly appeals = signal<MembershipAppeal[]>([]);
  readonly waivers = signal<FeeWaiver[]>([]);
  readonly actions = signal<Array<MembershipAction & { responseText?: string }>>([]);
  readonly applySuccess = signal(false);

  readonly apply = {
    fullName: '',
    fatherName: '',
    motherName: '',
    mobile: '',
    email: '',
    ownershipType: 'owner',
    addressHouse: '',
    consent: false,
  };
  nidFile: File | null = null;
  ownershipFile: File | null = null;
  readonly applyError = signal('');
  pendingAppealApplicationId: number | null = null;

  appealTarget = '';
  appealGrounds = '';
  readonly appealError = signal('');

  waiverType: 'waiver' | 'installment' = 'waiver';
  waiverReason = '';
  waiverMonths: number | null = null;
  readonly waiverError = signal('');

  readonly decidableApplications = computed(() =>
    this.applications().filter((a) => a.status === 'rejected'),
  );
  readonly decidableActions = computed(() =>
    this.actions().filter((a) => a.status === 'decided'),
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.governance.myApplications().subscribe({
      next: (rows) => {
        this.applications.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
    this.governance.myAppeals().subscribe({ next: (rows) => this.appeals.set(rows) });
    this.governance.myWaivers().subscribe({ next: (rows) => this.waivers.set(rows) });
    this.governance.myActions().subscribe({ next: (rows) => this.actions.set(rows) });
  }

  onNid(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.nidFile = input.files?.[0] ?? null;
  }

  onOwnership(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.ownershipFile = input.files?.[0] ?? null;
  }

  submitApplication(): void {
    if (!this.apply.consent) return;
    this.submitting.set(true);
    this.applyError.set('');
    this.applySuccess.set(false);
    this.governance.submitApplication({ ...this.apply }).subscribe({
      next: (created) => {
        if (this.nidFile || this.ownershipFile) {
          this.governance
            .uploadApplicationDocuments(created.id, this.nidFile, this.ownershipFile)
            .subscribe({ complete: () => this.load() });
        } else {
          this.load();
        }
        this.submitting.set(false);
        this.applySuccess.set(true);
      },
      error: () => {
        this.applyError.set('common.saveFailed');
        this.submitting.set(false);
      },
    });
  }

  fileAppealFor(app: MembershipApplication): void {
    this.tab.set('appeals');
    this.appealTarget = `app-${app.id}`;
  }

  submitAppeal(): void {
    this.appealError.set('');
    const target = this.appealTarget;
    const payload = target.startsWith('app-')
      ? { application_id: Number(target.slice(4)), grounds: this.appealGrounds }
      : { membership_action_id: Number(target.slice(7)), grounds: this.appealGrounds };
    this.submitting.set(true);
    this.governance.fileAppeal(payload).subscribe({
      next: () => {
        this.appealGrounds = '';
        this.appealTarget = '';
        this.submitting.set(false);
        this.governance.myAppeals().subscribe({ next: (rows) => this.appeals.set(rows) });
      },
      error: (err) => {
        this.appealError.set(
          err.status === 409 ? 'membershipGov.appeals.windowClosed' : 'common.saveFailed',
        );
        this.submitting.set(false);
      },
    });
  }

  submitWaiver(): void {
    if (!this.waiverReason.trim()) {
      this.waiverError.set('membershipGov.waivers.reasonRequired');
      return;
    }
    this.waiverError.set('');
    this.submitting.set(true);
    this.governance
      .applyWaiver({
        type: this.waiverType,
        reason: this.waiverReason,
        months: this.waiverMonths ?? undefined,
      })
      .subscribe({
        next: () => {
          this.waiverReason = '';
          this.waiverMonths = null;
          this.submitting.set(false);
          this.governance.myWaivers().subscribe({ next: (rows) => this.waivers.set(rows) });
        },
        error: () => {
          this.waiverError.set('common.saveFailed');
          this.submitting.set(false);
        },
      });
  }

  canRespond(action: MembershipAction & { responseText?: string }): boolean {
    return action.status === 'noticed' || action.status === 'awaiting_response';
  }

  submitResponse(action: MembershipAction & { responseText?: string }): void {
    if (!action.responseText?.trim()) return;
    this.governance.respondToAction(action.id, action.responseText).subscribe({
      next: (updated) => {
        this.actions.update((rows) => rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      },
    });
  }

  statusTone(status: string): string {
    if (status === 'approved' || status === 'upheld' || status === 'applied') return 'good';
    if (status === 'rejected' || status === 'overturned' || status === 'decided') return 'bad';
    if (status === 'under_review' || status === 'noticed' || status === 'awaiting_response') return 'warn';
    return 'neutral';
  }

  slaTone(sla: SlaInfo): string {
    if (sla.state === 'met') return 'good';
    if (sla.state === 'overdue') return 'bad';
    if (sla.state === 'due_soon') return 'warn';
    return 'neutral';
  }

  slaLabel(sla: SlaInfo): string {
    const key = `membershipGov.sla.${sla.state}`;
    return `${this.translate.instant(key)} (${sla.days_remaining})`;
  }
}
