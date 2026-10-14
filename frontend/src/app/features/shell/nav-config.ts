import { MEMBER_PAYMENT_ROLES, type UserRole } from '../../core/services/auth.service';
import type { IconName } from '../../shared/icon/icon.component';

export interface NavItem {
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
  // Five-area navigation only: which area the item belongs to, and the URL
  // prefixes that keep that area highlighted on its sub-pages.
  area?: AreaKey;
  prefixes?: readonly string[];
  // Hub tiles only: tiles in a group are rendered under their own heading.
  group?: 'help' | 'more';
  // Advanced menu entries: one plain line saying what the page is for.
  descriptionKey?: string;
}

export type AreaKey = 'home' | 'payments' | 'my-land' | 'organisation' | 'profile';

export interface NavSection {
  labelKey: string;
  items: NavItem[];
  // Rendered as a collapsed <details> (admin "Advanced" group).
  collapsible?: boolean;
}

// Sidebar is rendered section by section (Overview → My Payments → Community →
// Management → Administration) so the flat 30-item list stays scannable and the
// member-facing pages always come before the admin tools. Empty sections are
// dropped at render time, so permission-limited accounts never see a heading
// with nothing under it.
export const NAV_SECTIONS: NavSection[] = [
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
        requiredPermission: ['manage_finance'],
      },
      {
        labelKey: 'nav.feesManagement',
        route: '/fees-management',
        icon: 'coin',
        requiredPermission: ['manage_finance'],
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

