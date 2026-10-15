import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { FeatureFlagService } from '../../core/services/feature-flag.service';
import { NetworkStatusService } from '../../core/services/network-status.service';

/** How long the "আবার সংযুক্ত" note stays visible after a reconnect. */
const RECONNECTED_VISIBLE_MS = 3000;

/**
 * Offline / slow / reconnected banner (net_status_banner). Renders nothing
 * while the flag is off or the connection is fine.
 */
@Component({
  selector: 'app-net-status-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    @if (visible(); as kind) {
      <div class="net-banner" role="status" aria-live="polite" [attr.data-kind]="kind">
        {{
          (kind === 'offline'
            ? 'netStatus.offline'
            : kind === 'slow'
              ? 'netStatus.slow'
              : 'netStatus.reconnected') | translate
        }}
      </div>
    }
  `,
  styles: `
    .net-banner {
      padding: 0.5rem max(1rem, env(safe-area-inset-right, 0px)) 0.5rem max(1rem, env(safe-area-inset-left, 0px));
      overflow-wrap: anywhere;
      font-size: 0.9rem;
      text-align: center;
      background: var(--amber-100, #fff7e0);
      color: var(--amber-900, #6b4d00);
      font-weight: 600;
    }
    .net-banner[data-kind='offline'] {
      background: var(--red-100, #fdeaea);
      color: var(--red-700, #a02020);
    }
    .net-banner[data-kind='reconnected'] {
      background: var(--green-100, #e7f5ea);
      color: var(--green-800, #1d5c2a);
    }
  `,
})
export class NetStatusBannerComponent {
  private readonly flags = inject(FeatureFlagService);
  private readonly network = inject(NetworkStatusService);
  private readonly destroyRef = inject(DestroyRef);

  /** null = hide; otherwise which message to show. */
  readonly visible = signal<'offline' | 'slow' | 'reconnected' | null>(null);

  constructor() {
    // Track the problem (and the flag) reactively: a recovered network or a
    // flag switch clears the banner without a manual change-detection nudge.
    effect(() => {
      const problem = this.flags.isEnabled('net_status_banner') ? this.network.problem() : null;
      if (problem) this.visible.set(problem);
      else if (this.visible() !== 'reconnected') this.visible.set(null);
    });
    this.network.reconnected$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.flags.isEnabled('net_status_banner')) return;
      this.visible.set('reconnected');
      const timer = setTimeout(() => this.visible.set(null), RECONNECTED_VISIBLE_MS);
      this.destroyRef.onDestroy(() => clearTimeout(timer));
    });
  }
}
