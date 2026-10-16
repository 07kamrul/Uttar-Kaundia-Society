import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bn from '../../../../public/i18n/bn.json';
import { AuthService } from '../../core/services/auth.service';
import { CostSharePaymentService } from '../../core/services/cost-share-payment.service';
import { FeatureFlagService, type FeatureFlagKey } from '../../core/services/feature-flag.service';
import { HelplineService } from '../../core/services/helpline.service';
import { LanguageService } from '../../core/services/language.service';
import { MemberService } from '../../core/services/member.service';
import { ThemeService } from '../../core/services/theme.service';
import { ShellComponent } from './shell.component';

@Component({ template: '' })
class DummyPage {}

const MEMBER_PERMISSIONS = [
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

interface Setup {
  flags?: FeatureFlagKey[];
  narrow?: boolean;
  helplineEnabled?: boolean;
  permissions?: string[];
  role?: 'member' | 'executive_committee';
}

function setup(opts: Setup = {}) {
  const permissions = opts.permissions ?? MEMBER_PERMISSIONS;
  const role = opts.role ?? 'member';
  const flags = new Set(opts.flags ?? []);
  const lang = { lang: signal<'bn' | 'en'>('bn'), toggle: vi.fn(), setLang: vi.fn() };
  const theme = { theme: signal<'light' | 'dark'>('light'), toggle: vi.fn() };
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ media: query, matches: !!opts.narrow, addEventListener: () => undefined, removeEventListener: () => undefined }),
  );
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService(),
      provideRouter([{ path: '**', component: DummyPage }]),
      {
        provide: AuthService,
        useValue: {
          role,
          hasPermission: (k: string) => permissions.includes(k),
          hasAnyPermission: (keys: string[]) => keys.some((k) => permissions.includes(k)),
          landingTier: () => (role === 'member' ? 'member' : 'management'),
          logout: vi.fn(),
        },
      },
      { provide: FeatureFlagService, useValue: { isEnabled: (k: FeatureFlagKey) => flags.has(k) } },
      { provide: LanguageService, useValue: lang },
      { provide: CostSharePaymentService, useValue: { pendingCounts: () => of({ installment: 2, costShare: 1, total: 3 }) } },
      { provide: ThemeService, useValue: theme },
      { provide: MemberService, useValue: { getProfile: () => of({ fullName: 'রহিম', memberId: 'M-1', memberPhotoUrl: undefined }) } },
      {
        provide: HelplineService,
        useValue: {
          helpline: signal({ phone: '+8801711000000', whatsapp: null, hoursText: null, enabled: !!opts.helplineEnabled }).asReadonly(),
          ensureLoaded: vi.fn(),
        },
      },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const fixture = TestBed.createComponent(ShellComponent);
  fixture.detectChanges();
  return { fixture, lang, theme, router: TestBed.inject(Router) };
}

type F = ReturnType<typeof setup>['fixture'];
const all = (f: F, sel: string) => [...(f.nativeElement as HTMLElement).querySelectorAll(sel)] as HTMLElement[];
const one = (f: F, sel: string) => (f.nativeElement as HTMLElement).querySelector(sel) as HTMLElement | null;
const sidebarHrefs = (f: F) => all(f, '.sidebar-link').map((a) => a.getAttribute('href'));
const sectionTitles = (f: F) => all(f, '.sidebar-section-label').map((e) => e.textContent?.trim());

afterEach(() => vi.unstubAllGlobals());

describe('ShellComponent with every new flag off (unchanged)', () => {
  it('keeps the old sections and the three separate payment entries', () => {
    const { fixture } = setup();
    expect(sectionTitles(fixture).slice(0, 3)).toEqual(['সাধারণ', 'আমার পেমেন্ট', 'সমাজ ও এলাকা']);
    const hrefs = sidebarHrefs(fixture);
    expect(hrefs.slice(0, 3)).toEqual(['/dashboard', '/profile', '/change-password']);
    expect(hrefs).toEqual(expect.arrayContaining(['/installments', '/other-fees', '/cost-shares', '/service-standard', '/emergency-help']));
    expect(hrefs).not.toContain('/payments');
    expect(hrefs).not.toContain('/my-land');
  });

  it('has no bottom bar, no help button, and keeps theme and language in the top menu', () => {
    const { fixture } = setup({ narrow: true, helplineEnabled: true });
    expect(one(fixture, '[data-testid="bottom-bar"]')).toBeNull();
    expect(one(fixture, 'app-help-fab')).toBeNull();
    expect(one(fixture, 'app-lang-switch')).toBeNull();
    (one(fixture, '.topbar-more-btn') as HTMLElement).click();
    fixture.detectChanges();
    expect(one(fixture, '.topbar-menu-panel')?.textContent).toContain('গাঢ় থিম');
  });
});

describe('ShellComponent with pay_merged_page', () => {
  it('shows one পেমেন্ট entry instead of three', () => {
    const off = setup();
    const offPayments = ['/installments', '/other-fees', '/cost-shares'].filter((h) => sidebarHrefs(off.fixture).includes(h));
    expect(offPayments.length).toBe(3);
    TestBed.resetTestingModule();

    const { fixture } = setup({ flags: ['pay_merged_page'] });
    const hrefs = sidebarHrefs(fixture);
    expect(hrefs).toContain('/payments');
    for (const old of ['/installments', '/other-fees', '/cost-shares']) expect(hrefs).not.toContain(old);
    const paymentsLink = all(fixture, '.sidebar-link').find((a) => a.getAttribute('href') === '/payments');
    expect(paymentsLink?.textContent).toContain('পেমেন্ট');
  });
});

describe('ShellComponent with nav_merged_entries', () => {
  it('drops emergency help and service standard from the menu once the help button is live', () => {
    const { fixture } = setup({ flags: ['nav_merged_entries'], helplineEnabled: true });
    const hrefs = sidebarHrefs(fixture);
    expect(hrefs).not.toContain('/emergency-help');
    expect(hrefs).not.toContain('/service-standard');
    expect(one(fixture, 'app-help-fab')).not.toBeNull();
  });

  it('keeps the old emergency help entry while the helpline is empty', () => {
    const { fixture } = setup({ flags: ['nav_merged_entries'], helplineEnabled: false });
    expect(sidebarHrefs(fixture)).toContain('/emergency-help');
    expect(one(fixture, '[data-testid="help-fab"]')).toBeNull();
  });

  it('does not show the help button to non-member tiers', () => {
    const { fixture } = setup({ flags: ['nav_merged_entries'], helplineEnabled: true, role: 'executive_committee' });
    expect(one(fixture, 'app-help-fab')).toBeNull();
  });
});

describe('ShellComponent with nav_five_areas', () => {
  const FIVE = ['/dashboard', '/installments', '/my-land', '/organisation', '/profile'];

  it('shows the five areas in the sidebar on a wide screen, with no bottom bar', () => {
    const { fixture } = setup({ flags: ['nav_five_areas'] });
    const hrefs = sidebarHrefs(fixture);
    expect(hrefs.slice(0, 5)).toEqual(FIVE);
    expect(hrefs).not.toContain('/neighbours');
    expect(one(fixture, '[data-testid="bottom-bar"]')).toBeNull();
  });

  it('sends the payments tab to /payments when pay_merged_page is on', () => {
    const { fixture } = setup({ flags: ['nav_five_areas', 'pay_merged_page'] });
    expect(sidebarHrefs(fixture).slice(0, 5)).toEqual(['/dashboard', '/payments', '/my-land', '/organisation', '/profile']);
  });

  it('keeps the three old payment pages in the drawer while pay_merged_page is off', () => {
    const { fixture } = setup({ flags: ['nav_five_areas'] });
    expect(sidebarHrefs(fixture)).toEqual(expect.arrayContaining(['/other-fees', '/cost-shares']));
  });

  it('on a narrow viewport shows a bottom bar with five labelled targets and puts only admin items in the drawer', () => {
    const { fixture } = setup({ flags: ['nav_five_areas'], narrow: true });
    const bar = one(fixture, '[data-testid="bottom-bar"]') as HTMLElement;
    const links = [...bar.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(FIVE);
    expect(links.map((a) => a.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'হোম',
      'পেমেন্ট',
      'আমার জমি',
      'সংগঠন',
      'আমার প্রোফাইল',
    ]);
    // A member has no admin sections, so the drawer holds no member areas (they are in the bar).
    expect(sidebarHrefs(fixture)).not.toContain('/my-land');
    expect(one(fixture, '.app-content')?.classList.contains('has-bottom-bar')).toBe(true);
  });

  it('highlights the parent area for a sub-page', async () => {
    const { fixture, router } = setup({ flags: ['nav_five_areas'], narrow: true });
    await router.navigateByUrl('/neighbours');
    fixture.detectChanges();
    const active = all(fixture, '[data-testid="bottom-bar"] a.active');
    expect(active.length).toBe(1);
    expect(active[0].getAttribute('href')).toBe('/my-land');
    expect(active[0].getAttribute('aria-current')).toBe('page');
    await router.navigateByUrl('/notices/5');
    fixture.detectChanges();
    expect(all(fixture, '[data-testid="bottom-bar"] a.active')[0].getAttribute('href')).toBe('/organisation');
  });

  it('shows the বাংলা | English switch in the header and moves the theme toggle out of the top menu', () => {
    const { fixture } = setup({ flags: ['nav_five_areas'] });
    const sw = one(fixture, 'app-lang-switch') as HTMLElement;
    expect(sw.textContent).toContain('বাংলা');
    expect(sw.textContent).toContain('English');
    (one(fixture, '.topbar-more-btn') as HTMLElement).click();
    fixture.detectChanges();
    const menu = one(fixture, '.topbar-menu-panel')?.textContent ?? '';
    expect(menu).not.toContain('গাঢ় থিম');
    expect(menu).toContain('বের হোন');
  });

  it('shows the help button for members when nav_merged_entries is on and a helpline exists', () => {
    const { fixture } = setup({ flags: ['nav_five_areas', 'nav_merged_entries'], helplineEnabled: true });
    expect(one(fixture, '[data-testid="help-fab"]')).not.toBeNull();
  });
});

describe('ShellComponent pending payments badge', () => {
  it('shows the combined pending count (installments + cost shares) on the payment verification entry', () => {
    const { fixture } = setup({ permissions: ['manage_finance'], role: 'executive_committee' });
    const link = all(fixture, '.sidebar-link').find((a) => a.getAttribute('href') === '/payment-verifications');
    expect(link?.querySelector('[data-testid="pending-badge"]')?.textContent).toContain('৩');
  });

  it('shows no badge to accounts without manage_finance', () => {
    const { fixture } = setup();
    expect(one(fixture, '[data-testid="pending-badge"]')).toBeNull();
  });
});

describe('ShellComponent sidebar search and collapsible sections', () => {
  let store: Map<string, string>;
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', localStorage);
  });

  it('filters links by translated label and shows an empty state when nothing matches', () => {
    const { fixture } = setup();
    fixture.componentInstance.navQuery.set('প্রোফাইল');
    fixture.detectChanges();
    expect(sidebarHrefs(fixture)).toContain('/profile');
    expect(sidebarHrefs(fixture)).not.toContain('/dashboard');

    fixture.componentInstance.navQuery.set('zzz-no-match');
    fixture.detectChanges();
    expect(sidebarHrefs(fixture)).toEqual([]);
    expect(one(fixture, '.sidebar-empty')).not.toBeNull();
  });

  it('collapses a section on header click and remembers it', () => {
    const { fixture } = setup();
    const payments = all(fixture, '.sidebar-section-title')[1];
    payments.click();
    fixture.detectChanges();
    expect(sidebarHrefs(fixture)).not.toContain('/installments');
    expect(payments.getAttribute('aria-expanded')).toBe('false');
    expect(localStorage.getItem('uks.sidebar.collapsed')).toContain('nav.section.payments');
  });

  it('keeps a collapsed section open while searching', () => {
    localStorage.setItem('uks.sidebar.collapsed', JSON.stringify(['nav.section.payments']));
    const { fixture } = setup();
    expect(sidebarHrefs(fixture)).not.toContain('/installments');
    fixture.componentInstance.navQuery.set('কিস্তি');
    fixture.detectChanges();
    expect(sidebarHrefs(fixture)).toContain('/installments');
  });
});

describe('ShellComponent collapsible desktop sidebar', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });

  it('starts expanded and collapses to an icon rail on a wide screen, remembering the choice', () => {
    const { fixture } = setup();
    const toggle = one(fixture, '.topbar-menu-btn:not(.topbar-more-btn)')!;
    expect(one(fixture, '.sidebar')!.classList).not.toContain('sidebar-rail');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    fixture.detectChanges();
    expect(one(fixture, '.sidebar')!.classList).toContain('sidebar-rail');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(store.get('uks.sidebar.rail')).toBe('1');
    expect(fixture.componentInstance.sidebarOpen()).toBe(false);
  });

  it('restores the collapsed rail from storage', () => {
    store.set('uks.sidebar.rail', '1');
    const { fixture } = setup();
    expect(one(fixture, '.sidebar')!.classList).toContain('sidebar-rail');
  });

  it('keeps the drawer behaviour on a narrow screen', () => {
    const { fixture } = setup({ narrow: true });
    one(fixture, '.topbar-menu-btn:not(.topbar-more-btn)')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.sidebarOpen()).toBe(true);
    expect(one(fixture, '.sidebar')!.classList).not.toContain('sidebar-rail');
  });

  it('expands the rail when the search icon is used', () => {
    store.set('uks.sidebar.rail', '1');
    const { fixture } = setup();
    one(fixture, '.sidebar-search-expand')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.sidebarCollapsed()).toBe(false);
  });

  it('falls back to expanded when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const { fixture } = setup();
    expect(fixture.componentInstance.sidebarCollapsed()).toBe(false);
    expect(() => fixture.componentInstance.toggleSidebar()).not.toThrow();
  });
});
