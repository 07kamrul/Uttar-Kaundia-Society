import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../../../../../shared/icon/icon.component';
import { WIZARD_LEGEND } from '../map-legend';

export interface StatusLegendItem {
  status: string;
  color: string;
}

const DESKTOP_QUERY = '(min-width: 768px)';

/** Open by default on desktop, collapsed on phones so the map stays visible. */
function initiallyOpen(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DESKTOP_QUERY).matches
    : true;
}

/**
 * Collapsible colour legend floating over the plot map. Purely presentational:
 * the parent decides which legend applies (wizard vs status) and positions the
 * host via its own `.legend` class.
 */
@Component({
  selector: 'app-map-legend-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  templateUrl: './map-legend-card.component.html',
  styleUrl: './map-legend-card.component.scss',
})
export class MapLegendCardComponent {
  readonly wizard = input(false);
  readonly rsOverlay = input(false);
  readonly statusItems = input<readonly StatusLegendItem[]>([]);

  protected readonly wizardLegend = WIZARD_LEGEND;
  protected readonly open = signal(initiallyOpen());

  toggle(): void {
    this.open.update((isOpen) => !isOpen);
  }
}
