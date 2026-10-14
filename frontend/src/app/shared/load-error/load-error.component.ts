import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { toUserMessageKey } from '../../core/errors/user-error';

/**
 * The shared "could not load" state: a plain message and "আবার চেষ্টা করুন".
 * Known HTTP failures (offline, 403, 429, 5xx ...) get their own message; any
 * other error shows the page's own `fallbackKey`. Server text is never shown.
 */
@Component({
  selector: 'app-load-error',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="error-box load-error" role="alert">
      <p class="load-error-text">{{ messageKey() | translate }}</p>
      <button type="button" class="btn btn-secondary" (click)="retry.emit()">
        {{ 'common.retry' | translate }}
      </button>
    </div>
  `,
  styles: `
    .load-error-text {
      margin: 0 0 0.75rem;
    }
  `,
})
export class LoadErrorComponent {
  readonly error = input<unknown>(null);
  /** Shown when the error carries no known HTTP meaning. */
  readonly fallbackKey = input('errors.unknown');
  readonly retry = output<void>();

  protected readonly messageKey = computed(() => {
    const err = this.error();
    return err instanceof HttpErrorResponse ? toUserMessageKey(err) : this.fallbackKey();
  });
}
