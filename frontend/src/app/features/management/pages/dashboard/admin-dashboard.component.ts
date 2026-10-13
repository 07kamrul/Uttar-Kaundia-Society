import { ChangeDetectorRef, Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AdminService } from '../../../../core/services/admin.service';
import { AuthService } from '../../../../core/services/auth.service';
import { SocietyCostService } from '../../../../core/services/society-cost.service';
import { FinanceService, formatTaka, type FinanceOverview } from '../../../../core/services/finance.service';
import {
  FundControlsService,
  type AuditReminder,
} from '../../../../core/services/fund-controls.service';
import type { SocietyCostSummary } from '../../../../core/services/society-cost.service';
import type { SubmissionSummary } from '../../../../core/models/admin.model';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { PhoneLinkComponent } from '../../../../shared/phone/phone-link.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, DatePipe, TranslatePipe, SectionLoaderComponent, PhoneLinkComponent],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  pending: SubmissionSummary[] = [];
  loading = true;
  error = '';

  readonly canManageCosts: boolean;
  costSummary: SocietyCostSummary | null = null;
  costSummaryLoading = true;
  financeLoading = true;

  readonly canManageFinance: boolean;
  readonly canManageAudit: boolean;
  financeOverview: FinanceOverview | null = null;
  auditReminder: AuditReminder | null = null;

  constructor(
    private adminService: AdminService,
    private costService: SocietyCostService,
    private financeService: FinanceService,
    private fundControls: FundControlsService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {
    this.canManageCosts = this.auth.hasPermission('manage_costs');
    this.canManageFinance = this.auth.hasPermission('manage_finance');
    this.canManageAudit = this.auth.hasAnyPermission(['fund.manage', 'audit_report.manage']);
  }

  ngOnInit(): void {
    this.load();
    this.costSummaryLoading = this.canManageCosts;
    this.financeLoading = this.canManageFinance;
    if (this.canManageCosts) this.loadCostSummary();
    if (this.canManageFinance) this.loadFinanceOverview();
    if (this.canManageAudit) this.loadAuditReminder();
  }

  /** Module 4: June audit reminder (window active while the FY has no report). */
  private loadAuditReminder(): void {
    this.fundControls.auditReminder().subscribe({
      next: (reminder) => {
        this.auditReminder = reminder;
        this.cdr.markForCheck();
      },
      error: () => {
        this.auditReminder = null;
        this.cdr.markForCheck();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.adminService.listSubmissions('pending').subscribe({
      next: (data) => {
        this.pending = data;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = this.translate.instant('admin.dashboard.errors.loadFailed');
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  /** Fund widget: pending approvals, this month's net, current balance. */
  private loadFinanceOverview(): void {
    this.financeLoading = true;
    this.financeService.overview().subscribe({
      next: (overview) => {
        this.financeOverview = overview;
        this.financeLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.financeOverview = null;
        this.financeLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  financeTaka(value: number): string {
    return formatTaka(value, this.translate.currentLang() || 'bn');
  }

  /** This quarter's costs: the reporting widget stays even when the range has no costs. */
  private loadCostSummary(): void {
    const now = new Date();
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    this.costSummaryLoading = true;
    this.costService
      .getSummary({ dateFrom: iso(quarterStart), dateTo: iso(now) })
      .subscribe({
        next: (summary) => {
          this.costSummary = summary;
          this.costSummaryLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.costSummary = null;
          this.costSummaryLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  formatAmount(amount: number): string {
    return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatCategoryTotal(total: string): string {
    return this.formatAmount(Number(total) || 0);
  }

  /** Longest category bar is 100%; a missing total means an empty quarter. */
  categoryBarWidth(total: string): string {
    const max = Math.max(
      0,
      ...this.costSummary!.byCategory.map((c) => Number(c.total) || 0),
    );
    const value = Number(total) || 0;
    return max > 0 ? `${Math.round((value / max) * 100)}%` : '0%';
  }

  referenceFor(submission: SubmissionSummary): string {
    const year = new Date(submission.createdAt).getFullYear() || new Date().getFullYear();
    return `REF-${year}-${submission.id.padStart(4, '0')}`;
  }
}
