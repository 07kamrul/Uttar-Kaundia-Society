import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import {
  Complaint,
  ComplaintConstants,
  GovernanceService,
  SlaInfo,
} from '../../../../core/services/governance.service';

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
  selector: 'app-complaints',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, DatePipe, FormsModule, IconComponent],
  template: `
    <div class="page-container">
      <header class="page-header">
        <h1><app-icon name="inbox" /> {{ 'complaintsModule.title' | translate }}</h1>
        <p class="muted">{{ 'complaintsModule.subtitle' | translate }}</p>
      </header>

      @if (constants(); as c) {
        <div class="card notice-card">
          <app-icon name="shield" />
          <p>{{ c.anti_retaliation_notice }}</p>
        </div>
      }

      <div class="actions-row">
        <a class="btn-secondary" routerLink="/complaints/land-protection">{{ 'complaintsModule.landFormLink' | translate }}</a>
        <a class="btn-secondary" routerLink="/emergency-help">{{ 'complaintsModule.emergencyLink' | translate }}</a>
      </div>

      <section class="card">
        <h2>{{ 'complaintsModule.new.title' | translate }}</h2>
        <form (ngSubmit)="submitComplaint()" #form="ngForm">
          <div class="field">
            <label for="category">{{ 'complaintsModule.new.category' | translate }}</label>
            <select id="category" name="category" [(ngModel)]="category" required>
              @for (cat of constants()?.categories ?? []; track cat.key) {
                <option [value]="cat.key">{{ cat.bn }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="subject">{{ 'complaintsModule.new.subject' | translate }}</label>
            <input id="subject" name="subject" [(ngModel)]="subject" required />
          </div>
          <div class="field">
            <label for="details">{{ 'complaintsModule.new.details' | translate }}</label>
            <textarea id="details" name="details" rows="4" [(ngModel)]="details" required></textarea>
          </div>
          @if (formError()) { <p class="field-error">{{ formError() | translate }}</p> }
          <button class="btn-primary" type="submit" [disabled]="form.invalid || submitting()">
            {{ 'complaintsModule.new.submit' | translate }}
          </button>
        </form>
      </section>

      <section class="card">
        <h2>{{ 'complaintsModule.myComplaints' | translate }}</h2>
        @if (loading()) {
          <div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-line"></div>
        } @else if (complaints().length === 0) {
          <div class="ds-empty">{{ 'complaintsModule.empty' | translate }}</div>
        } @else {
          <div class="data-table data-table-cards">
            <table>
              <tbody>
                @for (complaint of complaints(); track complaint.id) {
                  <tr (click)="toggle(complaint.id)" class="clickable">
                    <td [attr.data-label]="'complaintsModule.no' | translate">{{ complaint.complaint_no }}</td>
                    <td [attr.data-label]="'complaintsModule.subject' | translate">{{ complaint.subject }}</td>
                    <td [attr.data-label]="'complaintsModule.status' | translate">
                      <span class="ds-tag" [attr.data-tone]="statusTone(complaint.status)">{{ 'complaintsModule.statuses.' + complaint.status | translate }}</span>
                    </td>
                    <td [attr.data-label]="'complaintsModule.slaAck' | translate">
                      <span class="ds-badge" [attr.data-tone]="slaTone(complaint.sla_ack)">{{ ('complaintsAdmin.sla.' + complaint.sla_ack.state | translate) + ' (' + complaint.sla_ack.days_remaining + ')' }}</span>
                    </td>
                    <td [attr.data-label]="'complaintsModule.slaUpdate' | translate">
                      <span class="ds-badge" [attr.data-tone]="slaTone(complaint.sla_update)">{{ ('complaintsAdmin.sla.' + complaint.sla_update.state | translate) + ' (' + complaint.sla_update.days_remaining + ')' }}</span>
                    </td>
                  </tr>
                  @if (openId() === complaint.id) {
                    <tr class="detail-row">
                      <td colspan="5">
                        <p>{{ complaint.details }}</p>
                        @if (complaint.resolution_note) {
                          <p><strong>{{ 'complaintsModule.resolution' | translate }}:</strong> {{ complaint.resolution_note }}</p>
                        }
                        <ol class="timeline">
                          @for (event of complaint.timeline; track $index) {
                            <li><strong>{{ 'complaintsModule.events.' + event.event | translate }}</strong> — {{ event.at | date: 'yyyy-MM-dd' }}</li>
                          }
                        </ol>
                        @if (complaint.is_land_protection) {
                          <button type="button" class="btn-secondary" (click)="downloadLandForm(complaint, $event)">
                            {{ 'complaintsModule.downloadFormCopy' | translate }}
                          </button>
                        }
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .page-header h1 { display: flex; align-items: center; gap: 0.5rem; }
      .muted { color: var(--gray-600, #667); }
      .notice-card { display: flex; gap: 0.75rem; align-items: flex-start; border-inline-start: 4px solid var(--gold, #c9a34c); }
      .actions-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .clickable { cursor: pointer; }
      .detail-row td { background: var(--surface-2, #f3efe3); }
      .timeline { margin: 0.5rem 0 0 1.1rem; padding: 0; }
    `,
  ],
})
export class ComplaintsComponent implements OnInit {
  private readonly governance = inject(GovernanceService);

  readonly constants = signal<ComplaintConstants | null>(null);
  readonly complaints = signal<Complaint[]>([]);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly openId = signal<number | null>(null);
  readonly formError = signal('');

  category = 'service';
  subject = '';
  details = '';

  ngOnInit(): void {
    this.governance.complaintConstants().subscribe({ next: (c) => this.constants.set(c) });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.governance.myComplaints().subscribe({
      next: (rows) => {
        this.complaints.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  toggle(id: number): void {
    this.openId.set(this.openId() === id ? null : id);
  }

  submitComplaint(): void {
    this.submitting.set(true);
    this.formError.set('');
    this.governance
      .createComplaint({ category: this.category, subject: this.subject, details: this.details })
      .subscribe({
        next: () => {
          this.subject = '';
          this.details = '';
          this.submitting.set(false);
          this.load();
        },
        error: () => {
          this.formError.set('common.saveFailed');
          this.submitting.set(false);
        },
      });
  }

  downloadLandForm(complaint: Complaint, event: Event): void {
    event.stopPropagation();
    this.governance.landFormPdf(complaint.id).subscribe((blob) => saveBlob(blob, `${complaint.complaint_no}.pdf`));
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
