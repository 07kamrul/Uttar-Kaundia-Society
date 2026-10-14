import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { PlotMapMode } from '../plot-map.component';

/**
 * "আরও লেয়ার" sheet (map_wizard): one place for the map view, RS plot lines,
 * snapping and satellite. Every row is a full-width 48 px button with words.
 */
@Component({
  selector: 'app-layers-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="sheet-backdrop" (click)="closed.emit()"></div>
    <section class="layers-sheet" role="dialog" data-testid="layers-sheet" [attr.aria-label]="'member.plotMap.wizard.layers.title' | translate">
      <h2 class="sheet-title">{{ 'member.plotMap.wizard.layers.title' | translate }}</h2>
      <div class="rows" role="radiogroup" [attr.aria-label]="'member.plotMap.views.title' | translate">
        <button type="button" role="radio" class="row" data-testid="layer-mode-mine" [attr.aria-checked]="mode() === 'boundaries'" (click)="modeChange.emit('boundaries')">
          <span class="mark" aria-hidden="true">{{ mode() === 'boundaries' ? '●' : '○' }}</span>
          {{ 'member.plotMap.wizard.layers.mine' | translate }}
        </button>
        <button type="button" role="radio" class="row" data-testid="layer-mode-bds" [attr.aria-checked]="mode() === 'bds'" (click)="modeChange.emit('bds')">
          <span class="mark" aria-hidden="true">{{ mode() === 'bds' ? '●' : '○' }}</span>
          {{ 'member.plotMap.wizard.layers.bds' | translate }}
        </button>
      </div>
      <div class="rows">
        <button type="button" role="switch" class="row" data-testid="layer-rs" [attr.aria-checked]="rs()" (click)="rsToggle.emit()">
          <span class="mark" aria-hidden="true">{{ rs() ? '☑' : '☐' }}</span>
          {{ 'member.plotMap.wizard.layers.rs' | translate }}
        </button>
        <button type="button" role="switch" class="row" data-testid="layer-snap" [attr.aria-checked]="snap()" [disabled]="!rs()" (click)="snapToggle.emit()">
          <span class="mark" aria-hidden="true">{{ snap() && rs() ? '☑' : '☐' }}</span>
          {{ 'member.plotMap.wizard.layers.snap' | translate }}
        </button>
        @if (showSatellite()) {
          <button type="button" role="switch" class="row" data-testid="layer-satellite" [attr.aria-checked]="satellite()" (click)="satelliteToggle.emit()">
            <span class="mark" aria-hidden="true">{{ satellite() ? '☑' : '☐' }}</span>
            {{ 'member.plotMap.wizard.layers.satellite' | translate }}
          </button>
        }
      </div>
      <button type="button" class="row close" data-testid="layers-close" (click)="closed.emit()">{{ 'common.close' | translate }}</button>
    </section>
  `,
  styles: `
    :host { position: absolute; inset: 0; z-index: 1100; display: block; pointer-events: none; }
    .sheet-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.35); pointer-events: auto; }
    .layers-sheet {
      position: absolute; left: 0; right: 0; bottom: 0; max-width: 28rem; margin: 0 auto;
      background: var(--surface); color: var(--gray-800); border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      padding: 1rem; box-shadow: var(--shadow-lg); pointer-events: auto;
    }
    .sheet-title { margin: 0 0 0.5rem; font-size: 1.125rem; }
    .rows { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.75rem; }
    .row {
      display: flex; align-items: center; gap: 0.75rem; width: 100%; min-height: 48px; padding: 0.5rem 0.75rem;
      font: inherit; font-size: 1rem; text-align: left; color: inherit; background: var(--surface-2);
      border: 1px solid var(--gray-200); border-radius: var(--radius-md); cursor: pointer;
    }
    .row[aria-checked='true'] { border-color: var(--emerald-600); font-weight: 600; }
    .row:disabled { opacity: 0.5; cursor: not-allowed; }
    .row.close { justify-content: center; }
    .mark { width: 1.5rem; text-align: center; }
  `,
})
export class LayersSheetComponent {
  readonly mode = input.required<PlotMapMode>();
  readonly rs = input(false);
  readonly snap = input(false);
  readonly satellite = input(false);
  readonly showSatellite = input(true);

  readonly modeChange = output<PlotMapMode>();
  readonly rsToggle = output<void>();
  readonly snapToggle = output<void>();
  readonly satelliteToggle = output<void>();
  readonly closed = output<void>();
}
