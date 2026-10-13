import { describe, expect, it } from 'vitest';
import type { Route } from '@angular/router';
import { routes } from '../../app.routes';
import { NAV_SECTIONS } from './nav-config';
import {
  MEMBER_AREAS,
  MEMBER_SECTION_KEYS,
  MY_LAND_TILES,
  ORGANISATION_TILES,
  PROFILE_TILES,
  activeAreaFor,
  memberAreaItems,
  memberRoutesIn,
  reachableRoutes,
  unreachableRoutes,
} from './nav-areas';

const FLAG_COMBOS = [
  { payMerged: false },
  { payMerged: true },
];

/** Every non-empty path in the (flat, wrapper-nested) route config, as "/path". */
function declaredPaths(list: Route[]): string[] {
  return list.flatMap((r) => [
    ...(r.path && r.path !== '**' ? [`/${r.path}`] : []),
    ...(r.children ? declaredPaths(r.children) : []),
  ]);
}

describe('five-area navigation mapping guard', () => {
  it('lists exactly the five agreed areas in order', () => {
    expect(MEMBER_AREAS.map((a) => a.labelKey)).toEqual([
      'nav.home',
      'nav.payments',
      'nav.myLand',
      'nav.organisation',
      'nav.myProfile',
    ]);
    expect(MEMBER_AREAS.map((a) => a.route)).toEqual(['/dashboard', '/payments', '/my-land', '/organisation', '/profile']);
  });

  it.each(FLAG_COMBOS)('every member NAV_SECTIONS route is reachable from an area or hub (%o)', (flags) => {
    const missing = unreachableRoutes(memberRoutesIn(NAV_SECTIONS), reachableRoutes(flags));
    expect(missing).toEqual([]);
  });

  it('the checker really fails when a route is not reachable', () => {
    const reachable = new Set(reachableRoutes({ payMerged: true }));
    reachable.delete('/neighbours');
    expect(unreachableRoutes(memberRoutesIn(NAV_SECTIONS), reachable)).toEqual(['/neighbours']);
  });

  it('only member sections count; admin routes are not required to be reachable', () => {
    const member = memberRoutesIn(NAV_SECTIONS);
    expect(member).toContain('/installments');
    expect(member).toContain('/emergency-help');
    expect(member).not.toContain('/members');
    expect(MEMBER_SECTION_KEYS.length).toBe(3);
  });

  it('every area and tile route points at a route that exists in the router config', () => {
    const paths = new Set(declaredPaths(routes).map((p) => p.replace(/\/:[^/]+/g, '')));
    const all = [...MEMBER_AREAS, ...MY_LAND_TILES, ...ORGANISATION_TILES, ...PROFILE_TILES].map((i) => i.route);
    const unknown = all.filter((route) => !paths.has(route));
    expect(unknown).toEqual([]);
  });

  it('keeps old payment routes in the router (nothing deleted)', () => {
    const paths = declaredPaths(routes);
    for (const route of ['/installments', '/other-fees', '/cost-shares', '/payments', '/emergency-help']) {
      expect(paths).toContain(route);
    }
  });

  it('highlights the parent area for sub-pages, ignoring query strings', () => {
    expect(activeAreaFor('/dashboard')).toBe('home');
    expect(activeAreaFor('/payments?kind=installment')).toBe('payments');
    expect(activeAreaFor('/installments')).toBe('payments');
    expect(activeAreaFor('/neighbours')).toBe('my-land');
    expect(activeAreaFor('/property-requests/new')).toBe('my-land');
    expect(activeAreaFor('/complaints/land-protection')).toBe('organisation');
    expect(activeAreaFor('/notices/12')).toBe('organisation');
    expect(activeAreaFor('/change-password')).toBe('profile');
    expect(activeAreaFor('/members')).toBeNull();
  });

  it('routes the payments tab to the old page while pay_merged_page is off', () => {
    expect(memberAreaItems({ payMerged: false }).find((a) => a.area === 'payments')?.route).toBe('/installments');
    expect(memberAreaItems({ payMerged: true }).find((a) => a.area === 'payments')?.route).toBe('/payments');
  });
});
