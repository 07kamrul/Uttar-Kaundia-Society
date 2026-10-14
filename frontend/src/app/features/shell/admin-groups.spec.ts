import { describe, expect, it } from 'vitest';
import type { Route } from '@angular/router';
import { routes } from '../../app.routes';
import { MANAGEMENT_ROUTES } from '../../management.routes';
import { ADMIN_SECTION_KEYS, adminGroups, ADMIN_MERGED_ROUTES } from './admin-groups';
import { NAV_SECTIONS } from './nav-config';

function declaredPaths(list: Route[]): string[] {
  return list.flatMap((r) => [
    ...(r.path && r.path !== '**' ? [`/${r.path}`] : []),
    ...(r.children ? declaredPaths(r.children) : []),
  ]);
}

const ADMIN_ROUTES = NAV_SECTIONS.filter((s) => ADMIN_SECTION_KEYS.includes(s.labelKey)).flatMap((s) =>
  s.items.map((i) => i.route),
);

describe('admin menu groups guard', () => {
  it.each([{ adminConsole: false }, { adminConsole: true }])(
    'has the four groups plus Advanced (%o)',
    (flags) => {
      const groups = adminGroups(flags);
      expect(groups.map((g) => g.labelKey)).toEqual([
        'nav.group.applicationsMembers',
        'nav.group.money',
        'nav.group.organisation',
        'nav.group.settings',
        'nav.group.advanced',
      ]);
      expect(groups[4].collapsible).toBe(true);
    },
  );

  it.each([{ adminConsole: false }, { adminConsole: true }])(
    'every admin route of NAV_SECTIONS appears in exactly one group (%o)',
    (flags) => {
      const merged = flags.adminConsole ? ADMIN_MERGED_ROUTES : {};
      const shown = adminGroups(flags).flatMap((g) => g.items.map((i) => i.route));
      expect(new Set(shown).size).toBe(shown.length);
      for (const route of ADMIN_ROUTES) {
        const target = (merged as Record<string, string>)[route] ?? route;
        expect(shown.filter((r) => r === target), route).toHaveLength(1);
      }
    },
  );

  it('with admin_console off the old queues and the notices/events pages stay separate', () => {
    const shown = adminGroups({ adminConsole: false }).flatMap((g) => g.items.map((i) => i.route));
    expect(shown).toEqual(expect.arrayContaining(['/submissions', '/membership-review', '/notices-management', '/events-management']));
    expect(shown).not.toContain('/applications');
    expect(shown).not.toContain('/phone-fixes');
  });

  it('with admin_console on the merged pages replace them', () => {
    const shown = adminGroups({ adminConsole: true }).flatMap((g) => g.items.map((i) => i.route));
    expect(shown).toEqual(expect.arrayContaining(['/applications', '/notices-events', '/phone-fixes']));
    expect(shown).not.toContain('/submissions');
    expect(shown).not.toContain('/notices-management');
  });

  it('puts the technical pages under Advanced, each with a one-line explanation', () => {
    const advanced = adminGroups({ adminConsole: true }).find((g) => g.labelKey === 'nav.group.advanced');
    expect(advanced?.items.map((i) => i.route)).toEqual([
      '/roles',
      '/config-lists',
      '/audit-log',
      '/amendments-admin',
      '/advanced/cache',
      '/advanced/login-readiness',
    ]);
    expect(advanced?.items.every((i) => !!i.descriptionKey)).toBe(true);
  });

  it.each([{ adminConsole: false }, { adminConsole: true }])('every grouped route exists in the router (%o)', (flags) => {
    const known = new Set([...declaredPaths(routes), ...declaredPaths(MANAGEMENT_ROUTES)].map((p) => p.replace(/\/:[^/]+/g, '')));
    const missing = adminGroups(flags)
      .flatMap((g) => g.items.map((i) => i.route))
      .filter((r) => !known.has(r));
    expect(missing).toEqual([]);
  });

  it('guards the new pages with the permission the contract names', () => {
    const byRoute = new Map(adminGroups({ adminConsole: true }).flatMap((g) => g.items).map((i) => [i.route, i]));
    expect(byRoute.get('/applications')?.requiredPermission).toEqual(['membership.review', 'membership_application.manage']);
    expect(byRoute.get('/phone-fixes')?.requiredPermission).toEqual(['member.manage']);
    expect(byRoute.get('/advanced/cache')?.requiredPermission).toEqual(['manage_system_config']);
    expect(byRoute.get('/advanced/login-readiness')?.requiredPermission).toEqual(['manage_system_config']);
    expect(byRoute.get('/notices-events')?.requiredPermission).toEqual(['manage_notices']);
  });
});
