import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { PROFILE_TILES, isNavItemVisible } from '../../../shell/nav-areas';

/** nav_five_areas: the theme toggle and the account links (membership, password) live on the profile page. */
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
    .links { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  `,
})
export class ProfileDisplayComponent {
  readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);
  readonly links = PROFILE_TILES.filter((t) =>
    isNavItemVisible(t, this.auth.role, (keys) => this.auth.hasAnyPermission(keys)),
  );
}
