import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import {
  GovernanceService,
  MembershipApplication,
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
  selector: 'app-membership-review',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, DatePipe, FormsModule, IconComponent],
  template: `
    <div class="page-container">
      <header class="page-header">
        <h1><app-icon name="id-card" /> {{ 'membershipReview.title' | translate }}</h1>
      </header>

      <div class="filters">
        @for (option of statusFilters; track option) {
          <button type="button" class="tab" [class.active]="filter() === option" (click)="filter.set(option); load()">
            {{ 'membershipReview.filters.' + option | translate }}
          </button>
        }
      </div>

      @if (loading()) {
        <div class="card"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-line"></div></div>
      } @else if (applications().length === 0) {
        <div class="card"><div class="ds-empty">{{ 'membershipReview.empty' | translate }}</div></div>
      } @else {
        <div class="data-table data-table-cards">
          <table>
            <thead>
              <tr>
                <th>{{ 'membershipReview.no' | translate }}</th>
                <th>{{ 'membershipReview.applicant' | translate }}</th>
                <th>{{ 'membershipReview.status' | translate }}</th>
                <th>{{ 'membershipReview.sla' | translate }}</th>
                <th>{{ 'common.actions' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (app of applications(); track app.id) {
                <tr [class.overdue]="app.sla.state === 'overdue' && app.status !== 'approved' && app.status !== 'rejected'">
                  <td [attr.data-label]="'membershipReview.no' | translate">{{ app.application_no }}</td>
                  <td [attr.data-label]="'membershipReview.applicant' | translate">{{ app.full_name }}<br /><span class="muted">{{ app.mobile }}</span></td>
                  <td [attr.data-label]="'membershipReview.status' | translate">
                    <span class="ds-tag" [attr.data-tone]="statusTone(app.status)">{{ 'membershipGov.statuses.' + app.status | translate }}</span>
                  </td>
                  <td [attr.data-label]="'membershipReview.sla' | translate">
                    <span class="ds-badge" [attr.data-tone]="slaTone(app.sla)">{{ ('complaintsAdmin.sla.' + app.sla.state | translate) + ' (' + app.sla.days_remaining + ')' }}</span>
                  </td>
                  <td [attr.data-label]="'common.actions' | translate">
                    <button type="button" class="btn-secondary" (click)="toggleDetail(app.id)">{{ 'membershipReview.details' | translate }}</button>
                  </td>
                </tr>
                @if (openId() === app.id) {
                  <tr class="detail-row">
                    <td colspan="5">
                      <p><strong>{{ 'membershipReview.father' | translate }}:</strong> {{ app.father_name }} · <strong>{{ 'membershipReview.mother' | translate }}:</strong> {{ app.mother_name }}</p>
                      <p><strong>{{ 'membershipReview.email' | translate }}:</strong> {{ app.email }} · <strong>{{ 'membershipReview.ownership' | translate }}:</strong> {{ app.ownership_type }}</p>
                      <p>{{ app.address_house }} {{ app.address_post_office }} {{ app.address_upazila }} {{ app.address_district }} {{ app.address_division }}</p>
                      <ol class="timeline">
                        @for (event of app.timeline; track $index) {
                          <li><strong>{{ 'membershipGov.events.' + event.event | translate }}</strong> — {{ event.at | date: 'yyyy-MM-dd' }} @if (event.actor) { ({{ event.actor }}) }</li>
                        }
                      </ol>
                      <div class="action-row">
                        @if (app.status === 'received') {
                          <button type="button" class="btn-secondary" (click)="startReview(app)">{{ 'membershipReview.startReview' | translate }}</button>
                        }
                        @if (app.status === 'under_review') {
                          <button type="button" class="btn-primary" (click)="approve(app)">{{ 'membershipReview.approve' | translate }}</button>
                        }
                        @if (app.status === 'received' || app.status === 'under_review') {
                          <button type="button" class="btn-danger" (click)="rejectingId.set(app.id)">{{ 'membershipReview.reject' | translate }}</button>
                        }
                        <button type="button" class="btn-secondary" (click)="downloadLetter(app)">{{ 'membershipReview.pdf' | translate }}</button>
                      </div>
                      @if (rejectingId() === app.id) {
                        <div class="field">
                          <label for="reject-reason-{{ app.id }}">{{ 'membershipReview.rejectReason' | translate }}</label>
                          <textarea id="reject-reason-{{ app.id }}" rows="2" [(ngModel)]="rejectReason"></textarea>
                          <button type="button" class="btn-danger" (click)="reject(app)">{{ 'membershipReview.confirmReject' | translate }}</button>
                        </div>
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
      .filters { display: flex; gap: 0.25rem; flex-wrap: wrap; }
      .tab { border: none; background: transparent; padding: 0.4rem 0.8rem; border-radius: 999px; cursor: pointer; color: var(--gray-800, #1a2a20); }
      .tab.active { background: var(--emerald-600, #2e5138); color: #fff; }
      .detail-row td { background: var(--surface-2, #f3efe3); }
      .action-row { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
      .timeline { margin-left: 1.1rem; }
      tr.overdue td { border-inline-start: 4px solid var(--red-600, #9c3a2c); }
    `,
  ],
})
export class MembershipReviewComponent implements OnInit {
  private readonly governance = inject(GovernanceService);

  readonly statusFilters = ['received', 'under_review', 'approved', 'rejected', 'all'] as const;
  readonly filter = signal<string>('all');
  readonly applications = signal<MembershipApplication[]>([]);
  readonly loading = signal(true);
  readonly openId = signal<number | null>(null);
  readonly rejectingId = signal<number | null>(null);
  rejectReason = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.governance.adminApplications(this.filter() === 'all' ? undefined : this.filter()).subscribe({
      next: (rows) => {
        this.applications.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  toggleDetail(id: number): void {
    this.openId.set(this.openId() === id ? null : id);
    this.rejectingId.set(null);
  }

  startReview(app: MembershipApplication): void {
    this.governance.startReview(app.id).subscribe({ next: () => this.load() });
  }

  approve(app: MembershipApplication): void {
    this.governance.approveApplication(app.id, 'general').subscribe({ next: () => this.load() });
  }

  reject(app: MembershipApplication): void {
    if (!this.rejectReason.trim()) return;
    this.governance.rejectApplication(app.id, this.rejectReason).subscribe({
      next: () => {
        this.rejectReason = '';
        this.rejectingId.set(null);
        this.load();
      },
    });
  }

  downloadLetter(app: MembershipApplication): void {
    this.governance.applicationLetter(app.id).subscribe((blob) => saveBlob(blob, `${app.application_no}.pdf`));
  }

  statusTone(status: string): string {
    if (status === 'approved') return 'good';
    if (status === 'rejected') return 'bad';
    if (status === 'under_review') return 'warn';
    return 'neutral';
  }

  slaTone(sla: SlaInfo): string {
    if (sla.state === 'met') return 'good';
    if (sla.state === 'overdue') return 'bad';
    if (sla.state === 'due_soon') return 'warn';
    return 'neutral';
  }
}
