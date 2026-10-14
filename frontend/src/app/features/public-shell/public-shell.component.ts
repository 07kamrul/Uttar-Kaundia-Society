import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ThemeService } from '../../core/services/theme.service';
import { LanguageService } from '../../core/services/language.service';
import { FeatureFlagService } from '../../core/services/feature-flag.service';
import { LangSwitchComponent } from '../../shared/lang-switch/lang-switch.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { NetStatusBannerComponent } from '../../shared/net-status-banner/net-status-banner.component';

/**
 * Shared chrome for the public-facing pages (home, registration, login) —
 * sticky header with brand mark + gold rule + nav actions, and a footer,
 * matching the reference prototype's `<header>`/`<footer>` wrapper that
 * every one of its views renders inside.
 */
@Component({
  selector: 'app-public-shell',
  standalone: true,
  imports: [RouterLink, RouterOutlet, IconComponent, TranslatePipe, LangSwitchComponent, NetStatusBannerComponent],
  templateUrl: './public-shell.component.html',
  styleUrl: './public-shell.component.scss',
})
export class PublicShellComponent {
  isMobileMenuOpen = false;
  private readonly flags = inject(FeatureFlagService);

  get fiveAreas(): boolean {
    return this.flags.isEnabled('nav_five_areas');
  }

  constructor(
    public theme: ThemeService,
    public lang: LanguageService,
    private router: Router,
  ) {}

  goHome(): void {
    this.closeMobileMenu();
    this.router.navigate(['/']);
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen = false;
  }
}
