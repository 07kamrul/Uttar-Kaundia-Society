import { ChangeDetectionStrategy, Component, effect, inject, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../../../../../core/services/language.service';
import { localizeDigits } from '../../../../../core/services/roadmap.service';

export const MAP_TOUR_KEY = 'krmf_map_tour_v1';

export function isMapTourDone(): boolean {
  try {
    return localStorage.getItem(MAP_TOUR_KEY) === '1';
  } catch {
    return false;
  }
}

export function markMapTourDone(): void {
  try {
    localStorage.setItem(MAP_TOUR_KEY, '1');
  } catch {
    // private mode: the tour simply shows again next visit
  }
}

interface TourStep {
  key: string;
  /** The element the mark points at; it receives focus while the step is shown. */
  target: string;
}

const STEPS: readonly TourStep[] = [
  { key: 'layers', target: '[data-testid="layers-open"]' },
  { key: 'legend', target: '.legend-toggle' },
  { key: 'draw', target: '.draw-btn' },
  { key: 'help', target: '[data-testid="help-open"]' },
];

/** First-time coach marks for the map (map_wizard): 4 steps, skippable, Esc closes. */
@Component({
  selector: 'app-map-tour',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: { '(document:keydown.escape)': 'finish()' },
  template: `
    <section class="tour-card" role="dialog" data-testid="map-tour" aria-live="polite">
      <p class="tour-step">{{ 'member.plotMap.wizard.tour.step' | translate: { n: digit(index() + 1), total: digit(total) } }}</p>
      <p class="tour-text">{{ 'member.plotMap.wizard.tour.' + current().key | translate }}</p>
      <div class="tour-actions">
        <button type="button" class="tour-btn ghost" data-testid="tour-skip" (click)="finish()">
          {{ 'member.plotMap.wizard.tour.skip' | translate }}
        </button>
        <button type="button" class="tour-btn primary" data-testid="tour-next" (click)="next()">
          {{ (isLast() ? 'member.plotMap.wizard.tour.done' : 'member.plotMap.wizard.tour.next') | translate }}
        </button>
      </div>
    </section>
  `,
  styles: `
    :host { position: absolute; left: 0; right: 0; bottom: 5rem; z-index: 1200; display: flex; justify-content: center; pointer-events: none; }
    .tour-card {
      pointer-events: auto; width: min(22rem, calc(100% - 2rem)); padding: 1rem; border-radius: var(--radius-lg);
      background: var(--surface); color: var(--gray-800); box-shadow: var(--shadow-lg); border: 2px solid var(--gold);
    }
    .tour-step { margin: 0 0 0.25rem; font-size: 0.875rem; color: var(--gray-600); }
    .tour-text { margin: 0 0 0.75rem; font-size: 1rem; }
    .tour-actions { display: flex; justify-content: space-between; gap: 0.5rem; }
    .tour-btn {
      min-height: 48px; min-width: 48px; padding: 0.5rem 1rem; font: inherit; border-radius: var(--radius-md);
      border: 1px solid var(--emerald-600); cursor: pointer; background: transparent; color: inherit;
    }
    .tour-btn.primary { background: var(--emerald-700); color: #fff; }
  `,
})
export class MapTourComponent {
  private readonly lang = inject(LanguageService).lang;
  readonly closed = output<void>();
  readonly index = signal(0);
  readonly total = STEPS.length;

  constructor() {
    effect(() => {
      const target = STEPS[this.index()].target;
      queueMicrotask(() => document.querySelector<HTMLElement>(target)?.focus({ preventScroll: true }));
    });
  }

  current(): TourStep {
    return STEPS[this.index()];
  }

  isLast(): boolean {
    return this.index() === STEPS.length - 1;
  }

  digit(n: number): string {
    return localizeDigits(String(n), this.lang());
  }

  next(): void {
    if (this.isLast()) {
      this.finish();
      return;
    }
    this.index.update((i) => i + 1);
  }

  finish(): void {
    markMapTourDone();
    this.closed.emit();
  }
}
