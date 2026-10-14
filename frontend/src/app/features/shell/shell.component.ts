import { Component, DestroyRef, Injector, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { LanguageService } from '../../core/services/language.service';
import { MemberService } from '../../core/services/member.service';
import { IdCardModalComponent } from '../member/components/id-card-modal/id-card-modal.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { BnNumberPipe } from '../../shared/pipes/bn-pipes';
import { NetStatusBannerComponent } from '../../shared/net-status-banner/net-status-banner.component';
import { HelpFabComponent } from '../../shared/help-fab/help-fab.component';
import { LangSwitchComponent } from '../../shared/lang-switch/lang-switch.component';
import { CostSharePaymentService } from '../../core/services/cost-share-payment.service';
import { HelplineService } from '../../core/services/helpline.service';
import { FeatureFlagService } from '../../core/services/feature-flag.service';
import { NAV_SECTIONS, type AreaKey, type NavItem, type NavSection } from './nav-config';
import { activeAreaFor, isNavItemVisible, memberAreaItems } from './nav-areas';

/** Below this width the five areas become a bottom bar. */
const NARROW_QUERY = '(max-width: 959.98px)';
const PAYMENTS_SECTION = 'nav.section.payments';
const ADMIN_SECTIONS = ['nav.section.management', 'nav.section.administration'];
// Moved into "অভিযোগ / সাহায্য" and the floating help button (nav_merged_entries).
const SERVICE_STANDARD_ROUTE = '/service-standard';
const EMERGENCY_HELP_ROUTE = '/emergency-help';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    IconComponent,
    TranslatePipe,
    IdCardModalComponent,
    HelpFabComponent,
    LangSwitchComponent,
    BnNumberPipe,
    NetStatusBannerComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  host: { '(document:keydown.escape)': 'closeUserMenu()' },
})
export class ShellComponent implements OnInit {
  isUserMenuOpen = false;
  readonly sidebarOpen = signal(false);
  readonly displayName = signal('');
  readonly memberId = signal('');
  readonly avatarPhotoUrl = signal<string | undefined>(undefined);
  readonly isIdCardOpen = signal(false);
  readonly activeArea = signal<AreaKey | null>(null);
  readonly isNarrow = signal(false);
  private readonly flags = inject(FeatureFlagService);
  private readonly helpline = inject(HelplineService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  /** Installment + cost-share payments waiting for a verifier (manage_finance only). */
  readonly pendingVerifications = signal(0);

  openIdCard(): void {
    this.closeSidebar();
    this.isIdCardOpen.set(true);
  }

  closeIdCard(): void {
    this.isIdCardOpen.set(false);
  }

  constructor(
    public auth: AuthService,
    public theme: ThemeService,
    public lang: LanguageService,
    private memberService: MemberService,
    private router: Router,
  ) {
    // The sectioned sidebar is taller than the viewport, so the highlighted
    // link for a lower page (পিটিশন, কল্যাণ তহবিল, …) can sit scrolled out of
    // sight. Keep it visible after every navigation — scrolling only the
    // sidebar's own container; scrollIntoView() would also scroll the page
    // body and leave the page hero clipped under the topbar.
    this.activeArea.set(this.currentArea());
    this.watchViewport();
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.activeArea.set(this.currentArea());
        requestAnimationFrame(() => {
          const sidebar = document.querySelector<HTMLElement>('.sidebar');
          const active = sidebar?.querySelector<HTMLElement>('.sidebar-link.active');
          if (!sidebar || !active) return;
          const sidebarRect = sidebar.getBoundingClientRect();
          const linkRect = active.getBoundingClientRect();
          const target =
            sidebar.scrollTop +
            (linkRect.top - sidebarRect.top) -
            sidebar.clientHeight / 2 +
            linkRect.height / 2;
          sidebar.scrollTo({ top: Math.max(0, target) });
        });
      });
  }

  ngOnInit(): void {
    if (this.auth.hasPermission('manage_finance')) {
      this.injector.get(CostSharePaymentService).pendingCounts().subscribe({
        next: (counts) => this.pendingVerifications.set(counts.total),
        error: () => this.pendingVerifications.set(0),
      });
    }
    // Not a permission check: /api/member/me only exists for actual Member-role
    // accounts (member JWTs), regardless of which permissions a role holds -
    // an Executive Committee/Administrator/Super Admin account has no member
    // profile row to fetch, so this stays an account-type check.
    if (this.auth.role === 'member') {
      this.memberService.getProfile().subscribe({
        next: (profile) => {
          this.displayName.set(profile.fullName);
          this.memberId.set(profile.memberId);
          this.avatarPhotoUrl.set(profile.memberPhotoUrl);
        },
        error: () => {
          // Header still renders without the name/ID; page content shows its own error state.
        },
      });
    }
  }

  get avatarInitial(): string {
    return this.welcomeName.trim().charAt(0) || (this.lang.lang() === 'bn' ? 'ব' : 'A');
  }

  // A missing/404 photo (e.g. file not yet on the server) must not render a
  // broken-image icon - fall back to the initial-letter avatar.
  onAvatarError(): void {
    this.avatarPhotoUrl.set(undefined);
  }

  get welcomeName(): string {
    return this.displayName() || (this.auth.landingTier() !== 'member' ? this.adminLabel : '');
  }

  private get adminLabel(): string {
    return this.lang.lang() === 'bn' ? 'প্রশাসক' : 'Admin';
  }

  /** Five-area navigation is on (the sidebar and bottom bar show the areas). */
  get fiveAreas(): boolean {
    return this.flags.isEnabled('nav_five_areas');
  }

  get showBottomBar(): boolean {
    return this.fiveAreas && this.isNarrow() && this.areaItems.length > 0;
  }

  /** The floating help button belongs to member-tier accounts only; it hides itself while the helpline is empty. */
  get showHelpFab(): boolean {
    return this.flags.isEnabled('nav_merged_entries') && this.auth.landingTier() === 'member';
  }

  get areaItems(): NavItem[] {
    return memberAreaItems({ payMerged: this.flags.isEnabled('pay_merged_page') }).filter((item) => this.isVisible(item));
  }

  /** Sections for the sidebar/drawer. On a phone with five areas the bar holds the areas, the drawer the rest. */
  get navSections(): NavSection[] {
    const payMerged = this.flags.isEnabled('pay_merged_page');
    const legacy = this.visibleSections(NAV_SECTIONS);
    if (this.fiveAreas) {
      const rest = legacy.filter((s) => s.labelKey === PAYMENTS_SECTION || ADMIN_SECTIONS.includes(s.labelKey));
      const tail = payMerged ? rest.filter((s) => s.labelKey !== PAYMENTS_SECTION) : rest;
      const areas: NavSection[] = this.isNarrow()
        ? []
        : [{ labelKey: 'nav.section.areas', items: this.areaItems }];
      return [...areas, ...tail].filter((s) => s.items.length > 0);
    }
    return legacy
      .map((section) => this.adjustMemberSection(section, payMerged))
      .filter((section) => section.items.length > 0);
  }

  isAreaActive(item: NavItem): boolean {
    return !!item.area && item.area === this.activeArea();
  }

  private isVisible(item: NavItem): boolean {
    return isNavItemVisible(item, this.auth.role, (keys) => this.auth.hasAnyPermission(keys));
  }

  private visibleSections(sections: NavSection[]): NavSection[] {
    return sections
      .map((section) => ({ ...section, items: section.items.filter((item) => this.isVisible(item)) }))
      .filter((section) => section.items.length > 0);
  }

  /** pay_merged_page: three payment entries become one. nav_merged_entries: help entries move to the help button / complaints page. */
  private adjustMemberSection(section: NavSection, payMerged: boolean): NavSection {
    if (payMerged && section.labelKey === PAYMENTS_SECTION) {
      const first = section.items[0];
      return { ...section, items: first ? [{ ...first, labelKey: 'nav.payments', route: '/payments' }] : [] };
    }
    if (!this.flags.isEnabled('nav_merged_entries')) return section;
    const dropEmergency = this.showHelpFab && this.helplineEnabled();
    return {
      ...section,
      items: section.items.filter(
        (item) => item.route !== SERVICE_STANDARD_ROUTE && !(dropEmergency && item.route === EMERGENCY_HELP_ROUTE),
      ),
    };
  }

  private helplineEnabled(): boolean {
    return this.helpline.helpline().enabled;
  }

  private currentArea(): AreaKey | null {
    let snapshot = this.router.routerState.snapshot.root;
    let fromData: unknown = snapshot.data['area'];
    while (snapshot.firstChild) {
      snapshot = snapshot.firstChild;
      fromData = snapshot.data['area'] ?? fromData;
    }
    return typeof fromData === 'string' ? (fromData as AreaKey) : activeAreaFor(this.router.url);
  }

  private watchViewport(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(NARROW_QUERY);
    this.isNarrow.set(query.matches);
    const onChange = (event: MediaQueryListEvent): void => this.isNarrow.set(event.matches);
    query.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  closeUserMenu(): void {
    this.isUserMenuOpen = false;
  }

  logout(): void {
    this.closeUserMenu();
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
