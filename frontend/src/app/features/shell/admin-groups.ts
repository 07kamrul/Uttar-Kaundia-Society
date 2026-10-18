import { NAV_SECTIONS, type NavItem, type NavSection } from './nav-config';

/** The two NAV_SECTIONS sections that hold admin pages (the rest is member-facing). */
export const ADMIN_SECTION_KEYS: readonly string[] = ['nav.section.management', 'nav.section.administration'];

/** With admin_console on, these old entries are replaced by one merged page each. */
export const ADMIN_MERGED_ROUTES: Readonly<Record<string, string>> = {
  '/submissions': '/applications',
  '/membership-review': '/applications',
  '/notices-management': '/notices-events',
  '/events-management': '/notices-events',
};

export interface AdminGroupFlags {
  /** admin_console: merged queue, notices + events and phone-fix pages. */
  adminConsole: boolean;
}

const LEGACY_ITEMS = new Map<string, NavItem>(
  NAV_SECTIONS.filter((s) => ADMIN_SECTION_KEYS.includes(s.labelKey))
    .flatMap((s) => s.items)
    .map((item) => [item.route, item]),
);

const NEW_ITEMS: Readonly<Record<string, NavItem>> = {
  '/applications': {
    labelKey: 'nav.applications',
    route: '/applications',
    icon: 'inbox',
    requiredPermission: ['membership.review', 'membership_application.manage'],
  },
  '/notices-events': {
    labelKey: 'nav.noticesEvents',
    route: '/notices-events',
    icon: 'doc',
    requiredPermission: ['manage_notices'],
  },
  '/phone-fixes': {
    labelKey: 'nav.phoneFixes',
    route: '/phone-fixes',
    icon: 'user',
    requiredPermission: ['member.manage'],
  },
  '/advanced/cache': {
    labelKey: 'nav.cacheStats',
    route: '/advanced/cache',
    icon: 'chart',
    requiredPermission: ['manage_system_config'],
    descriptionKey: 'nav.desc.cacheStats',
  },
  '/advanced/login-readiness': {
    labelKey: 'nav.loginReadiness',
    route: '/advanced/login-readiness',
    icon: 'lock',
    requiredPermission: ['manage_system_config'],
    descriptionKey: 'nav.desc.loginReadiness',
  },
};

const ADVANCED_DESCRIPTIONS: Readonly<Record<string, string>> = {
  '/roles': 'nav.desc.roles',
  '/config-lists': 'nav.desc.configLists',
  '/audit-log': 'nav.desc.auditLog',
  '/amendments-admin': 'nav.desc.amendments',
};

function pick(route: string, withDescription = false): NavItem {
  const item = NEW_ITEMS[route] ?? LEGACY_ITEMS.get(route);
  if (!item) throw new Error(`Unknown admin nav route ${route}`);
  const descriptionKey = withDescription ? ADVANCED_DESCRIPTIONS[route] : undefined;
  return descriptionKey ? { ...item, descriptionKey } : item;
}

function group(labelKey: string, routes: readonly string[], collapsible = false): NavSection {
  return { labelKey, items: routes.map((r) => pick(r, collapsible)), ...(collapsible ? { collapsible } : {}) };
}

/**
 * The admin menu with nav_advanced_section on: four plain groups and a
 * collapsed Advanced one. Every admin entry of NAV_SECTIONS lives in exactly
 * one of them (admin-groups.spec.ts fails otherwise).
 */
export function adminGroups(flags: AdminGroupFlags): NavSection[] {
  const c = flags.adminConsole;
  return [
    group('nav.group.applicationsMembers', [
      ...(c ? ['/applications'] : ['/submissions', '/membership-review']),
      '/members',
      '/property-requests',
      '/membership-governance',
      ...(c ? ['/phone-fixes'] : []),
    ]),
    group('nav.group.money', [
      '/payment-verifications',
      '/installments-management',
      '/fees-management',
      '/finance-management',
      '/society-costs',
      '/fund-controls',
    ]),
    group('nav.group.organisation', [
      ...(c ? ['/notices-events'] : ['/notices-management', '/events-management']),
      '/complaints-admin',
      '/committee-registry',
      '/elections-admin',
      '/welfare-activities',
      '/plot-boundaries',
      '/asset-register',
    ]),
    group('nav.group.settings', ['/fee-settings', '/payment-accounts', '/roadmap-management']),
    group(
      'nav.group.advanced',
      ['/roles', '/config-lists', '/audit-log', '/amendments-admin', '/advanced/cache', '/advanced/login-readiness'],
      true,
    ),
  ];
}
