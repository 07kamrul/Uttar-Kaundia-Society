import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { Complaint, GovernanceService, SlaInfo } from '../../../../core/services/governance.service';

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
      <header class="page-header">
        <h1><app-icon name="inbox" /> {{ 'complaintsAdmin.title' | translate }}</h1>
      </header>

      <div class="tab-row filters">
        @for (option of statusFilters; track option) {
          <button type="button" class="tab" [class.active]="filter() === option" [disabled]="loading()" (click)="filter.set(option); load()">
            {{ 'complaintsAdmin.filters.' + option | translate }}
          </button>
        }
      </div>

      @if (loading()) {
        <div class="card"><app-section-loader variant="rows" [count]="4" /></div>
      } @else if (loadFailed()) {
        <div class="card"><div class="ds-empty">
          <p>{{ 'common.loadFailed' | translate }}</p>
          <button type="button" class="btn-secondary" (click)="load()">{{ 'common.retry' | translate }}</button>
        </div></div>
      } @else if (complaints().length === 0) {
        <div class="card"><div class="ds-empty">{{ 'complaintsAdmin.empty' | translate }}</div></div>
      } @else {
        <div class="data-table data-table-cards">
          <table>
            <tbody>
              @for (complaint of complaints(); track complaint.id) {
                <tr [class.overdue]="isOverdue(complaint)">
                  <td [attr.data-label]="'complaintsModule.no' | translate">{{ complaint.complaint_no }}<br /><span class="muted">{{ complaint.complainant_name }}</span></td>
                  <td [attr.data-label]="'complaintsModule.subject' | translate">{{ complaint.subject }}<br /><span class="muted">{{ 'complaintsAdmin.assignee' | translate }}: {{ complaint.assigned_admin_name || '—' }}</span></td>
                  <td [attr.data-label]="'complaintsModule.status' | translate">
                    <span class="ds-tag" [attr.data-tone]="statusTone(complaint.status)">{{ 'complaintsModule.statuses.' + complaint.status | translate }}</span>
                  </td>
                  <td [attr.data-label]="'complaintsModule.slaAck' | translate">
                    <span class="ds-badge" [attr.data-tone]="slaTone(complaint.sla_ack)">{{ ('complaintsAdmin.sla.' + complaint.sla_ack.state | translate) + ' (' + complaint.sla_ack.days_remaining + ')' }}</span>
                  </td>
                  <td [attr.data-label]="'complaintsModule.slaUpdate' | translate">
                    <span class="ds-badge" [attr.data-tone]="slaTone(complaint.sla_update)">{{ ('complaintsAdmin.sla.' + complaint.sla_update.state | translate) + ' (' + complaint.sla_update.days_remaining + ')' }}</span>
                  </td>
                  <td [attr.data-label]="'common.actions' | translate">
                    @if (!complaint.acknowledged_at) {
                      <button type="button" class="btn-primary" (click)="acknowledge(complaint)">{{ 'complaintsAdmin.acknowledge' | translate }}</button>
                    }
                    <button type="button" class="btn-secondary" (click)="toggle(complaint.id)">{{ 'complaintsAdmin.work' | translate }}</button>
                    <button type="button" class="btn-secondary" (click)="downloadLetter(complaint)">PDF</button>
                  </td>
                </tr>
                @if (openId() === complaint.id) {
                  <tr class="detail-row">
                    <td colspan="6">
                      <p>{{ complaint.details }}</p>
                      @if (complaint.has_evidence) {
                        <button type="button" class="btn-secondary" (click)="downloadEvidence(complaint)">{{ 'complaintsAdmin.downloadEvidence' | translate }}</button>
                      }
                      <ol class="timeline">
                        @for (event of complaint.timeline; track $index) {
                          <li><strong>{{ 'complaintsModule.events.' + event.event | translate }}</strong> — {{ event.at | date: 'yyyy-MM-dd' }}</li>
                        }
                      </ol>
                      <div class="field">
                        <label for="assignee-{{ complaint.id }}">{{ 'complaintsAdmin.assigneeId' | translate }}</label>
                        <input id="assignee-{{ complaint.id }}" type="number" [(ngModel)]="assigneeIds[complaint.id]" />
                        <button type="button" class="btn-secondary" (click)="assign(complaint)">{{ 'complaintsAdmin.assign' | translate }}</button>
                      </div>
                      <div class="field">
                        <label for="note-{{ complaint.id }}">{{ 'complaintsAdmin.updateNote' | translate }}</label>
                        <textarea id="note-{{ complaint.id }}" rows="2" [(ngModel)]="notes[complaint.id]"></textarea>
                        <button type="button" class="btn-secondary" (click)="update(complaint)">{{ 'complaintsAdmin.sendUpdate' | translate }}</button>
                        <button type="button" class="btn-primary" (click)="resolve(complaint)">{{ 'complaintsAdmin.resolve' | translate }}</button>
                      </div>
                      @if (complaint.status === 'resolved') {
                        <button type="button" class="btn-secondary" (click)="close(complaint)">{{ 'complaintsAdmin.close' | translate }}</button>
                      }
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
      .page-header h1 { display: flex; align-items: center; gap: 0.5rem; }
      .muted { color: var(--gray-600, #667); }
      .field input, .field textarea { max-width: 100%; box-sizing: border-box; }
      .detail-row td { overflow-wrap: anywhere; }
      .data-table button { min-height: 40px; }
      .detail-row td { background: var(--surface-2, #f3efe3); }
      .timeline { margin-left: 1.1rem; }
      tr.overdue td { border-inline-start: 4px solid var(--red-600, #9c3a2c); }
    `,
  ],
})
export class ComplaintsAdminComponent implements OnInit {
  private readonly governance = inject(GovernanceService);

  readonly statusFilters = ['submitted', 'acknowledged', 'investigating', 'resolved', 'closed', 'all'] as const;
  readonly filter = signal<string>('all');
  readonly complaints = signal<Complaint[]>([]);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly openId = signal<number | null>(null);
  assigneeIds: Record<number, number | undefined> = {};
  notes: Record<number, string | undefined> = {};

  ngOnInit(): void {
    this.load();
  }

  load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.loadFailed.set(false);
    this.governance.adminComplaints(this.filter() === 'all' ? undefined : this.filter()).subscribe({
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

  toggle(id: number): void {
    this.openId.set(this.openId() === id ? null : id);
  }

  isOverdue(complaint: Complaint): boolean {
    return (
      complaint.sla_ack.state === 'overdue' ||
      (!complaint.first_update_at && complaint.sla_update.state === 'overdue')
    );
  }

  acknowledge(complaint: Complaint): void {
    this.governance.acknowledgeComplaint(complaint.id).subscribe({ next: () => this.load(true) });
  }

  assign(complaint: Complaint): void {
    const adminId = this.assigneeIds[complaint.id];
    if (!adminId) return;
    this.governance.assignComplaint(complaint.id, adminId).subscribe({ next: () => this.load(true) });
  }

  update(complaint: Complaint): void {
    const note = this.notes[complaint.id];
    if (!note?.trim()) return;
    this.governance.updateComplaint(complaint.id, note).subscribe({ next: () => this.load(true) });
  }

  resolve(complaint: Complaint): void {
    const note = this.notes[complaint.id];
    if (!note?.trim()) return;
    this.governance.resolveComplaint(complaint.id, note).subscribe({ next: () => this.load(true) });
  }

  close(complaint: Complaint): void {
    this.governance.closeComplaint(complaint.id).subscribe({ next: () => this.load(true) });
  }

  downloadLetter(complaint: Complaint): void {
    this.governance.complaintLetter(complaint.id).subscribe((blob) => saveBlob(blob, `${complaint.complaint_no}.pdf`));
  }

  downloadEvidence(complaint: Complaint): void {
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
