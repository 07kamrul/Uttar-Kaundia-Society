import { ChangeDetectorRef, Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AdminService } from '../../../../core/services/admin.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { QueueSearchComponent } from '../../../../shared/queue-search/queue-search.component';
import type { SubmissionStatus, SubmissionSummary } from '../../../../core/models/admin.model';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { PhoneLinkComponent } from '../../../../shared/phone/phone-link.component';

@Component({
  selector: 'app-submissions-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, DatePipe, TranslatePipe, SectionLoaderComponent, PhoneLinkComponent, QueueSearchComponent],
  templateUrl: './submissions-list.component.html',
})
export class SubmissionsListComponent implements OnInit {
  private readonly flags = inject(FeatureFlagService);
  private readonly route = inject(ActivatedRoute);

  /** admin_console: search box and the "needs a dag" shortcut from আজকের কাজ. */
  readonly searchOn = this.flags.isEnabled('admin_console');
  private readonly needsDagOnly = this.searchOn && this.route.snapshot.queryParamMap.get('needs_dag') === '1';
  searchTerm = '';

  submissions: SubmissionSummary[] = [];
  statusFilter: SubmissionStatus | '' = 'pending';
  loading = false;
  error = '';

  readonly statuses: Array<SubmissionStatus | ''> = ['', 'pending', 'approved', 'rejected'];

  constructor(
    private adminService: AdminService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.adminService.listSubmissions(this.statusFilter || undefined, this.searchTerm || undefined).subscribe({
      next: (data) => {
        this.submissions = this.needsDagOnly ? data.filter((s) => s.needsDag) : data;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = this.translate.instant('admin.submissionsList.errors.loadFailed');
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  referenceFor(submission: SubmissionSummary): string {
    const year = new Date(submission.createdAt).getFullYear() || new Date().getFullYear();
    return `REF-${year}-${submission.id.padStart(4, '0')}`;
  }

  statusLabel(status: SubmissionStatus | ''): string {
    return this.translate.instant(`admin.statusLabels.${status || 'all'}`);
  }

  onSearch(term: string): void {
    this.searchTerm = term;
    this.load();
  }

  onFilterChange(event: Event): void {
    this.statusFilter = (event.target as HTMLSelectElement).value as SubmissionStatus | '';
    this.load();
  }
}
