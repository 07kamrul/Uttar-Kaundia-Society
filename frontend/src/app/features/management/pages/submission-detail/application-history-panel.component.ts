import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import type { ApplicationReview } from '../../../../core/models/application-review.model';
import type { SubmissionStatus } from '../../../../core/models/admin.model';
import { AdminService } from '../../../../core/services/admin.service';
import { ReviewTimelineComponent } from '../../../../shared/application-review/review-timeline.component';

type ResendState = 'idle' | 'sending' | 'sent' | 'failed';

/**
 * Review history of one application for the committee: every round, the
 * resubmission count, and "resend login" for a rejected applicant.
 */
@Component({
  selector: 'app-application-history-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ReviewTimelineComponent],
  template: `
    <section class="ahp" aria-labelledby="ahp-title">
      <header class="ahp-head">
        <h3 id="ahp-title" class="section-title ahp-title">
          {{ 'application.admin.historyTitle' | translate }}
        </h3>
        @if (resubmissionCount() > 0) {
          <span class="status-badge status-pending" data-testid="resubmitted-badge">
            {{ 'application.admin.resubmittedTimes' | translate: { n: resubmissionCount() } }}
          </span>
        }
      </header>

      @if (loadError()) {
        <p class="field-error" role="alert">
          {{ 'application.admin.historyLoadFailed' | translate }}
        </p>
      } @else {
        <app-review-timeline [reviews]="reviews()" />
      }

      @if (canResendLogin()) {
        <div class="ahp-actions">
          <button
            type="button"
            class="btn btn-secondary"
            [disabled]="resend() === 'sending'"
            (click)="resendLogin()"
            data-testid="resend-login"
          >
            {{
              (resend() === 'sending'
                ? 'application.admin.resendingLogin'
                : 'application.admin.resendLogin'
              ) | translate
            }}
          </button>
          @if (resend() === 'sent') {
            <span class="ahp-ok" role="status">{{
              'application.admin.loginResent' | translate
            }}</span>
          } @else if (resend() === 'failed') {
            <span class="field-error" role="alert">{{
              'application.admin.loginResendFailed' | translate
            }}</span>
          }
          <p class="field-hint ahp-hint">{{ 'application.admin.resendLoginHint' | translate }}</p>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .ahp {
        margin: 1rem 0;
        padding: 1rem;
        border: 1px solid var(--gray-200);
        border-radius: var(--radius-md);
        background: var(--surface);
      }
      .ahp-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
      }
      .ahp-title {
        margin: 0;
      }
      .ahp-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      .ahp-actions .btn {
        min-height: 44px;
      }
      .ahp-ok {
        color: var(--emerald-600);
        font-weight: 600;
      }
      .ahp-hint {
        flex-basis: 100%;
        margin: 0;
      }
    `,
  ],
})
export class ApplicationHistoryPanelComponent {
  readonly submissionId = input.required<string>();
  readonly status = input.required<SubmissionStatus>();
  readonly memberCode = input<string | null | undefined>(null);
  readonly resubmissionCount = input<number>(0);

  private readonly admin = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  readonly reviews = signal<ApplicationReview[]>([]);
  readonly loadError = signal(false);
  readonly resend = signal<ResendState>('idle');
  readonly canResendLogin = computed(() => this.status() === 'rejected' && !this.memberCode());

  /** Changes whenever the reviewed submission or its status changes. */
  private readonly historyKey = computed(() => ({
    id: this.submissionId(),
    status: this.status(),
  }));

  constructor() {
    // switchMap cancels an in-flight request when the key changes, so a slow
    // earlier response can never overwrite the history of a newer state.
    toObservable(this.historyKey)
      .pipe(
        switchMap(({ id }) =>
          this.admin.getReviewHistory(id).pipe(
            map((reviews) => ({ reviews, failed: false })),
            catchError(() => of({ reviews: null, failed: true })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ reviews, failed }) => {
        this.loadError.set(failed);
        if (reviews) this.reviews.set(reviews);
      });
  }

  resendLogin(): void {
    if (this.resend() === 'sending') return;
    this.resend.set('sending');
    this.admin
      .resendApplicantLogin(this.submissionId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ emailSent }) => this.resend.set(emailSent ? 'sent' : 'failed'),
        error: () => this.resend.set('failed'),
      });
  }
}
