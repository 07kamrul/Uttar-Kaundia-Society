import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { IconComponent } from '../../../../shared/icon/icon.component';
import {
  Complaint,
  ComplaintConstants,
  GovernanceService,
  SlaInfo,
} from '../../../../core/services/governance.service';
import { LanguageService } from '../../../../core/services/language.service';
import { localizeDigits } from '../../../../core/services/resolution-book.service';

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
  selector: 'app-complaints-admin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, DatePipe, FormsModule, IconComponent, SectionLoaderComponent],
  template: `
    <div class="page-container">
      <header class="gov-hero">
        <span class="gov-hero-icon"><app-icon name="inbox" [size]="22" /></span>
        <div class="gov-hero-text">
          <h1 class="gov-hero-title">{{ 'complaintsAdmin.title' | translate }}</h1>
          <p class="gov-hero-sub">{{ 'complaintsAdmin.subtitle' | translate }}</p>
        </div>
        <div class="gov-hero-side">
          <span class="ds-badge">{{ 'complaintsAdmin.total' | translate }}: {{ digits(complaints().length) }}</span>
          @if (overdueCount() > 0) {
            <span class="ds-badge" data-tone="bad">
              <app-icon name="alert" [size]="13" /> {{ digits(overdueCount()) }}
            </span>
          }
        </div>
      </header>

      @if (!loading() && !loadFailed() && overdueCount() > 0) {
        <div class="gov-notice" role="alert">
          <app-icon name="alert" [size]="19" />
          <p>{{ 'complaintsAdmin.overdueNotice' | translate: { count: digits(overdueCount()) } }}</p>
        </div>
      }

      <!-- The whole list is fetched once and filtered locally, so the chips
           react instantly and always show live per-status counts. -->
      <div class="tab-row filters">
        @for (option of statusFilters; track option) {
          <button type="button" class="tab" [class.active]="filter() === option" (click)="filter.set(option)">
            {{ 'complaintsAdmin.filters.' + option | translate }} ({{ count(option) }})
          </button>
        }
      </div>

      @if (loading()) {
        <div class="ds-card"><div class="ds-card-body"><app-section-loader variant="rows" [count]="4" /></div></div>
      } @else if (loadFailed()) {
        <div class="ds-card"><div class="ds-card-body">
          <div class="error-box" role="alert">
            <p class="error-box-text">{{ 'common.loadFailed' | translate }}</p>
            <button type="button" class="btn btn-secondary" (click)="load()">{{ 'common.retry' | translate }}</button>
          </div>
        </div></div>
      } @else if (filtered().length === 0) {
        <div class="ds-card"><div class="ds-card-body">
          <div class="gov-empty">
            <span class="gov-empty-icon"><app-icon name="inbox" [size]="22" /></span>
            <p>{{ 'complaintsAdmin.empty' | translate }}</p>
          </div>
        </div></div>
      } @else {
        <div class="data-table data-table-cards data-table-cards-lg">
          <table>
            <thead>
              <tr>
                <th>{{ 'complaintsModule.no' | translate }}</th>
                <th>{{ 'complaintsModule.subject' | translate }}</th>
                <th>{{ 'complaintsModule.status' | translate }}</th>
                <th>{{ 'complaintsModule.slaAck' | translate }}</th>
                <th>{{ 'complaintsModule.slaUpdate' | translate }}</th>
                <th>{{ 'common.actions' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (complaint of filtered(); track complaint.id) {
                <tr class="ca-row" [class.overdue]="isOverdue(complaint)" (click)="toggle(complaint.id)">
                  <td [attr.data-label]="'complaintsModule.no' | translate">
                    <span class="ds-mono">{{ complaint.complaint_no }}</span><br />
                    <span class="muted">{{ complaint.complainant_name || '—' }}</span>
                  </td>
                  <td [attr.data-label]="'complaintsModule.subject' | translate">
                    {{ complaint.subject }}
                    <app-icon class="ca-chevron" [name]="openId() === complaint.id ? 'chevron-down' : 'chevron-right'" [size]="15" />
                  </td>
                  <td [attr.data-label]="'complaintsModule.status' | translate">
                    <span class="ds-tag" [attr.data-tone]="statusTone(complaint.status)">{{ 'complaintsModule.statuses.' + complaint.status | translate }}</span>
                  </td>
                  <td [attr.data-label]="'complaintsModule.slaAck' | translate">
                    <span class="ds-badge" [attr.data-tone]="slaTone(complaint.sla_ack)">{{ ('complaintsAdmin.sla.' + complaint.sla_ack.state | translate) + ' (' + digits(complaint.sla_ack.days_remaining) + ')' }}</span>
                  </td>
                  <td [attr.data-label]="'complaintsModule.slaUpdate' | translate">
                    <span class="ds-badge" [attr.data-tone]="slaTone(complaint.sla_update)">{{ ('complaintsAdmin.sla.' + complaint.sla_update.state | translate) + ' (' + digits(complaint.sla_update.days_remaining) + ')' }}</span>
                  </td>
                  <td [attr.data-label]="'common.actions' | translate">
                    @if (!complaint.acknowledged_at) {
                      <button type="button" class="btn btn-primary btn-sm" (click)="acknowledge(complaint, $event)">{{ 'complaintsAdmin.acknowledge' | translate }}</button>
                    }
                    <button type="button" class="btn btn-secondary btn-sm" (click)="toggle(complaint.id, $event)">{{ 'complaintsAdmin.work' | translate }}</button>
                  </td>
                </tr>
                @if (openId() === complaint.id) {
                  <tr class="detail-row">
                    <td colspan="6">
                      <div class="ca-detail">
                        <p class="ca-title"><app-icon name="doc" [size]="16" /> {{ 'complaintsAdmin.detailsTitle' | translate }}</p>
                        <p class="ca-details">{{ complaint.details }}</p>

                        <div class="ds-field-grid ca-meta">
                          <div class="ds-field">
                            <span class="ds-field-label">{{ 'complaintsModule.new.category' | translate }}</span>
                            <span class="ds-field-value">{{ categoryName(complaint.category) }}</span>
                          </div>
                          <div class="ds-field">
                            <span class="ds-field-label">{{ 'complaintsAdmin.meta.submitted' | translate }}</span>
                            <span class="ds-field-value">{{ complaint.submitted_at | date: 'yyyy-MM-dd HH:mm' }}</span>
                          </div>
                          <div class="ds-field">
                            <span class="ds-field-label">{{ 'complaintsAdmin.meta.acknowledged' | translate }}</span>
                            <span class="ds-field-value">{{ complaint.acknowledged_at ? (complaint.acknowledged_at | date: 'yyyy-MM-dd HH:mm') : '—' }}</span>
                          </div>
                          <div class="ds-field">
                            <span class="ds-field-label">{{ 'complaintsAdmin.assignee' | translate }}</span>
                            <span class="ds-field-value">{{ complaint.assigned_admin_name || '—' }}</span>
                          </div>
                        </div>

                        @if (complaint.resolution_note) {
                          <p class="ca-resolution">
                            <app-icon name="check-circle" [size]="15" />
                            <span><strong>{{ 'complaintsModule.resolution' | translate }}:</strong> {{ complaint.resolution_note }}</span>
                          </p>
                        }

                        <div class="ca-actions-row">
                          <button type="button" class="btn btn-secondary btn-sm" (click)="downloadLetter(complaint)">
                            <app-icon name="download" [size]="14" /> PDF
                          </button>
                          @if (complaint.has_evidence) {
                            <button type="button" class="btn btn-secondary btn-sm" (click)="downloadEvidence(complaint)">
                              <app-icon name="download" [size]="14" /> {{ 'complaintsAdmin.downloadEvidence' | translate }}
                            </button>
                          }
                        </div>

                        <div class="ca-workflow">
                          @if (!complaint.acknowledged_at) {
                            <button type="button" class="btn btn-primary" (click)="acknowledge(complaint, $event)">{{ 'complaintsAdmin.acknowledge' | translate }}</button>
                          }
                          <div class="ca-work-grid">
                            <div class="field">
                              <label [for]="'assignee-' + complaint.id">{{ 'complaintsAdmin.assigneeId' | translate }}</label>
                              <input
                                [id]="'assignee-' + complaint.id"
                                class="field-control"
                                type="number"
                                min="1"
                                [(ngModel)]="assigneeIds[complaint.id]"
                              />
                              <div class="ca-inline">
                                <button type="button" class="btn btn-secondary btn-sm" [disabled]="!assigneeIds[complaint.id]" (click)="assign(complaint, $event)">
                                  {{ 'complaintsAdmin.assign' | translate }}
                                </button>
                              </div>
                            </div>
                            <div class="field">
                              <label [for]="'note-' + complaint.id">{{ 'complaintsAdmin.updateNote' | translate }}</label>
                              <textarea [id]="'note-' + complaint.id" class="field-control" rows="2" [(ngModel)]="notes[complaint.id]"></textarea>
                              <div class="ca-inline">
                                <button type="button" class="btn btn-secondary btn-sm" [disabled]="!noteOf(complaint)" (click)="update(complaint, $event)">
                                  {{ 'complaintsAdmin.sendUpdate' | translate }}
                                </button>
                                @if (!isFinal(complaint)) {
                                  <button type="button" class="btn btn-primary btn-sm" [disabled]="!noteOf(complaint)" (click)="resolve(complaint, $event)">
                                    {{ 'complaintsAdmin.resolve' | translate }}
                                  </button>
                                }
                              </div>
                            </div>
                          </div>
                          @if (complaint.status === 'resolved') {
                            <button type="button" class="btn btn-secondary" (click)="close(complaint, $event)">{{ 'complaintsAdmin.close' | translate }}</button>
                          }
                        </div>

                        @if (complaint.timeline.length) {
                          <ol class="gov-timeline">
                            @for (event of complaint.timeline; track $index) {
                              <li>
                                <strong>{{ eventLabel(event.event) }}</strong> — {{ event.at | date: 'yyyy-MM-dd' }}
                                @if (event.actor) { <span class="muted">· {{ event.actor }}</span> }
                                @if (displayNote(event.note); as note) { <span class="ca-event-note">{{ note }}</span> }
                              </li>
                            }
                          </ol>
                        }
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .muted { color: var(--gray-600); }
      .ca-row { cursor: pointer; }
      .data-table td:last-child .btn + .btn { margin-top: 0.3rem; }
      .ca-chevron { color: var(--gray-400); vertical-align: -2px; }
      .detail-row td { background: var(--gray-50); overflow-wrap: anywhere; }
      tr.overdue td:first-child { border-inline-start: 4px solid var(--red-600, #9c3a2c); }
      .error-box-text { margin: 0 0 0.75rem; }

      .ca-title {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin: 0 0 0.6rem;
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--emerald-800);
      }
      .ca-details {
        margin: 0 0 1rem;
        font-size: 0.9rem;
        line-height: 1.75;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .ca-meta { margin-bottom: 1rem; }
      .ca-resolution {
        display: flex;
        align-items: flex-start;
        gap: 0.4rem;
        margin: 0 0 1rem;
        padding: 0.6rem 0.8rem;
        border-radius: var(--radius-sm);
        background: var(--emerald-50);
        border: 1px solid color-mix(in srgb, var(--emerald-600) 30%, transparent);
        color: var(--emerald-800);
        font-size: 0.875rem;
        line-height: 1.6;
      }
      .ca-actions-row { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }

      .ca-workflow {
        display: grid;
        gap: 1rem;
        justify-items: start;
        border-top: 1px dashed var(--gray-200);
        padding-top: 1rem;
      }
      .ca-work-grid { display: grid; gap: 1rem; grid-template-columns: 1fr; width: 100%; }
      @media (min-width: 768px) {
        .ca-work-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); }
      }
      .ca-inline { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .ca-work-grid input.field-control { flex: 1 1 9rem; min-width: 0; }
      .ca-event-note {
        display: block;
        margin-top: 0.1rem;
        color: var(--gray-600);
        font-size: 0.82rem;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
    `,
  ],
})
export class ComplaintsAdminComponent implements OnInit {
  private readonly governance = inject(GovernanceService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  readonly lang = this.language.lang;

  readonly statusFilters = ['submitted', 'acknowledged', 'investigating', 'resolved', 'closed', 'all'] as const;
  readonly filter = signal<string>('all');
  readonly complaints = signal<Complaint[]>([]);
  readonly constants = signal<ComplaintConstants | null>(null);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly openId = signal<number | null>(null);
  assigneeIds: Record<number, number | undefined> = {};
  notes: Record<number, string | undefined> = {};

  readonly filtered = computed(() => {
    const f = this.filter();
    const rows = this.complaints();
    return f === 'all' ? rows : rows.filter((c) => c.status === f);
  });

  readonly counts = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = { all: this.complaints().length };
    for (const c of this.complaints()) counts[c.status] = (counts[c.status] ?? 0) + 1;
    return counts;
  });

  readonly overdueCount = computed(() => this.complaints().filter((c) => this.isOverdue(c)).length);

  ngOnInit(): void {
    this.governance.complaintConstants().subscribe({ next: (c) => this.constants.set(c) });
    this.load();
  }

  load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.loadFailed.set(false);
    this.governance.adminComplaints().subscribe({
      next: (rows) => {
        this.complaints.set(rows);
        this.loading.set(false);
      },
      error: () => {
        if (!silent) this.loadFailed.set(true);
        this.loading.set(false);
      },
    });
  }

  count(key: string): string {
    return this.digits(this.counts()[key] ?? 0);
  }

  digits(value: number | string): string {
    return localizeDigits(value, this.lang());
  }

  categoryName(key: string): string {
    return this.constants()?.categories.find((c) => c.key === key)?.bn ?? key;
  }

  noteOf(complaint: Complaint): string {
    return (this.notes[complaint.id] ?? '').trim();
  }

  /** Bengali label for a timeline event; unknown audit actions degrade to a
     readable form instead of leaking a raw i18n key. */
  eventLabel(event: string): string {
    const key = 'complaintsModule.events.' + event;
    const label = this.translate.instant(key);
    if (label !== key) return label;
    return event
      .replace(/^complaint\./, '')
      .replace(/_/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  /** Audit details can be machine payloads (seeded/imported rows); never
     print raw JSON into the audit trail. */
  displayNote(note: string | null | undefined): string {
    if (!note || note.trim().startsWith('{')) return '';
    return note;
  }

  isFinal(complaint: Complaint): boolean {
    return complaint.status === 'resolved' || complaint.status === 'closed';
  }

  toggle(id: number, event?: Event): void {
    event?.stopPropagation();
    this.openId.set(this.openId() === id ? null : id);
  }

  isOverdue(complaint: Complaint): boolean {
    return (
      complaint.sla_ack.state === 'overdue' ||
      (!complaint.first_update_at && complaint.sla_update.state === 'overdue')
    );
  }

  acknowledge(complaint: Complaint, event?: Event): void {
    event?.stopPropagation();
    this.governance.acknowledgeComplaint(complaint.id).subscribe({ next: () => this.load(true) });
  }

  assign(complaint: Complaint, event?: Event): void {
    event?.stopPropagation();
    const adminId = this.assigneeIds[complaint.id];
    if (!adminId) return;
    this.governance.assignComplaint(complaint.id, adminId).subscribe({ next: () => this.load(true) });
  }

  update(complaint: Complaint, event?: Event): void {
    event?.stopPropagation();
    const note = this.noteOf(complaint);
    if (!note) return;
    this.governance.updateComplaint(complaint.id, note).subscribe({ next: () => this.load(true) });
  }

  resolve(complaint: Complaint, event?: Event): void {
    event?.stopPropagation();
    const note = this.noteOf(complaint);
    if (!note) return;
    this.governance.resolveComplaint(complaint.id, note).subscribe({ next: () => this.load(true) });
  }

  close(complaint: Complaint, event?: Event): void {
    event?.stopPropagation();
    this.governance.closeComplaint(complaint.id).subscribe({ next: () => this.load(true) });
  }

  downloadLetter(complaint: Complaint, event?: Event): void {
    event?.stopPropagation();
    this.governance.complaintLetter(complaint.id).subscribe((blob) => saveBlob(blob, `${complaint.complaint_no}.pdf`));
  }

  downloadEvidence(complaint: Complaint, event?: Event): void {
    event?.stopPropagation();
    this.governance
      .downloadDocument(`/api/member/complaints/${complaint.id}/evidence/download`)
      .subscribe((blob) => saveBlob(blob, complaint.complaint_no + '-evidence'));
  }

  statusTone(status: string): string {
    if (status === 'resolved' || status === 'closed') return 'good';
    if (status === 'rejected') return 'bad';
    if (status === 'acknowledged' || status === 'investigating') return 'warn';
    return 'neutral';
  }

  slaTone(sla: SlaInfo): string {
    if (sla.state === 'met') return 'good';
    if (sla.state === 'overdue') return 'bad';
    if (sla.state === 'due_soon') return 'warn';
    return 'neutral';
  }
}
