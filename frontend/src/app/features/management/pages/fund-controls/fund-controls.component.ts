import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { DatePickerComponent } from '../../../../shared/date-picker/date-picker.component';

type Section = 'income-policy' | 'threshold' | 'signatories' | 'audit' | 'welfare';

@Component({
  selector: 'app-fund-controls',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent, DatePickerComponent, MemberPickerComponent, SectionLoaderComponent],
  templateUrl: './fund-controls.component.html',
  styles: [
    `
      .fc-page { display: grid; gap: 1rem; }
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
      .fc-grid-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 0.75rem; }
      .fc-grid-form .fc-full { grid-column: 1 / -1; }
      .fc-report { border-top: 1px solid var(--gray-200, #e5e7eb); padding: 0.75rem 0; display: grid; gap: 0.5rem; }
      .fc-report-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .fc-report-summary { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .fc-row-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .fc-reminder { display: flex; gap: 0.75rem; align-items: flex-start; border-inline-start: 4px solid var(--gold, #c9a34c); }
      .fc-reminder p { margin: 0.15rem 0 0; }
      .error-box { color: var(--red-600, #9c3a2c); }
      .fc-load-error { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
      .fc-load-error p { margin: 0; }
      @media (max-width: 640px) { .fc-load-error .btn { width: 100%; } }
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
  readonly settingsLoading = signal(true);
  readonly sgLoading = signal(true);
  readonly reportsLoading = signal(true);
  readonly welfareLoading = signal(true);
  readonly settingsFailed = signal(false);
  readonly sgFailed = signal(false);
  readonly reportsFailed = signal(false);
  readonly welfareFailed = signal(false);

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
    this.loadSettings();
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

  loadSettings(): void {
    this.settingsLoading.set(true);
    this.settingsFailed.set(false);
    this.fundControls.settings().subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.thresholdInput = settings.expenseTwoPersonThreshold;
        this.settingsLoading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.settingsFailed.set(true);
        this.settingsLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  // ----- Signatories -----

  loadSignatories(): void {
    this.sgLoading.set(true);
    this.sgFailed.set(false);
    this.fundControls.signatories(true).subscribe({
      next: (rows) => {
        this.signatories.set(rows);
        this.sgLoading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.signatories.set([]);
        this.sgFailed.set(true);
        this.sgLoading.set(false);
        this.cdr.markForCheck();
      },
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
    this.reportsLoading.set(true);
    this.reportsFailed.set(false);
    this.fundControls.auditReports().subscribe({
      next: (rows) => {
        this.reports.set(rows);
        this.reportsLoading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.reports.set([]);
        this.reportsFailed.set(true);
        this.reportsLoading.set(false);
        this.cdr.markForCheck();
      },
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

  /** `silent` keeps the current rows visible (post-action refresh). */
  loadWelfare(silent = false): void {
    if (!silent) this.welfareLoading.set(true);
    this.welfareFailed.set(false);
    this.fundControls
      .welfareRequests(this.welfareStatusFilter || undefined)
      .subscribe({
        next: (rows) => {
          this.welfareRequests.set(rows);
          this.welfareLoading.set(false);
          this.cdr.markForCheck();
        },
        error: () => {
          this.welfareRequests.set([]);
          this.welfareFailed.set(true);
          this.welfareLoading.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  startReview(row: WelfareFundRequest): void {
    this.fundControls.startWelfareReview(row.id).subscribe({
      next: () => this.loadWelfare(true),
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
          this.loadWelfare(true);
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
      next: () => this.loadWelfare(true),
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
