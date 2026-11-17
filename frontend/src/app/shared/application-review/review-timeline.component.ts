import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  correctionFieldInfo,
  type ApplicationReview,
} from '../../core/models/application-review.model';

/** Vertical timeline of review rounds; shared by the admin and applicant views. */
@Component({
  selector: 'app-review-timeline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, DatePipe],
  template: `
    @if (reviews().length === 0) {
      <p class="rt-empty">{{ 'application.timeline.empty' | translate }}</p>
    } @else {
      <ol class="rt-list">
        @for (review of reviews(); track review.id) {
          <li class="rt-item" [class.rt-item--ok]="review.decision === 'approved'">
            <span class="rt-dot" aria-hidden="true"></span>
            <div class="rt-body">
              <div class="rt-head">
                <strong>{{ 'application.timeline.round' | translate: { n: review.round } }}</strong>
                <span
                  class="status-badge"
                  [class.status-approved]="review.decision === 'approved'"
                  [class.status-rejected]="review.decision === 'rejected'"
                >
                  {{ 'application.decision.' + review.decision | translate }}
                </span>
                <time class="rt-time">{{ review.createdAt | date: 'medium' }}</time>
              </div>
              @if (review.reason) {
                <p class="rt-reason">{{ review.reason }}</p>
              }
              @if (review.correctionFields.length) {
                <ul class="rt-fields">
                  @for (key of review.correctionFields; track key) {
                    <li>{{ labelKey(key) | translate }}</li>
                  }
                </ul>
              }
            </div>
          </li>
        }
      </ol>
    }
  `,
  styles: [
    `
      .rt-empty {
        color: var(--gray-600);
        margin: 0;
      }
      .rt-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .rt-item {
        position: relative;
        display: flex;
        gap: 0.75rem;
        padding-bottom: 1rem;
      }
      .rt-item:not(:last-child)::before {
        content: '';
        position: absolute;
        left: 6px;
        top: 16px;
        bottom: 0;
        width: 2px;
        background: var(--gray-200);
      }
      .rt-dot {
        flex: none;
        width: 14px;
        height: 14px;
        margin-top: 4px;
        border-radius: 50%;
        background: var(--red-600);
        box-shadow: 0 0 0 3px var(--red-50);
      }
      .rt-item--ok .rt-dot {
        background: var(--emerald-600);
        box-shadow: 0 0 0 3px var(--emerald-50);
      }
      .rt-body {
        min-width: 0;
        flex: 1;
      }
      .rt-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
      }
      .rt-time {
        color: var(--gray-600);
        font-size: 0.8rem;
      }
      .rt-reason {
        margin: 0.35rem 0 0;
        white-space: pre-line;
        overflow-wrap: anywhere;
      }
      .rt-fields {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        list-style: none;
        margin: 0.5rem 0 0;
        padding: 0;
      }
      .rt-fields li {
        font-size: 0.8rem;
        padding: 0.15rem 0.6rem;
        border-radius: 999px;
        background: var(--amber-50);
        color: var(--gray-800);
      }
    `,
  ],
})
export class ReviewTimelineComponent {
  readonly reviews = input<readonly ApplicationReview[]>([]);

  labelKey(key: string): string {
    return correctionFieldInfo(key)?.labelKey ?? key;
  }
}
