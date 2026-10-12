import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LoaderService } from '../../core/services/loader.service';

export type SectionLoaderVariant = 'rows' | 'cards' | 'form';

/**
 * In-page loading placeholder. Show it in place of a list/table/form while its
 * data is fetching, so an empty state never flashes before the data arrives.
 * (The global top bar still covers navigation and writes.)
 */
@Component({
  selector: 'app-section-loader',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="section-loader" role="status" aria-live="polite" [attr.data-variant]="variant()">
      <span class="sr-only">{{ 'common.loading' | translate }}</span>
      @switch (variant()) {
        @case ('cards') {
          <div class="sl-cards">
            @for (i of items(); track i) { <div class="sl-card"><span class="skeleton-line sl-w60"></span><span class="skeleton-line"></span><span class="skeleton-line sl-w40"></span></div> }
          </div>
        }
        @case ('form') {
          @for (i of items(); track i) { <div class="sl-field"><span class="skeleton-line sl-w30"></span><span class="skeleton-block"></span></div> }
        }
        @default {
          @for (i of items(); track i) { <div class="skeleton-row"></div> }
        }
      }
      @if (isSlow()) {
        <p class="sl-slow">{{ 'common.stillWorking' | translate }}</p>
      }
    </div>
  `,
  styles: [
    `
      .section-loader { display: grid; gap: 0.75rem; padding: 1rem; }
      .sl-cards { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }
      .sl-card, .sl-field { display: grid; gap: 0.5rem; }
      .sl-card { padding: 0.9rem; border: 1px solid var(--gray-200); border-radius: var(--radius-md, 0.5rem); }
      .sl-w30 { width: 30%; } .sl-w40 { width: 40%; } .sl-w60 { width: 60%; }
      .sl-slow { margin: 0; text-align: center; color: var(--gray-600); font-size: 0.85rem; }
    `,
  ],
})
export class SectionLoaderComponent {
  private readonly loader = inject(LoaderService);

  readonly variant = input<SectionLoaderVariant>('rows');
  readonly count = input(4);

  protected readonly items = computed(() => Array.from({ length: this.count() }, (_, i) => i));
  protected readonly isSlow = this.loader.isSlow;
}
