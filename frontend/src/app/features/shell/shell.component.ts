import { Component, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService, MEMBER_PAYMENT_ROLES, type UserRole } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { LanguageService } from '../../core/services/language.service';
import { MemberService } from '../../core/services/member.service';
import { IdCardModalComponent } from '../member/components/id-card-modal/id-card-modal.component';
import { IconComponent, type IconName } from '../../shared/icon/icon.component';

interface NavItem {
  labelKey: string;
  route: string;
  icon: IconName;
  // Absent = visible to any authenticated user (member-tier baseline).
  // Present = visible only if the user holds at least one of these keys.
  requiredPermission?: string[];
  // Absent = no role restriction. Present = visible only to these roles
  // (shared config - see MEMBER_PAYMENT_ROLES in auth.service.ts).
  requiredRoles?: readonly UserRole[];
  // True for entries every authenticated account can see. They carry no
  // requiredPermission, so list them here to keep the shared nav styling
  // (gold link color) applied to them too.
  openAccess?: boolean;
}

interface NavSection {
  labelKey: string;
  items: NavItem[];
}

// Sidebar is rendered section by section (Overview → My Payments → Community →
// Management → Administration) so the flat 30-item list stays scannable and the
// member-facing pages always come before the admin tools. Empty sections are
// dropped at render time, so permission-limited accounts never see a heading
// with nothing under it.
const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: 'nav.section.overview',
    items: [
      { labelKey: 'nav.dashboard', route: '/dashboard', icon: 'dashboard' },
      {
        labelKey: 'nav.profile',
        route: '/profile',
        icon: 'user',
        requiredPermission: ['profile.view_own'],
      },
      {
        labelKey: 'nav.changePassword',
        route: '/change-password',
        icon: 'lock',
        requiredPermission: ['profile.view_own'],
      },
    ],
  },
  {
    labelKey: 'nav.section.payments',
    items: [
      {
        labelKey: 'nav.installments',
        route: '/installments',
        icon: 'wallet',
        requiredPermission: ['profile.view_own'],
      },
      {
        labelKey: 'nav.otherFees',
        route: '/other-fees',
        icon: 'receipt',
        requiredPermission: ['profile.view_own'],
        requiredRoles: MEMBER_PAYMENT_ROLES,
      },
      {
        labelKey: 'nav.costShares',
        route: '/cost-shares',
        icon: 'coin',
        requiredPermission: ['profile.view_own'],
      },
    ],
  },
  {
    labelKey: 'nav.section.community',
    items: [
      {
        labelKey: 'nav.resolutionBook',
        route: '/resolution-book',
        icon: 'doc',
        // Members read via profile.view_own; committee/admin tiers hold
        // member.view_all - the nav shows the item when either key is held.
        requiredPermission: ['profile.view_own', 'member.view_all'],
      },
      {
        labelKey: 'nav.neighbours',
        route: '/neighbours',
        icon: 'pin',
        requiredPermission: ['neighbour.view'],
        // Account-type check, not a permission one: /api/member/neighbours only
        // accepts member tokens, and Super Admin's full catalog includes
        // neighbour.view without owning any plots.
        requiredRoles: ['member'],
      },
      {
        labelKey: 'nav.plotMap',
        route: '/plot-map',
        icon: 'map',
        requiredPermission: ['boundary.view'],
        // /api/member/plot-map only accepts member tokens.
        requiredRoles: ['member'],
      },
      // Fund transparency: every authenticated account (members and committee
      // alike) can read the society's approved ledger.
      {
        labelKey: 'nav.fundTransparency',
        route: '/fund-transparency',
        icon: 'chart',
        openAccess: true,
      },
      // Society roadmap: visible to every authenticated account.
      {
        labelKey: 'nav.roadmap',
        route: '/roadmap',
        icon: 'map',
        openAccess: true,
      },
      // Published notices/events - the same public pages logged-out visitors read.
      {
        labelKey: 'nav.membership',
        route: '/membership',
        icon: 'id-card',
        requiredPermission: ['profile.view_own'],
        requiredRoles: ['member'],
      },
      {
        labelKey: 'nav.complaints',
        route: '/complaints',
        icon: 'inbox',
        requiredPermission: ['profile.view_own'],
        requiredRoles: ['member'],
      },
      {
        labelKey: 'nav.serviceStandard',
        route: '/service-standard',
        icon: 'check-circle',
        requiredPermission: ['service_standard.view'],
      },
      // Modules 2 & 3 (governance expansion): member election participation
      // and special-session petitions.
      {
        labelKey: 'nav.elections',
        route: '/elections',
        icon: 'check-circle',
        requiredPermission: ['election.vote', 'election.candidate'],
        requiredRoles: ['member'],
      },
      {
        labelKey: 'nav.petitions',
        route: '/petitions',
        icon: 'doc',
        requiredPermission: ['petition.create'],
        requiredRoles: ['member'],
      },
      // Modules 4 & 6 (governance expansion): welfare-fund applications and
      // constitution amendments (propose + version register).
      {
        labelKey: 'nav.welfareFund',
        route: '/welfare-fund',
        icon: 'coin',
        requiredPermission: ['welfare_fund.apply'],
        requiredRoles: ['member'],
      },
      {
        labelKey: 'nav.amendments',
        route: '/amendments',
        icon: 'doc',
        requiredPermission: ['amendment.propose', 'service_standard.view'],
      },
      // জরুরি নিরাপদ পদক্ষেপ: open to every authenticated account.
      {
        labelKey: 'nav.emergencyHelp',
        route: '/emergency-help',
        icon: 'alert',
        openAccess: true,
      },
      {
        labelKey: 'nav.notices',
        route: '/notices',
        icon: 'doc',
        requiredPermission: ['notice.view'],
      },
      {
        labelKey: 'nav.events',
        route: '/events',
        icon: 'pin',
        requiredPermission: ['event.view'],
      },
    ],
  },
  {
    labelKey: 'nav.section.management',
    items: [
      {
        labelKey: 'nav.membershipReview',
        route: '/membership-review',
        icon: 'id-card',
        requiredPermission: ['membership_application.manage'],
      },
      {
        labelKey: 'nav.membershipGovernance',
        route: '/membership-governance',
        icon: 'shield',
        requiredPermission: [
          'member_waiver.manage',
          'member_suspension.manage',
          'membership_appeal.manage',
        ],
      },
      // Modules 2 & 3 (governance expansion): committee registry + elections.
      {
        labelKey: 'nav.committeeRegistry',
        route: '/committee-registry',
        icon: 'id-card',
        requiredPermission: ['committee_registry.manage'],
      },
      {
        labelKey: 'nav.electionsAdmin',
        route: '/elections-admin',
        icon: 'chart',
        requiredPermission: ['election.manage'],
      },
      {
        labelKey: 'nav.complaintsAdmin',
        route: '/complaints-admin',
        icon: 'inbox',
        requiredPermission: ['complaint.manage', 'complaint.investigate'],
      },
      // Modules 4, 6 & 7 (governance expansion): fund controls, amendment
      // tracker and registers.
      {
        labelKey: 'nav.fundControls',
        route: '/fund-controls',
        icon: 'shield',
        requiredPermission: [
          'fund.manage',
          'signatory.manage',
          'audit_report.manage',
          'welfare_fund.review',
        ],
      },
      {
        labelKey: 'nav.amendmentsAdmin',
        route: '/amendments-admin',
        icon: 'doc',
        requiredPermission: ['amendment.manage'],
      },
      {
        labelKey: 'nav.assetRegister',
        route: '/asset-register',
        icon: 'inbox',
        requiredPermission: ['asset_register.manage'],
      },
      {
        labelKey: 'nav.welfareActivities',
        route: '/welfare-activities',
        icon: 'users',
        requiredPermission: ['welfare_activity.manage'],
      },
      {
        labelKey: 'nav.submissions',
        route: '/submissions',
        icon: 'inbox',
        requiredPermission: ['membership.review'],
      },
      {
        labelKey: 'nav.propertyRequests',
        route: '/property-requests',
        icon: 'doc',
        requiredPermission: ['property.review'],
      },
      {
        labelKey: 'nav.membersList',
        route: '/members',
        icon: 'users',
        requiredPermission: ['member.view_all'],
      },
      {
        labelKey: 'nav.installmentsManagement',
        route: '/installments-management',
        icon: 'coin',
        requiredPermission: ['member.view_all'],
      },
      {
        labelKey: 'nav.feesManagement',
        route: '/fees-management',
        icon: 'coin',
        requiredPermission: ['member.view_all'],
      },
      {
        labelKey: 'nav.paymentVerifications',
        route: '/payment-verifications',
        icon: 'check-circle',
        requiredPermission: ['manage_finance'],
      },
      {
        labelKey: 'nav.plotBoundaries',
        route: '/plot-boundaries',
        icon: 'pin',
        requiredPermission: ['boundary.review'],
      },
    ],
  },
  {
    labelKey: 'nav.section.administration',
    items: [
      {
        labelKey: 'nav.rolesPermissions',
        route: '/roles',
        icon: 'shield',
        requiredPermission: ['manage_roles', 'manage_users'],
      },
      {
        labelKey: 'nav.feeSettings',
        route: '/fee-settings',
        icon: 'coin',
        requiredPermission: ['manage_fee_settings'],
      },
      {
        labelKey: 'nav.societyCosts',
        route: '/society-costs',
        icon: 'coin',
        requiredPermission: ['manage_costs'],
      },
      {
        labelKey: 'nav.financeManagement',
        route: '/finance-management',
        icon: 'chart',
        requiredPermission: ['manage_finance'],
      },
      {
        labelKey: 'nav.roadmapManagement',
        route: '/roadmap-management',
        icon: 'map',
        requiredPermission: ['manage_roadmap'],
      },
      {
        labelKey: 'nav.auditLog',
        route: '/audit-log',
        icon: 'shield',
        requiredPermission: ['view_audit_log'],
      },
      {
        labelKey: 'nav.configLists',
        route: '/config-lists',
        icon: 'inbox',
        requiredPermission: ['manage_system_config'],
      },
      {
        labelKey: 'nav.noticesManagement',
        route: '/notices-management',
        icon: 'doc',
        requiredPermission: ['manage_notices'],
      },
      {
        labelKey: 'nav.eventsManagement',
        route: '/events-management',
        icon: 'pin',
        requiredPermission: ['manage_notices'],
      },
    ],
  },
];

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
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
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

  get navSections(): NavSection[] {
    const role = this.auth.role;
    const visible = (item: NavItem): boolean => {
      if (item.requiredPermission && !this.auth.hasAnyPermission(item.requiredPermission)) {
        return false;
      }
      if (item.requiredRoles && (role === null || !item.requiredRoles.includes(role))) {
        return false;
      }
      return true;
    };
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter(visible),
    })).filter((section) => section.items.length > 0);
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
