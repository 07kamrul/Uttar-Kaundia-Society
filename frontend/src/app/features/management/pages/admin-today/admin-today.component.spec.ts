import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { AdminTodayService, type AdminToday } from '../../../../core/services/admin-today.service';
import { AdminTodayComponent, todayCards } from './admin-today.component';

const FULL: AdminToday = {
  asOf: '2026-10-13T08:00:00Z',
  applications: { registrationsPending: 4, membershipApplicationsOpen: 2, total: 6 },
  needsDag: 1,
  paymentVerifications: { installment: 3, costShare: 1, total: 4 },
  complaints: { open: 7, dueSoon: 2, overdue: 1 },
  propertyRequests: { pending: 2 },
  boundaries: { pending: 3 },
  committeeTerms: { expiringSoon: 1, expired: 0, windowDays: 60 },
  phoneFixes: { open: 5 },
};

const NOTHING: AdminToday = {
  asOf: 'x',
  applications: null,
  needsDag: null,
  paymentVerifications: null,
  complaints: null,
  propertyRequests: null,
  boundaries: null,
  committeeTerms: null,
  phoneFixes: null,
};

function setup(today$: ReturnType<AdminTodayService['today']>) {
  const today = vi.fn(() => today$);
  TestBed.configureTestingModule({
    imports: [AdminTodayComponent],
    providers: [provideRouter([]), provideTranslateService(), { provide: AdminTodayService, useValue: { today } }],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const fixture = TestBed.createComponent(AdminTodayComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, today, cards: () => [...el.querySelectorAll<HTMLElement>('[data-testid="today-card"]')] };
}

describe('todayCards', () => {
  it('builds one card per non-null section with its queue link and filter', () => {
    const byKey = Object.fromEntries(todayCards(FULL).map((c) => [c.key, c]));
    expect(Object.keys(byKey)).toEqual([
      'applications',
      'needs-dag',
      'payments',
      'complaints',
      'property-requests',
      'boundaries',
      'committee-terms',
      'phone-fixes',
    ]);
    expect(byKey['applications']).toMatchObject({ count: 6, link: '/applications', query: { tab: 'registrations' } });
    expect(byKey['needs-dag']).toMatchObject({ count: 1, link: '/submissions', query: { needs_dag: '1' } });
    expect(byKey['payments']).toMatchObject({ count: 4, link: '/payment-verifications', query: { status: 'pending' } });
    expect(byKey['complaints']).toMatchObject({ count: 7, overdue: 1, dueSoon: 2, link: '/complaints-admin', query: { sla: 'overdue' } });
    expect(byKey['phone-fixes']).toMatchObject({ count: 5, link: '/phone-fixes' });
    expect(byKey['committee-terms']).toMatchObject({ count: 1, link: '/committee-registry' });
  });

  it('hides sections the admin may not see (null)', () => {
    expect(todayCards(NOTHING)).toEqual([]);
    const finance = todayCards({ ...NOTHING, paymentVerifications: { installment: 1, costShare: 0, total: 1 } });
    expect(finance.map((c) => c.key)).toEqual(['payments']);
  });

  it('opens the membership tab when only that application permission is held', () => {
    const cards = todayCards({ ...NOTHING, applications: { registrationsPending: null, membershipApplicationsOpen: 2, total: 2 } });
    expect(cards[0].query).toEqual({ tab: 'membership' });
  });

  it('counts expired committee terms as late', () => {
    const [card] = todayCards({ ...NOTHING, committeeTerms: { expiringSoon: 1, expired: 2, windowDays: 60 } });
    expect(card).toMatchObject({ count: 3, overdue: 2 });
  });
});

describe('AdminTodayComponent', () => {
  it('shows a card with a Bangla number and a link for each section', () => {
    const { cards } = setup(of(FULL));
    expect(cards().length).toBe(8);
    const payments = cards().find((c) => c.dataset['key'] === 'payments')!;
    expect(payments.textContent).toContain('পেমেন্ট যাচাই');
    expect(payments.textContent).toContain('৪');
    expect(payments.getAttribute('href')).toBe('/payment-verifications?status=pending');
    expect(cards().find((c) => c.dataset['key'] === 'applications')!.getAttribute('href')).toBe('/applications?tab=registrations');
  });

  it('marks late work in red with the words "দেরি হয়েছে"', () => {
    const { cards } = setup(of(FULL));
    const complaints = cards().find((c) => c.dataset['key'] === 'complaints')!;
    const late = complaints.querySelector('.today-late') as HTMLElement;
    expect(late.textContent).toContain('দেরি হয়েছে');
    expect(late.textContent).toContain('১');
    expect(complaints.textContent).toContain('শীঘ্রই সময় শেষ');
  });

  it('shows only the cards of the sections that are not null', () => {
    const { cards } = setup(of({ ...NOTHING, paymentVerifications: { installment: 1, costShare: 0, total: 1 } }));
    expect(cards().map((c) => c.dataset['key'])).toEqual(['payments']);
  });

  it('says there is nothing waiting when every count is zero', () => {
    const { el, cards } = setup(of({ ...NOTHING, phoneFixes: { open: 0 }, needsDag: 0 }));
    expect(cards().length).toBe(0);
    expect(el.textContent).toContain('আজ কোনো জমে থাকা কাজ নেই');
  });

  it('shows a skeleton first, then an error with a retry that loads again', () => {
    const { fixture, el, today } = setup(throwError(() => new Error('x')));
    expect(el.querySelector('[data-testid="today-error"]')).not.toBeNull();
    today.mockReturnValue(of(FULL));
    (el.querySelector('[data-testid="today-retry"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(today).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[data-testid="today-error"]')).toBeNull();
    expect(el.querySelectorAll('[data-testid="today-card"]').length).toBe(8);
  });
});
