import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { MemberService, type MemberProfile } from '../../../../core/services/member.service';
import type { Installment } from '../../../../core/models/admin.model';
import { monthNameKey } from '../../../../shared/constants/months';

interface RecentContribution {
  id: Installment['id'];
  labelKey: string;
  status: Installment['status'];
}

@Component({
  selector: 'app-member-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink, IconComponent],
  templateUrl: './member-dashboard.component.html',
  styleUrl: './member-dashboard.component.scss',
})
export class MemberDashboardComponent implements OnInit {
  profile: MemberProfile | null = null;
  recentInstallments: RecentContribution[] = [];
  paidCount = 0;
  totalCount = 0;
  dueCount = 0;
  loading = false;
  error = '';

  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private memberService: MemberService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    forkJoin({
      profile: this.memberService.getProfile(),
      installments: this.memberService.getInstallments(),
    }).subscribe({
      next: ({ profile, installments }) => {
        this.profile = profile;
        this.dueCount = installments.filter((item) => item.status === 'due').length;
        this.totalCount = installments.length;
        this.paidCount = this.totalCount - this.dueCount;
        this.recentInstallments = [...installments]
          .sort((a, b) => b.year - a.year || b.month - a.month)
          .slice(0, 6)
          .reverse()
          .map((item) => ({
            id: item.id,
            labelKey: monthNameKey(item.month),
            status: item.status,
          }));
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = this.translate.instant('member.dashboard.loadError');
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  /** Share of months settled, for the contributions meter. */
  get paidPercent(): number {
    if (this.totalCount === 0) return 0;
    return Math.round((this.paidCount * 100) / this.totalCount);
  }

  /** First letters of the name words, for the hero avatar. */
  get heroInitials(): string {
    const name = this.profile?.fullName?.trim() ?? '';
    return name
      ? name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join('')
      : '?';
  }
}
