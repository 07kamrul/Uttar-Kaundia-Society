import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent, type IconName } from '../icon/icon.component';

/**
 * The shared "nothing here yet" state: optional icon badge, a title and an
 * optional hint. Works standalone or inside a `<td class="empty-state">`.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <div class="empty-state-body" role="status">
      @if (icon(); as name) {
        <span class="empty-state-badge" aria-hidden="true"
          ><app-icon [name]="name" [size]="24"
        /></span>
      }
      <p class="empty-state-title">{{ titleKey() | translate }}</p>
      @if (hintKey(); as hint) {
        <p class="empty-state-hint">{{ hint | translate }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .empty-state-body {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      padding: 2rem 1rem;
      text-align: center;
    }
    .empty-state-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.75rem;
      height: 2.75rem;
      margin-bottom: 0.25rem;
      border-radius: 50%;
      background: var(--emerald-50);
      color: var(--emerald-800);
    }
    .empty-state-title {
      margin: 0;
      font-weight: 600;
      color: var(--gray-800);
      overflow-wrap: anywhere;
    }
    .empty-state-hint {
      margin: 0;
      max-width: 32rem;
      font-size: 0.85rem;
      color: var(--gray-600);
      overflow-wrap: anywhere;
    }
  `,
})
export class EmptyStateComponent {
  readonly titleKey = input.required<string>();
  readonly hintKey = input<string | null>(null);
  readonly icon = input<IconName | null>(null);
}
