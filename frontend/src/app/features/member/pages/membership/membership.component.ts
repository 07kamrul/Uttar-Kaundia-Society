import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { DatePickerComponent } from '../../../../shared/date-picker/date-picker.component';
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
  imports: [TranslatePipe, DatePipe, FormsModule, IconComponent, DatePickerComponent],
  template: `
    <div class="page-container">
      <header class="page-header">
        <h1><app-icon name="id-card" /> {{ 'membershipGov.title' | translate }}</h1>
        <p class="muted">{{ 'membershipGov.subtitle' | translate }}</p>
      </header>

      <nav class="tab-row">
        <button type="button" class="tab" [class.active]="tab() === 'applications'" (click)="tab.set('applications')">
          {{ 'membershipGov.tabs.applications' | translate }}
        </button>
        <button type="button" class="tab" [class.active]="tab() === 'appeals'" (click)="tab.set('appeals')">
          {{ 'membershipGov.tabs.appeals' | translate }}
        </button>
        <button type="button" class="tab" [class.active]="tab() === 'waivers'" (click)="tab.set('waivers')">
          {{ 'membershipGov.tabs.waivers' | translate }}
        </button>
        <button type="button" class="tab" [class.active]="tab() === 'notices'" (click)="tab.set('notices')">
          {{ 'membershipGov.tabs.notices' | translate }}
        </button>
      </nav>

      @if (loading()) {
        <div class="card"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-line"></div></div>
      } @else if (error()) {
        <div class="card"><p class="field-error">{{ 'common.loadFailed' | translate }}</p></div>
      }

      <!-- ================= Applications ================= -->
      @if (!loading() && !error() && tab() === 'applications') {
        <section class="card">
          <h2>{{ 'membershipGov.apply.title' | translate }}</h2>
          <form (ngSubmit)="submitApplication()" #applyForm="ngForm">
            <div class="field">
              <label for="fullName">{{ 'membershipGov.apply.fullName' | translate }}</label>
              <input id="fullName" name="fullName" [(ngModel)]="apply.fullName" required />
            </div>
            <div class="field-row">
              <div class="field">
                <label for="fatherName">{{ 'membershipGov.apply.fatherName' | translate }}</label>
                <input id="fatherName" name="fatherName" [(ngModel)]="apply.fatherName" required />
              </div>
              <div class="field">
                <label for="motherName">{{ 'membershipGov.apply.motherName' | translate }}</label>
                <input id="motherName" name="motherName" [(ngModel)]="apply.motherName" required />
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label for="mobile">{{ 'membershipGov.apply.mobile' | translate }}</label>
                <input id="mobile" name="mobile" [(ngModel)]="apply.mobile" required />
              </div>
              <div class="field">
                <label for="email">{{ 'membershipGov.apply.email' | translate }}</label>
                <input id="email" name="email" type="email" [(ngModel)]="apply.email" required />
              </div>
            </div>
            <div class="field">
              <label for="ownership">{{ 'membershipGov.apply.ownershipType' | translate }}</label>
              <select id="ownership" name="ownership" [(ngModel)]="apply.ownershipType" required>
                <option value="owner">{{ 'membershipGov.ownership.owner' | translate }}</option>
                <option value="co_owner">{{ 'membershipGov.ownership.co_owner' | translate }}</option>
                <option value="inheritance">{{ 'membershipGov.ownership.inheritance' | translate }}</option>
                <option value="purchased">{{ 'membershipGov.ownership.purchased' | translate }}</option>
                <option value="other">{{ 'membershipGov.ownership.other' | translate }}</option>
              </select>
            </div>
            <div class="field">
              <label for="addressHouse">{{ 'membershipGov.apply.address' | translate }}</label>
              <input id="addressHouse" name="addressHouse" [(ngModel)]="apply.addressHouse" />
            </div>
            <div class="field">
              <label for="nidDoc">{{ 'membershipGov.apply.nidDoc' | translate }}</label>
              <input id="nidDoc" type="file" accept=".jpg,.jpeg,.png,.pdf" (change)="onNid($event)" />
            </div>
            <div class="field">
              <label for="ownDoc">{{ 'membershipGov.apply.ownershipDoc' | translate }}</label>
              <input id="ownDoc" type="file" accept=".jpg,.jpeg,.png,.pdf" (change)="onOwnership($event)" />
            </div>
            <div class="checkbox-row">
              <input id="consent" type="checkbox" [(ngModel)]="apply.consent" name="consent" required />
              <label for="consent">{{ 'membershipGov.apply.consent' | translate }}</label>
            </div>
            @if (applyError()) { <p class="field-error">{{ applyError() | translate }}</p> }
            <button class="btn-primary" type="submit" [disabled]="applyForm.invalid || submitting()">
              {{ 'membershipGov.apply.submit' | translate }}
            </button>
          </form>
        </section>

        <section class="card">
          <h2>{{ 'membershipGov.myApplications' | translate }}</h2>
          @if (applications().length === 0) {
            <div class="ds-empty">{{ 'membershipGov.empty.applications' | translate }}</div>
          }
          <div class="data-table data-table-cards">
            <table>
              <tbody>
                @for (app of applications(); track app.id) {
                  <tr>
                    <td [attr.data-label]="'membershipGov.no' | translate">{{ app.application_no }}</td>
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
                      <ol class="timeline">
                        @for (event of app.timeline; track $index) {
                          <li>
                            <strong>{{ 'membershipGov.events.' + event.event | translate }}</strong>
                            — {{ event.at | date: 'yyyy-MM-dd' }}
                            @if (event.note) { <span class="muted">({{ event.note }})</span> }
                          </li>
                        }
                      </ol>
                      @if (app.status === 'rejected') {
                        <p class="field-error">{{ 'membershipGov.rejectionReason' | translate }}: {{ app.rejection_reason }}</p>
                        <button type="button" class="btn-secondary" (click)="fileAppealFor(app)">
                          {{ 'membershipGov.appealThis' | translate }}
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <!-- ================= Appeals ================= -->
      @if (!loading() && !error() && tab() === 'appeals') {
        <section class="card">
          <h2>{{ 'membershipGov.appeals.file' | translate }}</h2>
          <form (ngSubmit)="submitAppeal()" #appealForm="ngForm">
            <div class="field">
              <label for="appealTarget">{{ 'membershipGov.appeals.target' | translate }}</label>
              <select id="appealTarget" name="target" [(ngModel)]="appealTarget" required>
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
              <textarea id="grounds" name="grounds" rows="3" [(ngModel)]="appealGrounds" required></textarea>
            </div>
            <p class="muted">{{ 'membershipGov.appeals.windowNote' | translate }}</p>
            @if (appealError()) { <p class="field-error">{{ appealError() | translate }}</p> }
            <button class="btn-primary" type="submit" [disabled]="appealForm.invalid || submitting()">
              {{ 'membershipGov.appeals.submit' | translate }}
            </button>
          </form>
        </section>
        <section class="card">
          <h2>{{ 'membershipGov.myAppeals' | translate }}</h2>
          @if (appeals().length === 0) {
            <div class="ds-empty">{{ 'membershipGov.empty.appeals' | translate }}</div>
          }
          <div class="data-table data-table-cards">
            <table>
              <tbody>
                @for (appeal of appeals(); track appeal.id) {
                  <tr>
                    <td [attr.data-label]="'common.id' | translate">#{{ appeal.id }}</td>
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
        </section>
      }

      <!-- ================= Waivers ================= -->
      @if (!loading() && !error() && tab() === 'waivers') {
        <section class="card">
          <h2>{{ 'membershipGov.waivers.apply' | translate }}</h2>
          <form (ngSubmit)="submitWaiver()" #waiverForm="ngForm">
            <div class="field">
              <label for="waiverType">{{ 'membershipGov.waivers.type' | translate }}</label>
              <select id="waiverType" name="waiverType" [(ngModel)]="waiverType" required>
                <option value="waiver">{{ 'membershipGov.waivers.typewaiver' | translate }}</option>
                <option value="installment">{{ 'membershipGov.waivers.typeinstallment' | translate }}</option>
              </select>
            </div>
            <div class="field">
              <label for="waiverReason">{{ 'membershipGov.waivers.reason' | translate }}</label>
              <textarea id="waiverReason" name="waiverReason" rows="3" [(ngModel)]="waiverReason" required></textarea>
            </div>
            <div class="field">
              <label for="waiverMonths">{{ 'membershipGov.waivers.months' | translate }}</label>
              <input id="waiverMonths" type="number" min="1" name="waiverMonths" [(ngModel)]="waiverMonths" />
            </div>
            @if (waiverError()) { <p class="field-error">{{ waiverError() | translate }}</p> }
            <button class="btn-primary" type="submit" [disabled]="waiverForm.invalid || submitting()">
              {{ 'membershipGov.waivers.submit' | translate }}
            </button>
          </form>
        </section>
        <section class="card">
          <h2>{{ 'membershipGov.myWaivers' | translate }}</h2>
          @if (waivers().length === 0) {
            <div class="ds-empty">{{ 'membershipGov.empty.waivers' | translate }}</div>
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
        </section>
      }

      <!-- ================= Notices / suspension ================= -->
      @if (!loading() && !error() && tab() === 'notices') {
        <section class="card">
          <h2>{{ 'membershipGov.notices.title' | translate }}</h2>
          @if (actions().length === 0) {
            <div class="ds-empty">{{ 'membershipGov.empty.notices' | translate }}</div>
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
                          <textarea id="response-{{ action.id }}" rows="2" [(ngModel)]="action.responseText"></textarea>
                        </div>
                        <button type="button" class="btn-primary" (click)="submitResponse(action)">
                          {{ 'membershipGov.notices.sendResponse' | translate }}
                        </button>
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .page-header h1 { display: flex; align-items: center; gap: 0.5rem; }
      .muted { color: var(--gray-600, #667); }
      .tab-row { display: flex; gap: 0.25rem; flex-wrap: wrap; }
      .tab { border: none; background: transparent; padding: 0.5rem 0.9rem; border-radius: 999px; cursor: pointer; color: var(--gray-800, #1a2a20); }
      .tab.active { background: var(--emerald-600, #2e5138); color: #fff; }
      .field-row { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
      .timeline { margin: 0.25rem 0 0 1.1rem; padding: 0; }
      .timeline-row td { background: var(--surface-2, #f3efe3); }
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
