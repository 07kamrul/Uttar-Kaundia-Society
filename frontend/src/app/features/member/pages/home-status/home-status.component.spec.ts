import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import type { EventItem, Notice } from '../../../../core/models/content.model';
import { ContentService } from '../../../../core/services/content.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { InstallmentPaymentService } from '../../../../core/services/installment-payment.service';
import { MemberPaymentsService } from '../../../../core/services/member-payments.service';
import { MemberService, type MemberProfile } from '../../../../core/services/member.service';
import { HomeStatusComponent, nextStepOf } from './home-status.component';
import { makeSummary } from '../payments/payments.fixtures';

const property = (dag?: string) => ({ id: 1, propertyType: [], dagNoCs: dag, coOwners: [], applicableDocs: [] });

function profile(overrides: Partial<MemberProfile> = {}): MemberProfile {
  return {
    memberId: 'M-1',
    status: 'approved',
    fullName: 'রহিম',
    fatherOrHusband: '',
    mother: '',
    dob: '',
    mobile: '',
    showInNeighbourDirectory: true,
    properties: [property('১২৩')],
    nominees: [],
    ...overrides,
  } as MemberProfile;
}

const notice = (id: string, title: string, at: string): Notice =>
  ({ id, title, body: '', categoryId: null, isPublished: true, isMembersOnly: false, publishAt: at, createdAt: at, updatedAt: at }) as Notice;
const event = (id: string, title: string, startAt: string): EventItem =>
  ({ id, title, description: null, location: 'মসজিদ মাঠ', categoryId: null, startAt, endAt: null, isPublished: true, isMembersOnly: false, createdAt: startAt, updatedAt: startAt }) as EventItem;

describe('nextStepOf', () => {
  it('says the office is checking while the application is pending', () => {
    expect(nextStepOf({ status: 'pending', needsDag: true, totalDue: 500 })).toEqual({ kind: 'pending' });
  });
  it('asks for the dag number at the office before dues', () => {
    expect(nextStepOf({ status: 'approved', needsDag: true, totalDue: 500 })).toEqual({ kind: 'needs_dag' });
  });
  it('shows the dues amount to pay', () => {
    expect(nextStepOf({ status: 'approved', needsDag: false, totalDue: 500 })).toEqual({ kind: 'dues', amount: 500 });
  });
  it('says all is well otherwise', () => {
    expect(nextStepOf({ status: 'approved', needsDag: false, totalDue: 0 })).toEqual({ kind: 'ok' });
  });
  it('does not guess when the dues are not loaded yet', () => {
    expect(nextStepOf({ status: 'approved', needsDag: false, totalDue: null })).toEqual({ kind: 'ok' });
  });
});

interface Opts {
  profile?: Observable<MemberProfile>;
  summary?: Observable<unknown>;
  payable?: Observable<unknown>;
  notices?: Observable<Notice[]>;
  events?: Observable<EventItem[]>;
  payMerged?: boolean;
}

async function setup(opts: Opts = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService(),
      provideRouter([{ path: 'dashboard', component: HomeStatusComponent }]),
      { provide: FeatureFlagService, useValue: { isEnabled: (k: string) => !!opts.payMerged && k === 'pay_merged_page' } },
      { provide: MemberService, useValue: { getProfile: () => opts.profile ?? of(profile()) } },
      { provide: MemberPaymentsService, useValue: { summary: () => opts.summary ?? of(makeSummary({ totalDue: 0, dues: [] })) } },
      { provide: InstallmentPaymentService, useValue: { getPayable: () => opts.payable ?? of({ due: [], pendingInstallmentIds: [], totalDue: 0, accounts: [], payments: [] }) } },
      {
        provide: ContentService,
        useValue: { listNotices: () => opts.notices ?? of([]), listEvents: () => opts.events ?? of([]) },
      },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const h = await RouterTestingHarness.create();
  await h.navigateByUrl('/dashboard', HomeStatusComponent);
  h.detectChanges();
  return h;
}

const q = (h: RouterTestingHarness, sel: string) => h.routeNativeElement?.querySelector(sel) as HTMLElement | null;

describe('HomeStatusComponent', () => {
  it('shows "অফিস যাচাই করছে" for a pending application', async () => {
    const h = await setup({ profile: of(profile({ status: 'pending' })) });
    expect(q(h, '[data-testid="next-step"]')?.textContent).toContain('অফিস যাচাই করছে');
  });

  it('asks for the dag number when a property has none', async () => {
    const h = await setup({ profile: of(profile({ properties: [property(undefined)] })) });
    expect(q(h, '[data-testid="next-step"]')?.textContent).toContain('অফিসে দাগ নম্বর দিন');
  });

  it('uses needs_dag from the profile response when the server sends it', async () => {
    const withDagButFlagged = await setup({ profile: of(profile({ needsDag: true, properties: [property('১২৩')] })) });
    expect(q(withDagButFlagged, '[data-testid="next-step"]')?.textContent).toContain('অফিসে দাগ নম্বর দিন');
  });

  it('trusts needs_dag=false even when a property has no dag number', async () => {
    const h = await setup({ profile: of(profile({ needsDag: false, properties: [property(undefined)] })) });
    expect(q(h, '[data-testid="next-step"]')?.textContent).not.toContain('অফিসে দাগ নম্বর দিন');
    expect(q(h, '[data-testid="next-step"]')?.textContent).toContain('সব ঠিক আছে');
  });

  it('shows the dues and a পেমেন্ট করুন action to the merged page', async () => {
    const h = await setup({ payMerged: true, summary: of(makeSummary({ totalDue: 700 })) });
    const step = q(h, '[data-testid="next-step"]') as HTMLElement;
    expect(step.textContent).toContain('বকেয়া');
    expect(step.textContent).toContain('৭০০');
    expect(step.textContent).toContain('পেমেন্ট করুন');
    const pay = q(h, '[data-testid="dues-pay"]') as HTMLAnchorElement;
    expect(pay.getAttribute('href')).toBe('/payments?pay=1');
  });

  it('falls back to the installment payable endpoint when the merged page is off', async () => {
    const h = await setup({
      payMerged: false,
      payable: of({ due: [], pendingInstallmentIds: [], totalDue: 400, accounts: [], payments: [] }),
    });
    expect(q(h, '[data-testid="next-step"]')?.textContent).toContain('৪০০');
    expect((q(h, '[data-testid="dues-pay"]') as HTMLAnchorElement).getAttribute('href')).toBe('/installments?pay=1');
  });

  it('says "সব ঠিক আছে" when nothing is pending, missing or due', async () => {
    const h = await setup();
    expect(q(h, '[data-testid="next-step"]')?.textContent).toContain('সব ঠিক আছে');
  });

  it('shows the latest notice and the next upcoming event', async () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const later = new Date(Date.now() + 9 * 86_400_000).toISOString();
    const past = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const h = await setup({
      notices: of([notice('1', 'পুরোনো নোটিশ', '2026-01-01T00:00:00Z'), notice('2', 'নতুন নোটিশ', '2026-10-01T00:00:00Z')]),
      events: of([event('1', 'পুরোনো সভা', past), event('2', 'দূরের সভা', later), event('3', 'কাছের সভা', future)]),
    });
    expect(q(h, '[data-testid="card-notice"]')?.textContent).toContain('সর্বশেষ নোটিশ');
    expect(q(h, '[data-testid="card-notice"]')?.textContent).toContain('নতুন নোটিশ');
    expect(q(h, '[data-testid="card-event"]')?.textContent).toContain('পরবর্তী অনুষ্ঠান');
    expect(q(h, '[data-testid="card-event"]')?.textContent).toContain('কাছের সভা');
    expect(q(h, '[data-testid="card-event"]')?.textContent).not.toContain('পুরোনো সভা');
  });

  it('shows friendly empty texts when there is no notice or event', async () => {
    const h = await setup();
    expect(q(h, '[data-testid="card-notice"]')?.textContent).toContain('এখন কোনো নোটিশ নেই');
    expect(q(h, '[data-testid="card-event"]')?.textContent).toContain('কোনো অনুষ্ঠান ঠিক হয়নি');
  });

  it('keeps each card independent: a failing notice card shows its own retry while the rest still render', async () => {
    const notices = vi.fn<() => Observable<Notice[]>>().mockReturnValueOnce(throwError(() => new Error('x')));
    const h = await setup({ notices: notices() });
    expect(q(h, '[data-testid="card-notice"] [data-testid="retry"]')).not.toBeNull();
    expect(q(h, '[data-testid="next-step"]')?.textContent).toContain('সব ঠিক আছে');
    expect(q(h, '[data-testid="card-event"] [data-testid="retry"]')).toBeNull();
  });

  it('offers a big-button grid of six shortcuts and uses no tables', async () => {
    const h = await setup();
    expect(h.routeNativeElement?.querySelectorAll('[data-testid="shortcut"]').length).toBe(6);
    expect(h.routeNativeElement?.querySelector('table')).toBeNull();
  });
});
