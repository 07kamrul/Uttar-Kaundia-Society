import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { AuthService } from '../../../../core/services/auth.service';
import { ElectionsService } from '../../../../core/services/elections.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { HubComponent } from './hub.component';

const ALL_PERMISSIONS = [
  'profile.view_own',
  'neighbour.view',
  'boundary.view',
  'notice.view',
  'event.view',
  'election.vote',
  'welfare_fund.apply',
  'land_complaint.create',
  'service_standard.view',
  'petition.create',
  'amendment.propose',
];

async function setup(opts: {
  hub: 'my-land' | 'organisation';
  permissions?: string[];
  mergedEntries?: boolean;
  elections?: unknown;
}) {
  const permissions = opts.permissions ?? ALL_PERMISSIONS;
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService(),
      provideRouter([{ path: 'hub', component: HubComponent, data: { hub: opts.hub } }]),
      { provide: AuthService, useValue: { role: 'member', hasAnyPermission: (keys: string[]) => keys.some((k) => permissions.includes(k)) } },
      { provide: FeatureFlagService, useValue: { isEnabled: (k: string) => !!opts.mergedEntries && k === 'nav_merged_entries' } },
      {
        provide: ElectionsService,
        useValue: {
          listElections: () =>
            opts.elections === 'error' ? throwError(() => new Error('x')) : of(opts.elections ?? { items: [], today: '2026-10-13' }),
        },
      },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/hub', HubComponent);
  harness.detectChanges();
  return harness;
}

const tiles = (h: RouterTestingHarness) =>
  [...(h.routeNativeElement?.querySelectorAll('[data-testid="hub-tile"]') ?? [])] as HTMLAnchorElement[];
const hrefs = (h: RouterTestingHarness) => tiles(h).map((a) => a.getAttribute('href'));

describe('HubComponent', () => {
  it('"আমার জমি" lists property requests, neighbours and the plot map', async () => {
    const h = await setup({ hub: 'my-land' });
    expect(h.routeNativeElement?.querySelector('h1')?.textContent).toContain('আমার জমি');
    expect(hrefs(h)).toEqual(['/property-requests/new', '/neighbours', '/plot-map']);
  });

  it('applies the same permission rules as the old menu', async () => {
    const h = await setup({ hub: 'my-land', permissions: ['profile.view_own'] });
    expect(hrefs(h)).toEqual(['/property-requests/new']);
  });

  it('"সংগঠন" has notices, events, meeting decisions, accounts, plan, elections, welfare and the help tiles', async () => {
    const h = await setup({ hub: 'organisation' });
    expect(hrefs(h)).toEqual(
      expect.arrayContaining([
        '/notices',
        '/events',
        '/resolution-book',
        '/fund-transparency',
        '/roadmap',
        '/elections',
        '/welfare-fund',
        '/complaints',
        '/complaints/land-protection',
        '/service-standard',
        '/emergency-help',
        '/petitions',
        '/amendments',
      ]),
    );
  });

  it('keeps petitions and amendments under "আরও"', async () => {
    const h = await setup({ hub: 'organisation' });
    const more = h.routeNativeElement?.querySelector('[data-testid="group-more"]') as HTMLElement;
    expect(more.textContent).toContain('আরও');
    expect(more.querySelectorAll('[data-testid="hub-tile"]').length).toBe(2);
  });

  it('groups complaints, land protection, service standard and help desk under "অভিযোগ / সাহায্য" only with nav_merged_entries', async () => {
    const on = await setup({ hub: 'organisation', mergedEntries: true });
    const group = on.routeNativeElement?.querySelector('[data-testid="group-help"]') as HTMLElement;
    expect(group.textContent).toContain('অভিযোগ / সাহায্য');
    expect(group.querySelectorAll('[data-testid="hub-tile"]').length).toBe(4);
  });

  it('shows the same help tiles as plain tiles (no heading) when nav_merged_entries is off', async () => {
    const off = await setup({ hub: 'organisation', mergedEntries: false });
    expect(off.routeNativeElement?.querySelector('[data-testid="group-help"]')).toBeNull();
    expect(hrefs(off)).toContain('/service-standard');
  });

  it('pins elections to the top with a badge while an election is active', async () => {
    const h = await setup({
      hub: 'organisation',
      elections: {
        today: '2026-10-13',
        items: [{ id: 1, title: 'নির্বাচন', status: 'voting' }],
      },
    });
    expect(hrefs(h)[0]).toBe('/elections');
    expect(tiles(h)[0].textContent).toContain('নির্বাচন চলছে');
  });

  it('does not pin elections when none is active or the lookup fails', async () => {
    const quiet = await setup({
      hub: 'organisation',
      elections: { today: '2026-10-13', items: [{ id: 1, title: 'x', status: 'confirmed' }] },
    });
    expect(hrefs(quiet)[0]).not.toBe('/elections');
  });

  it('survives an elections lookup error', async () => {
    const h = await setup({ hub: 'organisation', elections: 'error' });
    expect(tiles(h).length).toBeGreaterThan(5);
  });
});
