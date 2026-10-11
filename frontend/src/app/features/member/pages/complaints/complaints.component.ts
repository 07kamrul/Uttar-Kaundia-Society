import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
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
  selector: 'app-complaints',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, DatePipe, FormsModule, IconComponent, RouterLink],
  template: `
    <div class="page-container">
      <header class="gov-hero">
        <span class="gov-hero-icon"><app-icon name="inbox" [size]="22" /></span>
        <div class="gov-hero-text">
          <h1 class="gov-hero-title">{{ 'complaintsModule.title' | translate }}</h1>
          <p class="gov-hero-sub">{{ 'complaintsModule.subtitle' | translate }}</p>
        </div>
        @if (complaints().length) {
          <div class="gov-hero-side">
            <span class="ds-badge">{{ digits(complaints().length) }}</span>
          </div>
        }
      </header>

      @if (constants(); as c) {
        <div class="gov-notice">
          <app-icon name="shield" [size]="19" />
          <p>{{ c.anti_retaliation_notice }}</p>
        </div>
      }

      <!-- Related channels: land-protection form + emergency help. -->
      <div class="co-tiles">
        <a class="gov-tile" routerLink="/complaints/land-protection">
          <span class="gov-tile-icon"><app-icon name="map" [size]="19" /></span>
          <span class="gov-tile-name">{{ 'complaintsModule.landFormLink' | translate }}</span>
          <span class="gov-tile-hint">{{ 'member.dashboard.tiles.land' | translate }}</span>
        </a>
        <a class="gov-tile" routerLink="/emergency-help">
          <span class="gov-tile-icon"><app-icon name="alert" [size]="19" /></span>
          <span class="gov-tile-name">{{ 'complaintsModule.emergencyLink' | translate }}</span>
          <span class="gov-tile-hint">{{ 'member.dashboard.tiles.emergency' | translate }}</span>
        </a>
      </div>

      <section class="ds-card">
        <div class="ds-card-header">
          <span class="ds-card-icon"><app-icon name="doc" [size]="18" /></span>
          <div class="ds-card-heading">
            <h2 class="ds-card-title">{{ 'complaintsModule.new.title' | translate }}</h2>
          </div>
        </div>
        <div class="ds-card-body">
          <form (ngSubmit)="submitComplaint()" #form="ngForm">
            <div class="field">
              <label for="category">{{ 'complaintsModule.new.category' | translate }}</label>
              <select id="category" class="field-control" name="category" [(ngModel)]="category" required>
                @for (cat of constants()?.categories ?? []; track cat.key) {
                  <option [value]="cat.key">{{ cat.bn }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label for="subject">{{ 'complaintsModule.new.subject' | translate }}</label>
              <input id="subject" class="field-control" name="subject" [(ngModel)]="subject" required />
            </div>
            <div class="field">
              <label for="details">{{ 'complaintsModule.new.details' | translate }}</label>
              <textarea id="details" class="field-control" name="details" rows="4" [(ngModel)]="details" required></textarea>
            </div>
            @if (formError()) { <p class="field-error">{{ formError() | translate }}</p> }
            @if (formSuccess()) {
              <p class="gov-success"><app-icon name="check-circle" [size]="16" /> {{ 'complaintsModule.new.success' | translate }}</p>
            }
            <div class="form-actions">
              <button class="btn btn-primary" type="submit" [disabled]="form.invalid || submitting()">
                {{ 'complaintsModule.new.submit' | translate }}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section class="ds-card">
        <div class="ds-card-header">
          <span class="ds-card-icon"><app-icon name="inbox" [size]="18" /></span>
          <div class="ds-card-heading">
            <h2 class="ds-card-title">{{ 'complaintsModule.myComplaints' | translate }}</h2>
          </div>
        </div>
        <div class="ds-card-body">
          @if (loading()) {
            <div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-line"></div>
          } @else if (complaints().length === 0) {
            <div class="gov-empty">
              <span class="gov-empty-icon"><app-icon name="inbox" [size]="22" /></span>
              <p>{{ 'complaintsModule.empty' | translate }}</p>
            </div>
          } @else {
            <div class="data-table data-table-cards">
              <table>
                <tbody>
                  @for (complaint of complaints(); track complaint.id) {
                    <tr (click)="toggle(complaint.id)" class="co-row">
                      <td [attr.data-label]="'complaintsModule.no' | translate"><span class="ds-mono">{{ complaint.complaint_no }}</span></td>
                      <td [attr.data-label]="'complaintsModule.subject' | translate">
                        {{ complaint.subject }}
                        <app-icon class="co-chevron" [name]="openId() === complaint.id ? 'chevron-down' : 'chevron-right'" [size]="15" />
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
                    </tr>
                    @if (openId() === complaint.id) {
                      <tr class="detail-row">
                        <td colspan="5">
                          <p class="co-details">{{ complaint.details }}</p>
                          @if (complaint.resolution_note) {
                            <p class="co-resolution"><strong>{{ 'complaintsModule.resolution' | translate }}:</strong> {{ complaint.resolution_note }}</p>
                          }
                          <ol class="gov-timeline">
                            @for (event of complaint.timeline; track $index) {
                              <li><strong>{{ 'complaintsModule.events.' + event.event | translate }}</strong> — {{ event.at | date: 'yyyy-MM-dd' }}</li>
                            }
                          </ol>
                          @if (complaint.is_land_protection) {
                            <button type="button" class="btn btn-secondary btn-sm" (click)="downloadLandForm(complaint, $event)">
                              <span class="co-btn-icon"><app-icon name="download" [size]="15" /></span>
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
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .co-tiles {
        display: grid;
        gap: 0.75rem;
        grid-template-columns: 1fr;
        margin-bottom: 0.25rem;
      }
      @media (min-width: 640px) {
        .co-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      .co-row { cursor: pointer; }
      .co-chevron { color: var(--gray-400); vertical-align: -2px; }
      .detail-row td { background: var(--gray-50); }
      .co-details { margin: 0 0 0.5rem; font-size: 0.88rem; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
      .co-resolution { margin: 0; font-size: 0.88rem; color: var(--emerald-800); }
      .co-btn-icon { display: inline-flex; vertical-align: -3px; margin-inline-end: 0.3rem; }
    `,
  ],
})
export class ComplaintsComponent implements OnInit {
  private readonly governance = inject(GovernanceService);
  private readonly language = inject(LanguageService);
  readonly lang = this.language.lang;

  readonly constants = signal<ComplaintConstants | null>(null);
  readonly complaints = signal<Complaint[]>([]);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly openId = signal<number | null>(null);
  readonly formError = signal('');
  readonly formSuccess = signal(false);

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
    this.formSuccess.set(false);
    this.governance
      .createComplaint({ category: this.category, subject: this.subject, details: this.details })
      .subscribe({
        next: () => {
          this.subject = '';
          this.details = '';
          this.submitting.set(false);
          this.formSuccess.set(true);
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

  digits(value: number | string): string {
    return localizeDigits(value, this.lang());
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
