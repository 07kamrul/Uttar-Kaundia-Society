import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { AdminService } from '../../../../core/services/admin.service';
import {
  FundControlsService,
  type AuditReport,
  type AuditReminder,
  type BankSignatory,
  type FundControlsSettings,
  type WelfareFundRequest,
  type WelfareRequestStatus,
} from '../../../../core/services/fund-controls.service';
import { formatTaka } from '../../../../core/services/finance.service';
import {
  MemberPickerComponent,
  type MemberPickerOption,
} from '../../../../shared/member-picker/member-picker.component';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { DatePickerComponent } from '../../../../shared/date-picker/date-picker.component';

type Section = 'income-policy' | 'threshold' | 'signatories' | 'audit' | 'welfare';

@Component({
  selector: 'app-fund-controls',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, DatePipe, IconComponent, DatePickerComponent, MemberPickerComponent],
  template: `
    <div class="fc-page">
      <div class="page-header">
        <div>
          <h1 class="page-title"><app-icon name="shield" [size]="22" /> {{ 'fundControls.title' | translate }}</h1>
          <p class="page-subtitle">{{ 'fundControls.subtitle' | translate }}</p>
        </div>
      </div>

      @if (error()) {
        <div class="card card-pad error-box" role="alert">{{ error() }}</div>
      }

      <!-- Audit reminder card: June window / missing FY report -->
      @if (canAudit && reminder(); as reminder) {
        @if (reminder.reminderWindowActive) {
          <div class="card card-pad fc-reminder" role="status">
            <app-icon name="alert" [size]="20" />
            <div>
              <strong>{{ 'fundControls.auditReminder.title' | translate: { fy: reminder.fiscalYear } }}</strong>
              <p>{{ 'fundControls.auditReminder.body' | translate }}</p>
            </div>
          </div>
        }
      }

      <!-- Section tabs -->
      <div class="fc-tabs" role="tablist">
        @for (tab of visibleTabs(); track tab) {
          <button type="button" class="filter-chip" [class.filter-chip-active]="section() === tab"
                  (click)="section.set(tab)">
            {{ 'fundControls.tabs.' + tab | translate }}
          </button>
        }
      </div>

      <!-- Income-source policy -->
      @if (section() === 'income-policy') {
        <section class="card card-pad">
          <h2 class="fc-section-title">{{ 'fundControls.incomePolicy.title' | translate }}</h2>
          <p class="field-hint">{{ 'fundControls.incomePolicy.hint' | translate }}</p>
          <ul class="fc-source-list">
            @for (source of settings()?.incomeSources ?? []; track source.key) {
              <li>
                <span class="ds-tag ds-tag-blue">{{ lang() === 'bn' ? source.bn : source.en }}</span>
                @if (source.requires_justification) {
                  <span class="ds-tag ds-tag-amber">{{ 'fundControls.incomePolicy.needsJustification' | translate }}</span>
                }
                <code class="fc-source-key">{{ source.key }}</code>
              </li>
            }
          </ul>
          <div class="fc-policy-note">
            <p>{{ 'fundControls.incomePolicy.foreignTitle' | translate }}</p>
            <p class="field-hint">{{ 'fundControls.incomePolicy.foreignBody' | translate }}</p>
          </div>
        </section>
      }

      <!-- Two-person threshold -->
      @if (section() === 'threshold' && canFund) {
        <section class="card card-pad">
          <h2 class="fc-section-title">{{ 'fundControls.threshold.title' | translate }}</h2>
          <p class="field-hint">{{ 'fundControls.threshold.hint' | translate }}</p>
          @if (settings(); as s) {
            <p class="fc-threshold-value">
              {{ taka(s.expenseTwoPersonThreshold) }}
              @if (s.thresholdIsDefault) {
                <span class="ds-tag">{{ 'fundControls.threshold.defaultTag' | translate }}</span>
              }
            </p>
            <form (ngSubmit)="saveThreshold()" class="fc-inline-form">
              <div class="field">
                <label for="fc-threshold">{{ 'fundControls.threshold.newValue' | translate }}</label>
                <input id="fc-threshold" class="field-control" type="number" min="1"
                       [(ngModel)]="thresholdInput" name="thresholdInput" required />
              </div>
              <button type="submit" class="btn btn-primary" [disabled]="thresholdSaving || !thresholdInput">
                {{ 'fundControls.threshold.save' | translate }}
              </button>
              @if (thresholdSaved) {
                <span class="fc-saved">{{ 'fundControls.threshold.saved' | translate }}</span>
              }
              @if (thresholdError) {
                <p class="field-error">{{ thresholdError }}</p>
              }
            </form>
          }
        </section>
      }

      <!-- Bank signatories -->
      @if (section() === 'signatories' && canSignatory) {
        <section class="card card-pad">
          <div class="fc-section-head">
            <h2 class="fc-section-title">{{ 'fundControls.signatories.title' | translate }}</h2>
            <div class="fc-section-actions">
              <button type="button" class="btn btn-secondary" (click)="downloadBankLetter()" [disabled]="letterBusy">
                {{ 'fundControls.signatories.bankLetter' | translate }}
              </button>
              <button type="button" class="btn btn-primary" (click)="openSignatoryForm()">
                {{ 'fundControls.signatories.add' | translate }}
              </button>
            </div>
          </div>
          @if (signatories().length === 0) {
            <div class="ds-empty">{{ 'fundControls.signatories.empty' | translate }}</div>
          } @else {
            <div class="data-table-wrap">
              <table class="data-table data-table-cards">
                <thead>
                  <tr>
                    <th>{{ 'fundControls.signatories.member' | translate }}</th>
                    <th>{{ 'fundControls.signatories.bank' | translate }}</th>
                    <th>{{ 'fundControls.signatories.account' | translate }}</th>
                    <th>{{ 'fundControls.signatories.validity' | translate }}</th>
                    <th>{{ 'common.actions' | translate }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of signatories(); track row.id) {
                    <tr>
                      <td [attr.data-label]="'fundControls.signatories.member' | translate">
                        {{ row.memberName || '—' }}
                        @if (row.committeePostBn) {
                          <span class="ds-tag ds-tag-green">{{ row.committeePostBn }}</span>
                        }
                      </td>
                      <td [attr.data-label]="'fundControls.signatories.bank' | translate">
                        {{ row.bankName }} — {{ row.branch }}
                      </td>
                      <td [attr.data-label]="'fundControls.signatories.account' | translate">
                        {{ row.accountName }}<br /><code>****{{ row.accountNumberMasked }}</code>
                      </td>
                      <td [attr.data-label]="'fundControls.signatories.validity' | translate">
                        {{ row.validFrom }} → {{ row.validTo || '—' }}
                        @if (!row.isActive) {
                          <span class="ds-tag ds-tag-amber">{{ 'fundControls.signatories.inactive' | translate }}</span>
                        }
                      </td>
                      <td [attr.data-label]="'common.actions' | translate">
                        <button type="button" class="btn btn-secondary btn-sm" (click)="openSignatoryForm(row)">
                          {{ 'common.edit' | translate }}
                        </button>
                        @if (row.isActive) {
                          <button type="button" class="btn btn-danger btn-sm" (click)="askDeactivate(row)">
                            {{ 'common.delete' | translate }}
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }

      <!-- Audit reports -->
      @if (section() === 'audit' && canAudit) {
        <section class="card card-pad">
          <h2 class="fc-section-title">{{ 'auditReports.uploadTitle' | translate }}</h2>
          <form (ngSubmit)="uploadReport()" class="fc-grid-form">
            <div class="field">
              <label for="fc-fy">{{ 'auditReports.fiscalYear' | translate }}</label>
              <input id="fc-fy" class="field-control" name="fiscalYear" [(ngModel)]="fyInput"
                     placeholder="2025-26" pattern="\\d{4}-\\d{2}" required />
            </div>
            <div class="field">
              <label for="fc-report-date">{{ 'auditReports.reportDate' | translate }}</label>
              <app-date-picker id="fc-report-date" name="reportDate" [(ngModel)]="reportDateInput" required></app-date-picker>
            </div>
            <div class="field">
              <label for="fc-file">{{ 'auditReports.file' | translate }}</label>
              <input id="fc-file" class="field-control" type="file" accept=".pdf,.jpg,.jpeg,.png"
                     (change)="onReportFile($event)" />
            </div>
            <div class="field fc-full">
              <label for="fc-summary">{{ 'auditReports.summary' | translate }}</label>
              <textarea id="fc-summary" class="field-control" rows="3" name="summaryInput"
                        [(ngModel)]="summaryInput"></textarea>
            </div>
            <div class="fc-full">
              <button type="submit" class="btn btn-primary" [disabled]="reportBusy || !fyInput || !reportDateInput || !reportFile">
                {{ 'auditReports.upload' | translate }}
              </button>
              @if (reportError) {
                <p class="field-error">{{ reportError }}</p>
              }
            </div>
          </form>
        </section>

        <section class="card card-pad">
          <h2 class="fc-section-title">{{ 'auditReports.listTitle' | translate }}</h2>
          @if (reports().length === 0) {
            <div class="ds-empty">{{ 'auditReports.empty' | translate }}</div>
          }
          @for (report of reports(); track report.id) {
            <article class="fc-report">
              <div class="fc-report-head">
                <strong>{{ 'auditReports.fyLabel' | translate: { fy: report.fiscalYear } }}</strong>
                <span class="ds-tag">{{ report.reportDate }}</span>
                @if (report.publishedNoticeId) {
                  <span class="ds-tag ds-tag-green">{{ 'auditReports.published' | translate }}</span>
                } @else {
                  <span class="ds-tag ds-tag-amber">{{ 'auditReports.unpublished' | translate }}</span>
                }
              </div>
              @if (editingSummaryId === report.id) {
                <textarea class="field-control" rows="4" [(ngModel)]="editingSummaryText"></textarea>
                <div class="fc-row-actions">
                  <button type="button" class="btn btn-primary btn-sm" (click)="saveSummary(report)" [disabled]="reportBusy">
                    {{ 'common.save' | translate }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" (click)="editingSummaryId = null">
                    {{ 'common.cancel' | translate }}
                  </button>
                </div>
              } @else {
                <p class="fc-report-summary">{{ report.summaryText || ('auditReports.noSummary' | translate) }}</p>
              }
              <div class="fc-row-actions">
                @if (editingSummaryId !== report.id) {
                  <button type="button" class="btn btn-secondary btn-sm" (click)="startEditSummary(report)">
                    {{ 'auditReports.editSummary' | translate }}
                  </button>
                }
                @if (report.hasFile) {
                  <button type="button" class="btn btn-secondary btn-sm" (click)="downloadReport(report)">
                    {{ 'auditReports.download' | translate }}
                  </button>
                }
                @if (!report.publishedNoticeId) {
                  <button type="button" class="btn btn-primary btn-sm" (click)="publishReport(report)" [disabled]="reportBusy">
                    {{ 'auditReports.publish' | translate }}
                  </button>
                }
              </div>
            </article>
          }
        </section>
      }

      <!-- Welfare fund queue -->
      @if (section() === 'welfare' && canWelfareReview) {
        <section class="card card-pad">
          <div class="fc-section-head">
            <h2 class="fc-section-title">{{ 'welfareFund.adminTitle' | translate }}</h2>
            <select class="field-control" [(ngModel)]="welfareStatusFilter" (ngModelChange)="loadWelfare()">
              <option value="">{{ 'welfareFund.status.all' | translate }}</option>
              @for (status of welfareStatuses; track status) {
                <option [value]="status">{{ 'welfareFund.status.' + status | translate }}</option>
              }
            </select>
          </div>
          <p class="field-hint">{{ 'welfareFund.noAutoApproval' | translate }}</p>
          @if (welfareRequests().length === 0) {
            <div class="ds-empty">{{ 'welfareFund.empty' | translate }}</div>
          } @else {
            <div class="data-table-wrap">
              <table class="data-table data-table-cards">
                <thead>
                  <tr>
                    <th>{{ 'welfareFund.requestNo' | translate }}</th>
                    <th>{{ 'welfareFund.member' | translate }}</th>
                    <th>{{ 'welfareFund.type' | translate }}</th>
                    <th>{{ 'welfareFund.amount' | translate }}</th>
                    <th>{{ 'welfareFund.status.label' | translate }}</th>
                    <th>{{ 'common.actions' | translate }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of welfareRequests(); track row.id) {
                    <tr>
                      <td [attr.data-label]="'welfareFund.requestNo' | translate">{{ row.requestNo }}</td>
                      <td [attr.data-label]="'welfareFund.member' | translate">{{ row.memberName || '—' }}</td>
                      <td [attr.data-label]="'welfareFund.type' | translate">{{ 'welfareFund.types.' + row.requestType | translate }}</td>
                      <td [attr.data-label]="'welfareFund.amount' | translate">{{ taka(row.amountRequested) }}</td>
                      <td [attr.data-label]="'welfareFund.status.label' | translate">
                        <span class="ds-tag" [class.ds-tag-blue]="row.status === 'submitted' || row.status === 'under_review'"
                              [class.ds-tag-green]="row.status === 'approved' || row.status === 'disbursed'"
                              [class.ds-tag-amber]="row.status === 'rejected'">
                          {{ 'welfareFund.status.' + row.status | translate }}
                        </span>
                      </td>
                      <td [attr.data-label]="'common.actions' | translate">
                        @if (row.status === 'submitted') {
                          <button type="button" class="btn btn-secondary btn-sm" (click)="startReview(row)">
                            {{ 'welfareFund.startReview' | translate }}
                          </button>
                        }
                        @if (row.status === 'submitted' || row.status === 'under_review') {
                          <button type="button" class="btn btn-primary btn-sm" (click)="openDecide(row)">
                            {{ 'welfareFund.decide' | translate }}
                          </button>
                        }
                        @if (row.status === 'approved') {
                          <button type="button" class="btn btn-primary btn-sm" (click)="disburse(row)">
                            {{ 'welfareFund.disburse' | translate }}
                          </button>
                        }
                        <button type="button" class="btn btn-secondary btn-sm" (click)="showReason(row)">
                          {{ 'welfareFund.reason' | translate }}
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }

      <!-- Signatory add/edit modal -->
      @if (signatoryModalOpen) {
        <div class="modal-backdrop" (click)="closeSignatoryForm()">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <h3>{{ editingSignatory ? ('fundControls.signatories.editTitle' | translate) : ('fundControls.signatories.addTitle' | translate) }}</h3>
            <form (ngSubmit)="saveSignatory()">
              @if (!editingSignatory) {
                <div class="field">
                  <label>{{ 'fundControls.signatories.member' | translate }}</label>
                  <app-member-picker [options]="memberOptions()" [multiple]="false"
                                     (selectionChange)="onSignatoryMemberChange($event)"></app-member-picker>
                </div>
              }
              <div class="field">
                <label for="fc-bank">{{ 'fundControls.signatories.bank' | translate }}</label>
                <input id="fc-bank" class="field-control" name="bankName" [(ngModel)]="sgBank" required />
              </div>
              <div class="field">
                <label for="fc-branch">{{ 'fundControls.signatories.branch' | translate }}</label>
                <input id="fc-branch" class="field-control" name="branch" [(ngModel)]="sgBranch" required />
              </div>
              <div class="field">
                <label for="fc-account-name">{{ 'fundControls.signatories.accountName' | translate }}</label>
                <input id="fc-account-name" class="field-control" name="accountName" [(ngModel)]="sgAccountName" required />
              </div>
              <div class="field">
                <label for="fc-last4">{{ 'fundControls.signatories.last4' | translate }}</label>
                <input id="fc-last4" class="field-control" name="last4" [(ngModel)]="sgLast4"
                       maxlength="4" pattern="\\d{4}" required />
                <p class="field-hint">{{ 'fundControls.signatories.last4Hint' | translate }}</p>
              </div>
              <div class="field">
                <label for="fc-scope">{{ 'fundControls.signatories.scope' | translate }}</label>
                <input id="fc-scope" class="field-control" name="scope" [(ngModel)]="sgScope" />
              </div>
              <div class="field">
                <label for="fc-term">{{ 'fundControls.signatories.termId' | translate }}</label>
                <input id="fc-term" class="field-control" type="number" name="termId" [(ngModel)]="sgTermId" />
              </div>
              <div class="field">
                <label for="fc-valid-from">{{ 'fundControls.signatories.validFrom' | translate }}</label>
                <app-date-picker id="fc-valid-from" name="validFrom" [(ngModel)]="sgValidFrom" required></app-date-picker>
              </div>
              <div class="field">
                <label for="fc-valid-to">{{ 'fundControls.signatories.validTo' | translate }}</label>
                <app-date-picker id="fc-valid-to" name="validTo" [(ngModel)]="sgValidTo"></app-date-picker>
              </div>
              @if (sgError) {
                <p class="field-error">{{ sgError }}</p>
              }
              <div class="fc-row-actions">
                <button type="submit" class="btn btn-primary" [disabled]="sgBusy">
                  {{ 'common.save' | translate }}
                </button>
                <button type="button" class="btn btn-secondary" (click)="closeSignatoryForm()">
                  {{ 'common.cancel' | translate }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Welfare decide modal -->
      @if (decideTarget; as target) {
        <div class="modal-backdrop" (click)="closeDecide()">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <h3>{{ 'welfareFund.decideTitle' | translate: { no: target.requestNo } }}</h3>
            <p class="field-hint">
              {{ 'welfareFund.decideRequested' | translate: { amount: taka(target.amountRequested) } }}
            </p>
            <div class="field">
              <label for="fc-decision">{{ 'welfareFund.decision' | translate }}</label>
              <select id="fc-decision" class="field-control" [(ngModel)]="decisionKind">
                <option value="approved">{{ 'welfareFund.status.approved' | translate }}</option>
                <option value="rejected">{{ 'welfareFund.status.rejected' | translate }}</option>
              </select>
            </div>
            @if (decisionKind === 'approved') {
              <div class="field">
                <label for="fc-approved-amount">{{ 'welfareFund.approvedAmount' | translate }}</label>
                <input id="fc-approved-amount" class="field-control" type="number" min="1"
                       [(ngModel)]="approvedAmount" name="approvedAmount" [max]="target.amountRequested" />
              </div>
            }
            <div class="field">
              <label for="fc-reason">{{ 'welfareFund.committeeReason' | translate }}</label>
              <textarea id="fc-reason" class="field-control" rows="3" [(ngModel)]="decisionReason"></textarea>
            </div>
            @if (decisionError) {
              <p class="field-error">{{ decisionError }}</p>
            }
            <div class="fc-row-actions">
              <button type="button" class="btn btn-primary" (click)="confirmDecide()" [disabled]="decideBusy">
                {{ 'common.save' | translate }}
              </button>
              <button type="button" class="btn btn-secondary" (click)="closeDecide()">
                {{ 'common.cancel' | translate }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Read-only committee reason dialog -->
      @if (reasonView; as row) {
        <div class="modal-backdrop" (click)="reasonView = null">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <h3>{{ row.requestNo }}</h3>
            <p><strong>{{ 'welfareFund.reason' | translate }}:</strong></p>
            <p>{{ row.committeeReason || ('welfareFund.noReasonYet' | translate) }}</p>
            <p><strong>{{ 'welfareFund.requestedReason' | translate }}:</strong></p>
            <p>{{ row.reason }}</p>
            <button type="button" class="btn btn-secondary" (click)="reasonView = null">
              {{ 'common.close' | translate }}
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .fc-page { display: grid; gap: 1rem; }
      .fc-tabs { display: flex; flex-wrap: wrap; gap: 0.4rem; }
      .fc-section-title { font-size: 1.05rem; font-weight: 700; margin: 0 0 0.5rem; }
      .fc-section-head { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
      .fc-section-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .fc-source-list { display: grid; gap: 0.4rem; margin: 0.5rem 0; padding: 0; list-style: none; }
      .fc-source-list li { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .fc-source-key { color: var(--gray-500); font-size: 0.78rem; }
      .fc-policy-note { border-inline-start: 3px solid var(--emerald-600, #2e5138); padding-inline-start: 0.75rem; }
      .fc-policy-note p { margin: 0.2rem 0; }
      .fc-threshold-value { font-size: 1.4rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; }
      .fc-inline-form { display: flex; align-items: end; gap: 0.75rem; flex-wrap: wrap; }
      .fc-saved { color: var(--emerald-700, #2e5138); font-weight: 600; }
      .fc-grid-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; }
      .fc-grid-form .fc-full { grid-column: 1 / -1; }
      .fc-report { border-top: 1px solid var(--gray-200, #e5e7eb); padding: 0.75rem 0; display: grid; gap: 0.5rem; }
      .fc-report-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .fc-report-summary { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .fc-row-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .fc-reminder { display: flex; gap: 0.75rem; align-items: flex-start; border-inline-start: 4px solid var(--gold, #c9a34c); }
      .fc-reminder p { margin: 0.15rem 0 0; }
      .error-box { color: var(--red-600, #9c3a2c); }
      .modal-backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 45%); display: grid; place-items: center; padding: 1rem; z-index: 60; }
      .modal-card { background: var(--surface, #fff); border-radius: 0.6rem; padding: 1.25rem; width: min(560px, 100%); max-height: 85vh; overflow: auto; display: grid; gap: 0.5rem; }
    `,
  ],
})
export class FundControlsComponent implements OnInit {
  readonly sections: Section[] = ['income-policy', 'threshold', 'signatories', 'audit', 'welfare'];
  readonly welfareStatuses: WelfareRequestStatus[] = ['submitted', 'under_review', 'approved', 'rejected', 'disbursed'];

  readonly section = signal<Section>('income-policy');
  readonly settings = signal<FundControlsSettings | null>(null);
  readonly reminder = signal<AuditReminder | null>(null);
  readonly signatories = signal<BankSignatory[]>([]);
  readonly reports = signal<AuditReport[]>([]);
  readonly welfareRequests = signal<WelfareFundRequest[]>([]);
  readonly members = signal<MemberPickerOption[]>([]);
  readonly error = signal('');

  readonly canFund: boolean;
  readonly canSignatory: boolean;
  readonly canAudit: boolean;
  readonly canWelfareReview: boolean;

  // Threshold form
  thresholdInput: number | null = null;
  thresholdSaving = false;
  thresholdSaved = false;
  thresholdError = '';

  // Signatory form
  signatoryModalOpen = false;
  editingSignatory: BankSignatory | null = null;
  sgMemberId: number | null = null;
  sgBank = '';
  sgBranch = '';
  sgAccountName = '';
  sgLast4 = '';
  sgScope = '';
  sgTermId: number | null = null;
  sgValidFrom = new Date().toISOString().slice(0, 10);
  sgValidTo = '';
  sgBusy = false;
  sgError = '';
  letterBusy = false;

  // Audit reports
  fyInput = '';
  reportDateInput = '';
  summaryInput = '';
  reportFile: File | null = null;
  reportBusy = false;
  reportError = '';
  editingSummaryId: number | null = null;
  editingSummaryText = '';

  // Welfare queue
  welfareStatusFilter: WelfareRequestStatus | '' = '';
  decideTarget: WelfareFundRequest | null = null;
  decisionKind: 'approved' | 'rejected' = 'approved';
  approvedAmount: number | null = null;
  decisionReason = '';
  decideBusy = false;
  decisionError = '';
  reasonView: WelfareFundRequest | null = null;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly fundControls = inject(FundControlsService);
  private readonly adminService = inject(AdminService);
  private readonly translate = inject(TranslateService);

  constructor(private auth: AuthService) {
    this.canFund = this.auth.hasAnyPermission(['fund.manage']);
    this.canSignatory = this.auth.hasAnyPermission(['signatory.manage']);
    this.canAudit = this.auth.hasAnyPermission(['audit_report.manage']);
    this.canWelfareReview = this.auth.hasAnyPermission(['welfare_fund.review']);
  }

  get lang(): string {
    return this.translate.currentLang() || 'bn';
  }

  visibleTabs(): Section[] {
    return this.sections.filter((tab) => {
      if (tab === 'threshold') return this.canFund;
      if (tab === 'signatories') return this.canSignatory;
      if (tab === 'audit') return this.canAudit;
      if (tab === 'welfare') return this.canWelfareReview;
      return true;
    });
  }

  memberOptions(): MemberPickerOption[] {
    return this.members();
  }

  taka(value: number): string {
    return formatTaka(value, this.lang);
  }

  ngOnInit(): void {
    this.fundControls.settings().subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.thresholdInput = settings.expenseTwoPersonThreshold;
        this.cdr.markForCheck();
      },
      error: () => this.error.set(this.translate.instant('common.loadFailed')),
    });
    if (this.canAudit) {
      this.fundControls.auditReminder().subscribe({
        next: (reminder) => {
          this.reminder.set(reminder);
          this.cdr.markForCheck();
        },
        error: () => this.reminder.set(null),
      });
    }
    if (this.canSignatory) this.loadSignatories();
    if (this.canAudit) this.loadReports();
    if (this.canWelfareReview) this.loadWelfare();
    this.adminService.listMembers().subscribe({
      next: (members) =>
        this.members.set(
          members
            .filter((member) => member.status === 'approved')
            .map((member) => ({ id: Number(member.id), fullName: member.fullName, memberId: member.memberId })),
        ),
      error: () => this.members.set([]),
    });
    // The initial tab is the first VISIBLE one.
    const first = this.visibleTabs()[0];
    if (first) this.section.set(first);
  }

  private fail(err: unknown, fallback: string): string {
    const detail = (err as { error?: { detail?: string } })?.error?.detail;
    return (typeof detail === 'string' && detail) || this.translate.instant(fallback);
  }

  // ----- Threshold -----

  saveThreshold(): void {
    if (this.thresholdInput == null || this.thresholdSaving) return;
    this.thresholdSaving = true;
    this.thresholdSaved = false;
    this.thresholdError = '';
    this.fundControls.updateThreshold(this.thresholdInput).subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.thresholdSaving = false;
        this.thresholdSaved = true;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.thresholdSaving = false;
        this.thresholdError = this.fail(err, 'common.saveFailed');
        this.cdr.markForCheck();
      },
    });
  }

  // ----- Signatories -----

  loadSignatories(): void {
    this.fundControls.signatories(true).subscribe({
      next: (rows) => {
        this.signatories.set(rows);
        this.cdr.markForCheck();
      },
      error: () => this.signatories.set([]),
    });
  }

  onSignatoryMemberChange(ids: number[]): void {
    this.sgMemberId = ids[0] ?? null;
  }

  openSignatoryForm(row?: BankSignatory): void {
    this.editingSignatory = row ?? null;
    this.sgMemberId = row?.memberId ?? null;
    this.sgBank = row?.bankName ?? '';
    this.sgBranch = row?.branch ?? '';
    this.sgAccountName = row?.accountName ?? '';
    this.sgLast4 = '';
    this.sgScope = row?.authorityScope ?? '';
    this.sgTermId = row?.committeeTermId ?? null;
    this.sgValidFrom = row?.validFrom ?? new Date().toISOString().slice(0, 10);
    this.sgValidTo = row?.validTo ?? '';
    this.sgError = '';
    this.signatoryModalOpen = true;
    this.cdr.markForCheck();
  }

  closeSignatoryForm(): void {
    this.signatoryModalOpen = false;
    this.editingSignatory = null;
    this.cdr.markForCheck();
  }

  saveSignatory(): void {
    if (this.sgBusy) return;
    this.sgError = '';
    if (!this.editingSignatory && this.sgMemberId == null) {
      this.sgError = this.translate.instant('fundControls.signatories.memberRequired');
      this.cdr.markForCheck();
      return;
    }
    this.sgBusy = true;
    const base = {
      bankName: this.sgBank.trim(),
      branch: this.sgBranch.trim(),
      accountName: this.sgAccountName.trim(),
      authorityScope: this.sgScope.trim() || null,
      committeeTermId: this.sgTermId,
      validFrom: this.sgValidFrom,
      validTo: this.sgValidTo || null,
    };
    const request$ = this.editingSignatory
      ? this.fundControls.updateSignatory(this.editingSignatory.id, {
          ...base,
          // The masked digits only change when a new value was typed.
          ...(this.sgLast4 ? { accountNumberLast4: this.sgLast4 } : {}),
        })
      : this.fundControls.createSignatory({
          ...base,
          memberId: this.sgMemberId!,
          accountNumberLast4: this.sgLast4,
        });
    request$.subscribe({
      next: () => {
        this.sgBusy = false;
        this.closeSignatoryForm();
        this.loadSignatories();
      },
      error: (err) => {
        this.sgBusy = false;
        this.sgError = this.fail(err, 'common.saveFailed');
        this.cdr.markForCheck();
      },
    });
  }

  askDeactivate(row: BankSignatory): void {
    const reason = window.prompt(this.translate.instant('fundControls.signatories.deactivateReason'));
    if (reason === null || !reason.trim()) return;
    this.fundControls.deactivateSignatory(row.id, reason.trim()).subscribe({
      next: () => this.loadSignatories(),
      error: () => this.error.set(this.translate.instant('common.saveFailed')),
    });
  }

  downloadBankLetter(): void {
    if (this.letterBusy) return;
    this.letterBusy = true;
    this.fundControls
      .downloadBankLetter()
      .pipe(finalize(() => (this.letterBusy = false)))
      .subscribe((blob) => this.saveBlob(blob, `bank-signatories-${new Date().toISOString().slice(0, 10)}.pdf`));
  }

  // ----- Audit reports -----

  loadReports(): void {
    this.fundControls.auditReports().subscribe({
      next: (rows) => {
        this.reports.set(rows);
        this.cdr.markForCheck();
      },
      error: () => this.reports.set([]),
    });
  }

  onReportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.reportFile = input.files?.[0] ?? null;
  }

  uploadReport(): void {
    if (!this.reportFile || !this.fyInput || !this.reportDateInput || this.reportBusy) return;
    this.reportBusy = true;
    this.reportError = '';
    this.fundControls.uploadAuditReport(this.reportFile, this.fyInput.trim(), this.reportDateInput, this.summaryInput.trim() || undefined).subscribe({
      next: () => {
        this.reportBusy = false;
        this.reportFile = null;
        this.summaryInput = '';
        this.loadReports();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.reportBusy = false;
        this.reportError = this.fail(err, 'common.saveFailed');
        this.cdr.markForCheck();
      },
    });
  }

  startEditSummary(report: AuditReport): void {
    this.editingSummaryId = report.id;
    this.editingSummaryText = report.summaryText ?? '';
    this.cdr.markForCheck();
  }

  saveSummary(report: AuditReport): void {
    if (this.reportBusy) return;
    this.reportBusy = true;
    this.reportError = '';
    this.fundControls.updateAuditSummary(report.id, this.editingSummaryText).subscribe({
      next: () => {
        this.reportBusy = false;
        this.editingSummaryId = null;
        this.loadReports();
      },
      error: (err) => {
        this.reportBusy = false;
        this.reportError = this.fail(err, 'common.saveFailed');
        this.cdr.markForCheck();
      },
    });
  }

  publishReport(report: AuditReport): void {
    if (this.reportBusy) return;
    this.reportBusy = true;
    this.reportError = '';
    this.fundControls.publishAuditReport(report.id).subscribe({
      next: () => {
        this.reportBusy = false;
        this.loadReports();
      },
      error: (err) => {
        this.reportBusy = false;
        this.reportError = this.fail(err, 'common.saveFailed');
        this.cdr.markForCheck();
      },
    });
  }

  downloadReport(report: AuditReport): void {
    this.fundControls.downloadAuditFile(report.id).subscribe((blob) =>
      this.saveBlob(blob, `audit-report-${report.fiscalYear}.pdf`),
    );
  }

  // ----- Welfare queue -----

  loadWelfare(): void {
    this.fundControls
      .welfareRequests(this.welfareStatusFilter || undefined)
      .subscribe({
        next: (rows) => {
          this.welfareRequests.set(rows);
          this.cdr.markForCheck();
        },
        error: () => this.welfareRequests.set([]),
      });
  }

  startReview(row: WelfareFundRequest): void {
    this.fundControls.startWelfareReview(row.id).subscribe({
      next: () => this.loadWelfare(),
      error: (err) => this.error.set(this.fail(err, 'common.saveFailed')),
    });
  }

  openDecide(row: WelfareFundRequest): void {
    this.decideTarget = row;
    this.decisionKind = 'approved';
    this.approvedAmount = row.amountRequested;
    this.decisionReason = '';
    this.decisionError = '';
    this.cdr.markForCheck();
  }

  closeDecide(): void {
    this.decideTarget = null;
    this.cdr.markForCheck();
  }

  confirmDecide(): void {
    const target = this.decideTarget;
    if (!target || this.decideBusy) return;
    if (!this.decisionReason.trim()) {
      this.decisionError = this.translate.instant('welfareFund.reasonRequired');
      this.cdr.markForCheck();
      return;
    }
    if (this.decisionKind === 'approved' && (this.approvedAmount == null || this.approvedAmount <= 0)) {
      this.decisionError = this.translate.instant('welfareFund.amountRequired');
      this.cdr.markForCheck();
      return;
    }
    this.decideBusy = true;
    this.decisionError = '';
    this.fundControls
      .decideWelfareRequest(
        target.id,
        this.decisionKind,
        this.decisionReason.trim(),
        this.decisionKind === 'approved' ? this.approvedAmount! : undefined,
      )
      .subscribe({
        next: () => {
          this.decideBusy = false;
          this.closeDecide();
          this.loadWelfare();
        },
        error: (err) => {
          this.decideBusy = false;
          this.decisionError = this.fail(err, 'common.saveFailed');
          this.cdr.markForCheck();
        },
      });
  }

  disburse(row: WelfareFundRequest): void {
    this.fundControls.disburseWelfareRequest(row.id).subscribe({
      next: () => this.loadWelfare(),
      error: (err) => this.error.set(this.fail(err, 'common.saveFailed')),
    });
  }

  showReason(row: WelfareFundRequest): void {
    this.reasonView = row;
    this.cdr.markForCheck();
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
