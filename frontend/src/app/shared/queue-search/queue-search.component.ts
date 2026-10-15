import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Wait for the typing to settle before asking the server. */
export const QUEUE_SEARCH_DEBOUNCE_MS = 300;
export const QUEUE_SEARCH_MIN_CHARS = 2;

/**
 * Search box for admin queues: waits 300 ms after the last key, ignores a single
 * character, and emits '' when the box is emptied so the list can reset.
 */
@Component({
  selector: 'app-queue-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="queue-search">
      <input
        #box
        type="search"
        inputmode="search"
        class="queue-search-input"
        autocomplete="off"
        [placeholder]="'adminConsole.search.placeholder' | translate"
        [attr.aria-label]="'adminConsole.search.placeholder' | translate"
        (input)="onInput(box.value)"
      />
      @if (hasText()) {
        <button type="button" class="queue-search-clear" data-testid="search-clear" [attr.aria-label]="'adminConsole.search.clear' | translate" (click)="clear()">
          ✕ {{ 'adminConsole.search.clear' | translate }}
        </button>
      }
    </div>
  `,
  styles: `
    .queue-search { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 0.5rem 0 1rem; }
    .queue-search-input { flex: 1 1 12rem; min-width: 0; box-sizing: border-box; min-height: 48px; padding: 0.5rem 0.75rem; font: inherit; }
    .queue-search-clear { min-height: 48px; min-width: 48px; padding: 0 0.75rem; font: inherit; cursor: pointer; }
  `,
})
export class QueueSearchComponent implements OnDestroy {
  readonly search = output<string>();
  readonly hasText = signal(false);
  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private last = '';

  onInput(raw: string): void {
    this.hasText.set(raw.length > 0);
    this.cancelTimer();
    this.timer = setTimeout(() => this.emit(raw.trim()), QUEUE_SEARCH_DEBOUNCE_MS);
  }

  clear(): void {
    this.cancelTimer();
    this.box().nativeElement.value = '';
    this.hasText.set(false);
    this.emit('');
  }

  ngOnDestroy(): void {
    this.cancelTimer();
  }

  private emit(term: string): void {
    if (term.length > 0 && term.length < QUEUE_SEARCH_MIN_CHARS) return;
    if (term === this.last) return;
    this.last = term;
    this.search.emit(term);
  }

  private cancelTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
