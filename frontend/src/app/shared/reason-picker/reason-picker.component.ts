import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, map, of, switchMap } from 'rxjs';
import { ConfigListService } from '../../core/services/config-list.service';
import { FALLBACK_REASONS, type ReasonCategory } from './reject-reasons';

/**
 * Chips of canned reasons (from the public config list) that fill an editable
 * textarea. The server still requires free text, so the textarea stays the source
 * of truth. An empty or failing list falls back to the built-in reasons.
 */
@Component({
  selector: 'app-reason-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <p class="reason-label">{{ 'adminConsole.reason.label' | translate }}</p>
    <div class="reason-chips">
      @for (reason of reasons(); track reason) {
        <button type="button" class="reason-chip" data-testid="reason-chip" (click)="value.set(reason)">{{ reason }}</button>
      }
    </div>
    <textarea
      class="reason-text"
      rows="3"
      maxlength="500"
      [attr.id]="inputId()"
      [value]="value()"
      [attr.aria-label]="'adminConsole.reason.label' | translate"
      (input)="value.set($any($event.target).value)"
    ></textarea>
  `,
  styles: `
    .reason-label { margin: 0 0 0.25rem; font-weight: 600; }
    .reason-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem; }
    .reason-chip { min-height: 48px; padding: 0.25rem 0.9rem; font: inherit; border: 1px solid var(--emerald-600); border-radius: 999px; background: var(--surface-2); color: inherit; cursor: pointer; }
    .reason-text { width: 100%; font: inherit; }
  `,
})
export class ReasonPickerComponent {
  private readonly lists = inject(ConfigListService);

  readonly category = input.required<ReasonCategory>();
  readonly inputId = input<string | null>(null);
  /** The reason text; two-way bound. */
  readonly value = model('');

  private readonly fetched = toSignal(
    toObservable(this.category).pipe(
      switchMap((c) =>
        this.lists.getItems(c).pipe(
          map((rows) => rows.filter((r) => r.isActive).map((r) => r.label || r.value)),
          catchError(() => of([] as string[])),
        ),
      ),
    ),
  );

  readonly reasons = computed(() => {
    const rows = this.fetched();
    return rows && rows.length > 0 ? rows : [...FALLBACK_REASONS[this.category()]];
  });
}
