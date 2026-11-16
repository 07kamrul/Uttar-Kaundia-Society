import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { CorrectionContext } from '../../registration-page.component';

/** Rejection reason + sections to fix, shown above the wizard while correcting. */
@Component({
  selector: 'app-correction-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <aside class="cb" role="note" aria-labelledby="cb-title">
      <p id="cb-title" class="cb-title">
        {{ 'application.edit.bannerTitle' | translate: { n: context().round } }}
      </p>
      @if (context().reason) {
        <p class="cb-reason">
          <strong>{{ 'application.status.reasonLabel' | translate }}:</strong>
          {{ context().reason }}
        </p>
      }
      @if (context().fieldLabelKeys.length) {
        <p class="cb-sub">{{ 'application.edit.fixThese' | translate }}</p>
        <ul class="cb-fields">
          @for (key of context().fieldLabelKeys; track key) {
            <li>{{ key | translate }}</li>
          }
        </ul>
      }
      <p class="cb-hint">{{ 'application.edit.stepHint' | translate }}</p>
    </aside>
  `,
  styles: [
    `
      .cb {
        margin: 0 0 1rem;
        padding: 0.875rem 1rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--red-200);
        border-left: 4px solid var(--red-600);
        background: var(--red-50);
        color: var(--gray-800);
      }
      .cb-title {
        margin: 0 0 0.35rem;
        font-weight: 700;
        color: var(--red-700);
      }
      .cb-reason {
        margin: 0 0 0.5rem;
        white-space: pre-line;
        overflow-wrap: anywhere;
      }
      .cb-sub {
        margin: 0 0 0.35rem;
        font-weight: 600;
      }
      .cb-fields {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        list-style: none;
        margin: 0 0 0.5rem;
        padding: 0;
      }
      .cb-fields li {
        padding: 0.2rem 0.65rem;
        border-radius: 999px;
        font-size: 0.85rem;
        background: var(--surface);
        border: 1px solid var(--red-200);
      }
      .cb-hint {
        margin: 0;
        font-size: 0.85rem;
        color: var(--gray-700);
      }
    `,
  ],
})
export class CorrectionBannerComponent {
  readonly context = input.required<CorrectionContext>();
}
