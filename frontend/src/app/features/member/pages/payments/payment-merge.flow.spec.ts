import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { ContentService } from '../../../../core/services/content.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { InstallmentPaymentService } from '../../../../core/services/installment-payment.service';
import {
  MemberPaymentsService,
  type PaymentHistoryItem,
} from '../../../../core/services/member-payments.service';
import { MemberService, type MemberProfile } from '../../../../core/services/member.service';
import { OtherFeesService } from '../../../../core/services/other-fees.service';
import { HomeStatusComponent } from '../home-status/home-status.component';
import { PaymentsComponent } from './payments.component';
import { makeHistoryItem, makeSummary } from './payments.fixtures';

/**
 * "Payment merge" UI flow (component-level integration; the repo has no
 * Playwright): Home -> পেমেন্ট করুন -> পরবর্তী -> bKash + TrxID -> জমা দিন,
 * then the history shows "যাচাই চলছে". Each user action below is one counted
 * interaction; the audit target is at most four.
 */
describe('payment merge flow: Home to submitted', () => {
  it('pays installments in at most four interactions and shows যাচাই চলছে in the history', async () => {
    let history: PaymentHistoryItem[] = [];
    const submit = vi.fn(() => {
      history = [makeHistoryItem({ id: 7, title: 'কিস্তি 01/2026', status: 'pending', reference: 'TX12345' })];
      return of({ id: 7 });
    });
    const summary = makeSummary({
      totalDue: 400,
      dues: makeSummary().dues.filter((d) => d.kind === 'installment'),
      payableFeeTypes: [],
    });

    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        provideRouter([
          { path: 'dashboard', component: HomeStatusComponent },
          { path: 'payments', component: PaymentsComponent },
        ]),
        { provide: FeatureFlagService, useValue: { isEnabled: (k: string) => k === 'pay_merged_page' || k === 'nav_five_areas' } },
        {
          provide: MemberService,
          useValue: {
            getProfile: () =>
              of({ status: 'approved', fullName: 'রহিম', properties: [{ id: 1, dagNoCs: '১২৩' }], nominees: [] } as unknown as MemberProfile),
          },
        },
        {
          provide: MemberPaymentsService,
          useValue: {
            summary: () => of(summary),
            history: () => of({ items: history, total: history.length, page: 1, pageSize: 20 }),
            submitCostShare: vi.fn(),
          },
        },
        { provide: InstallmentPaymentService, useValue: { submit } },
        { provide: OtherFeesService, useValue: { createPayment: vi.fn() } },
        { provide: ContentService, useValue: { listNotices: () => of([]), listEvents: () => of([]) } },
      ],
    });
    const t = TestBed.inject(TranslateService);
    t.setTranslation('bn', bn);
    t.use('bn');

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/dashboard');
    harness.detectChanges();
    const root = () => harness.routeNativeElement as HTMLElement;
    const q = (sel: string) => root().querySelector(sel) as HTMLElement | null;
    let interactions = 0;
    const tap = async (sel: string) => {
      const el = q(sel);
      if (!el) throw new Error(`nothing to tap: ${sel}`);
      interactions += 1;
      el.click();
      await harness.fixture.whenStable();
      harness.detectChanges();
    };

    // 1. Home: the big পেমেন্ট করুন button on the dues card.
    expect(q('[data-testid="dues-pay"]')?.textContent).toContain('পেমেন্ট করুন');
    await tap('[data-testid="dues-pay"]');

    // The pay flow is already open with every due ticked.
    expect(q('app-pay-flow-dialog')).not.toBeNull();
    expect(q('[data-testid="total"]')?.textContent).toContain('৪০০');

    // 2. পরবর্তী
    await tap('[data-testid="next"]');

    // 3. bKash and the TrxID, as one "fill in how I paid" interaction.
    interactions += 1;
    (q('[data-testid="method-bkash"]') as HTMLElement).click();
    const ref = q('[data-testid="reference"]') as HTMLInputElement;
    ref.value = 'TX12345';
    ref.dispatchEvent(new Event('input'));
    harness.detectChanges();

    // 4. জমা দিন
    await tap('[data-testid="submit"]');

    expect(interactions).toBeLessThanOrEqual(4);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ installmentIds: [41, 42], method: 'bkash', transactionRef: 'TX12345' }));

    // The dialog closed and the history shows the new payment as "যাচাই চলছে".
    expect(q('app-pay-flow-dialog')).toBeNull();
    const rows = root().querySelectorAll('[data-testid="history-row"]');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('যাচাই চলছে');
    expect(rows[0].textContent).toContain('TX12345');
  });
});
