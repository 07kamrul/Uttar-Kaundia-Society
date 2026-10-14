import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { DataSaverService } from '../../../../core/services/data-saver.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { TextSizeService } from '../../../../core/services/text-size.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { PROFILE_TILES, isNavItemVisible } from '../../../shell/nav-areas';

/** nav_five_areas: the theme toggle, the a11y/data-saver switches and the
 * account links (membership, password) live on the profile page's "প্রদর্শন". */
@Component({
  selector: 'app-profile-display',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent],
  template: `
    <section class="card display-card" data-testid="display-card">
      <h2 class="section-title">{{ 'profile.display.title' | translate }}</h2>
      <button type="button" class="btn btn-secondary" data-testid="theme-toggle" [attr.aria-label]="'nav.changeTheme' | translate" (click)="theme.toggle()">
        <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="18" />
        {{ (theme.theme() === 'dark' ? 'nav.lightTheme' : 'nav.darkTheme') | translate }}
      </button>
      @if (a11yOn) {
        <label class="display-switch" data-testid="text-size-toggle">
          <input type="checkbox" [checked]="textSize.large()" (change)="textSize.toggle()" />
          <span>{{ 'profile.display.textSize' | translate }}</span>
        </label>
      }
      @if (dataSaverOn) {
        <label class="display-switch" data-testid="data-saver-toggle">
          <input type="checkbox" [checked]="dataSaver.enabled()" (change)="dataSaver.setEnabled(!dataSaver.enabled())" />
          <span>
            {{ 'profile.display.dataSaver' | translate }}
            <small class="display-switch-hint">{{ 'profile.display.dataSaverHint' | translate }}</small>
          </span>
        </label>
      }
      <div class="links">
        @for (link of links; track link.route) {
          <a class="btn btn-secondary" data-testid="profile-link" [routerLink]="link.route">
            <app-icon [name]="link.icon" [size]="18" /> {{ link.labelKey | translate }}
          </a>
        }
      </div>
    </section>
  `,
  styles: `
    .display-card { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; margin-top: 1rem; }
    .btn { min-height: 48px; justify-content: flex-start; gap: 0.5rem; }
    .display-switch { display: flex; align-items: center; gap: 0.6rem; min-height: 48px; cursor: pointer; }
    .display-switch input { width: 1.15rem; height: 1.15rem; }
    .display-switch-hint { display: block; color: var(--gray-600, #666); }
    .links { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  `,
})
export class ProfileDisplayComponent {
  readonly theme = inject(ThemeService);
  readonly textSize = inject(TextSizeService);
  readonly dataSaver = inject(DataSaverService);
  private readonly flags = inject(FeatureFlagService);
  private readonly auth = inject(AuthService);
  /** ui_a11y_v2: the "লেখা বড় করুন" one-step text size. */
  get a11yOn(): boolean {
    return this.flags.isEnabled('ui_a11y_v2');
  }
  /** data_saver: "ডেটা সাশ্রয়" switch (preloading, tile gate, tap-to-load). */
  get dataSaverOn(): boolean {
    return this.flags.isEnabled('data_saver');
  }
  readonly links = PROFILE_TILES.filter((t) =>
    isNavItemVisible(t, this.auth.role, (keys) => this.auth.hasAnyPermission(keys)),
  );
}
