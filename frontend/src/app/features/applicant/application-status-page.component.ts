import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { correctionFieldInfo } from '../../core/models/application-review.model';
import { ReviewTimelineComponent } from '../../shared/application-review/review-timeline.component';
import { ApplicantService, type ApplicantApplication } from './applicant.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Where a rejected applicant lands: status, what to fix, history, next step. */
@Component({
  selector: 'app-application-status-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink, ReviewTimelineComponent],
  templateUrl: './application-status-page.component.html',
  styleUrl: './application-status-page.component.scss',
})
export class ApplicationStatusPageComponent implements OnInit {
  private readonly applicant = inject(ApplicantService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<LoadState>('loading');
  readonly app = signal<ApplicantApplication | null>(null);
  /** Shown once after a successful resubmission (router state). */
  readonly justResubmitted = signal(false);

  readonly fieldsToFix = computed(() =>
    (this.app()?.correctionFields ?? []).map((key) => ({
      key,
      labelKey: correctionFieldInfo(key)?.labelKey ?? key,
    })),
  );
  readonly statusKey = computed(() => `application.status.${this.app()?.status ?? 'pending'}`);

  ngOnInit(): void {
    // Only the navigation that just happened counts. A `history.state`
    // fallback would survive a page reload and repeat the notice forever.
    const navState = this.router.getCurrentNavigation()?.extras.state as
      { resubmitted?: boolean } | undefined;
    this.justResubmitted.set(navState?.resubmitted === true);
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.applicant
      .getApplication()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (app) => {
          this.app.set(app);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
