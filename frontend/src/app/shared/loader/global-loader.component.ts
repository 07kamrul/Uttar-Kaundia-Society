import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LoaderService } from '../../core/services/loader.service';

/**
 * App-wide loader, mounted once in the root component. Reads show a thin top
 * progress bar; writes show a blocking overlay so actions can't be submitted twice.
 */
@Component({
  selector: 'app-global-loader',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './global-loader.component.html',
  styleUrl: './global-loader.component.scss',
})
export class GlobalLoaderComponent {
  private readonly loader = inject(LoaderService);
  private readonly overlayRef = viewChild<ElementRef<HTMLElement>>('overlay');

  readonly isBarVisible = computed(() => this.loader.visible() && this.loader.mode() === 'bar');
  readonly isOverlayVisible = computed(
    () => this.loader.visible() && this.loader.mode() === 'overlay',
  );
  readonly isSlow = this.loader.isSlow;

  constructor() {
    this.trackRouteLoads();
    // Move focus into the overlay so keyboard users can't act on the page behind it.
    effect(() => this.overlayRef()?.nativeElement.focus());
  }

  /** Keeps Tab focus inside the overlay while it is shown. */
  trapFocus(event: KeyboardEvent): void {
    if (event.key === 'Tab') event.preventDefault();
  }

  /** Shows the bar while a lazy route chunk downloads. */
  private trackRouteLoads(): void {
    let endNavigation: (() => void) | null = null;
    inject(Router)
      .events.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          endNavigation?.();
          endNavigation = this.loader.begin('bar');
          return;
        }
        const isSettled =
          event instanceof NavigationEnd ||
          event instanceof NavigationCancel ||
          event instanceof NavigationError;
        if (isSettled) {
          endNavigation?.();
          endNavigation = null;
        }
      });
  }
}
