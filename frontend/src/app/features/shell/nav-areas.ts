import { MEMBER_PAYMENT_ROLES, type UserRole } from '../../core/services/auth.service';
import type { AreaKey, NavItem, NavSection } from './nav-config';

/** The three NAV_SECTIONS sections that hold member-facing routes (the rest is admin). */
export const MEMBER_SECTION_KEYS: readonly string[] = [
  'nav.section.overview',
  'nav.section.payments',
  'nav.section.community',
];

const MEMBER_ONLY: readonly UserRole[] = ['member'];

/** The five member areas (bottom bar on phones, sidebar on desktop). */
export const MEMBER_AREAS: NavItem[] = [
  { labelKey: 'nav.home', route: '/dashboard', icon: 'dashboard', area: 'home', prefixes: ['/dashboard'] },
  {
    labelKey: 'nav.payments',
    route: '/payments',
    icon: 'wallet',
    area: 'payments',
    prefixes: ['/payments', '/installments', '/other-fees', '/cost-shares', '/picnic-payment', '/fees'],
    requiredPermission: ['profile.view_own'],
    requiredRoles: MEMBER_PAYMENT_ROLES,
  },
  {
    labelKey: 'nav.myLand',
    route: '/my-land',
    icon: 'map',
    area: 'my-land',
    prefixes: ['/my-land', '/neighbours', '/plot-map', '/property-requests'],
    requiredPermission: ['profile.view_own'],
    requiredRoles: MEMBER_ONLY,
  },
  {
    labelKey: 'nav.organisation',
    route: '/organisation',
    icon: 'users',
    area: 'organisation',
    prefixes: [
      '/organisation',
      '/notices',
      '/events',
      '/resolution-book',
      '/fund-transparency',
      '/roadmap',
      '/welfare-fund',
      '/elections',
      '/complaints',
      '/service-standard',
      '/emergency-help',
      '/petitions',
      '/amendments',
    ],
  },
  {
    labelKey: 'nav.myProfile',
    route: '/profile',
    icon: 'user',
    area: 'profile',
    prefixes: ['/profile', '/change-password', '/membership'],
    requiredPermission: ['profile.view_own'],
  },
];

/** "আমার জমি" hub tiles: same permission rules as the old menu items. */
export const MY_LAND_TILES: NavItem[] = [
  {
    labelKey: 'nav.newPropertyRequest',
    route: '/property-requests/new',
    icon: 'doc',
    requiredPermission: ['profile.view_own'],
    requiredRoles: MEMBER_ONLY,
  },
  {
    labelKey: 'nav.neighbours',
    route: '/neighbours',
    icon: 'pin',
    requiredPermission: ['neighbour.view'],
    requiredRoles: MEMBER_ONLY,
  },
  {
    labelKey: 'nav.plotMap',
    route: '/plot-map',
    icon: 'map',
    requiredPermission: ['boundary.view'],
    requiredRoles: MEMBER_ONLY,
  },
];

/** "সংগঠন" hub tiles. Complaint-related tiles share one "অভিযোগ / সাহায্য" heading when nav_merged_entries is on. */
export const ORGANISATION_TILES: NavItem[] = [
  { labelKey: 'nav.notices', route: '/notices', icon: 'doc', requiredPermission: ['notice.view'] },
  { labelKey: 'nav.events', route: '/events', icon: 'pin', requiredPermission: ['event.view'] },
  {
    labelKey: 'nav.meetingDecisions',
    route: '/resolution-book',
    icon: 'doc',
    requiredPermission: ['profile.view_own', 'member.view_all'],
  },
  { labelKey: 'nav.accounts', route: '/fund-transparency', icon: 'chart', openAccess: true },
  { labelKey: 'nav.ourPlan', route: '/roadmap', icon: 'map', openAccess: true },
  {
    labelKey: 'nav.elections',
    route: '/elections',
    icon: 'check-circle',
    requiredPermission: ['election.vote', 'election.candidate'],
    requiredRoles: MEMBER_ONLY,
  },
  {
    labelKey: 'nav.welfareFund',
    route: '/welfare-fund',
    icon: 'coin',
    requiredPermission: ['welfare_fund.apply'],
    requiredRoles: MEMBER_ONLY,
  },
  {
    labelKey: 'nav.complaintsHelp',
    route: '/complaints',
    icon: 'inbox',
    requiredPermission: ['profile.view_own'],
    requiredRoles: MEMBER_ONLY,
    group: 'help',
  },
  {
    labelKey: 'nav.landProtection',
    route: '/complaints/land-protection',
    icon: 'shield',
    requiredPermission: ['land_complaint.create'],
    group: 'help',
  },
  {
    labelKey: 'nav.serviceStandard',
    route: '/service-standard',
    icon: 'check-circle',
    requiredPermission: ['service_standard.view'],
    group: 'help',
  },
  { labelKey: 'help.desk', route: '/emergency-help', icon: 'alert', openAccess: true, group: 'help' },
  {
    labelKey: 'nav.petitions',
    route: '/petitions',
    icon: 'doc',
    requiredPermission: ['petition.create'],
    requiredRoles: MEMBER_ONLY,
    group: 'more',
  },
  {
    labelKey: 'nav.amendments',
    route: '/amendments',
    icon: 'doc',
    requiredPermission: ['amendment.propose', 'service_standard.view'],
    group: 'more',
  },
];

/** Links shown on the profile page (the profile area's own sub-pages). */
export const PROFILE_TILES: NavItem[] = [
  {
    labelKey: 'nav.myMembership',
    route: '/membership',
    icon: 'id-card',
    requiredPermission: ['profile.view_own'],
    requiredRoles: MEMBER_ONLY,
  },
  { labelKey: 'nav.changePassword', route: '/change-password', icon: 'lock', requiredPermission: ['profile.view_own'] },
];

/** The old payment pages stay in the drawer while the merged page is off. */
export const LEGACY_PAYMENT_ROUTES: readonly string[] = ['/installments', '/other-fees', '/cost-shares'];

export interface AreaFlags {
  payMerged: boolean;
}

/** The areas, with the payments tab pointing at the page that is live for the current flags. */
export function memberAreaItems(flags: AreaFlags): NavItem[] {
  return MEMBER_AREAS.map((a) => (a.area === 'payments' && !flags.payMerged ? { ...a, route: '/installments' } : a));
}

/** Which area a URL belongs to (query and fragment ignored); null for non-member pages. */
export function activeAreaFor(url: string): AreaKey | null {
  const path = url.split(/[?#]/)[0];
  const hit = MEMBER_AREAS.find((a) => a.prefixes?.some((p) => path === p || path.startsWith(`${p}/`)));
  return hit?.area ?? null;
}

/** Routes of the member sections of a nav (what must stay reachable). */
export function memberRoutesIn(sections: readonly NavSection[]): string[] {
  return sections
    .filter((s) => MEMBER_SECTION_KEYS.includes(s.labelKey))
    .flatMap((s) => s.items.map((i) => i.route));
}

/**
 * Everything a member can reach from the five areas, the two hubs, the
 * profile page links and the payments page. With the merged page on, the old
 * payment routes redirect to it; with it off they stay in the drawer.
 */
export function reachableRoutes(flags: AreaFlags): string[] {
  return [
    ...memberAreaItems(flags).map((a) => a.route),
    ...MY_LAND_TILES.map((t) => t.route),
    ...ORGANISATION_TILES.map((t) => t.route),
    ...PROFILE_TILES.map((t) => t.route),
    ...LEGACY_PAYMENT_ROUTES,
  ];
}

export function unreachableRoutes(required: readonly string[], reachable: Iterable<string>): string[] {
  const set = new Set(reachable);
  return required.filter((route) => !set.has(route));
}

/** The same visibility rule the sidebar uses for every item. */
export function isNavItemVisible(
  item: NavItem,
  role: UserRole | null,
  hasAnyPermission: (keys: string[]) => boolean,
): boolean {
  if (item.requiredPermission && !hasAnyPermission(item.requiredPermission)) return false;
  if (item.requiredRoles && (role === null || !item.requiredRoles.includes(role))) return false;
  return true;
}
