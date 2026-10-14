import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FeatureFlagService } from './core/services/feature-flag.service';
import { ThemeService } from './core/services/theme.service';
import { GlobalLoaderComponent } from './shared/loader/global-loader.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, GlobalLoaderComponent],
  template: '<app-global-loader /><router-outlet />',
})
export class App {
  // Injected (not just typed) so the theme is applied to <html> on every
  // route, including public pages (home/login/register) that sit outside
  // the authenticated shell and would otherwise never construct this
  // service — leaving data-theme unset and falling back to the OS's
  // prefers-color-scheme, which mismatched the prototype's fixed light look.
  private readonly theme = inject(ThemeService);
  private readonly flags = inject(FeatureFlagService);
  private readonly textSize = inject(TextSizeService);

  constructor() {
    // ui_a11y_v2 (Batch 7): the 48 px targets / 16 px body scoping lives in
    // styles.scss under html.ui-v2; the class mirrors the server flag and the
    // stored "লেখা বড় করুন" choice is restored by TextSizeService itself.
    effect(() => {
      document.documentElement.classList.toggle('ui-v2', this.flags.isEnabled('ui_a11y_v2'));
    });
  }
}
