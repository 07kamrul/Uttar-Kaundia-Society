import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { InstallmentPaymentService } from '../../../../core/services/installment-payment.service';
import {
  MemberPaymentsService,
  type HistoryFilter,
  type PaymentHistoryItem,
  type PaymentHistoryPage,
  type PaymentSummary,
} from '../../../../core/services/member-payments.service';
import { OtherFeesService } from '../../../../core/services/other-fees.service';
import { PaymentsComponent } from './payments.component';
import { makeHistoryItem, makeSummary } from './payments.fixtures';

interface Opts {
  summary?: PaymentSummary;
  history?: PaymentHistoryItem[];
}

async function setup(url: string, opts: Opts = {}) {
  const summary = vi.fn(() => of(opts.summary ?? makeSummary()));
  const history = vi.fn((_f: HistoryFilter) =>
    of<PaymentHistoryPage>({ items: opts.history ?? [], total: opts.history?.length ?? 0, page: 1, pageSize: 20 }),
  );
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService(),
      provideRouter([{ path: 'payments', component: PaymentsComponent }]),
      { provide: MemberPaymentsService, useValue: { summary, history, submitCostShare: vi.fn() } },
      { provide: InstallmentPaymentService, useValue: { submit: vi.fn(() => of({ id: 1 })) } },
      { provide: OtherFeesService, useValue: { createPayment: vi.fn() } },
    ],
  });
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('bn', bn);
  translate.use('bn');
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, PaymentsComponent);
  harness.detectChanges();
  return { harness, summary, history, router: TestBed.inject(Router) };
}

const q = (h: RouterTestingHarness, sel: string) => h.routeNativeElement?.querySelector(sel) as HTMLElement | null;
const text = (h: RouterTestingHarness) => h.routeNativeElement?.textContent ?? '';

describe('PaymentsComponent', () => {
  it('shows what I owe, what I paid and a pending chip with plain Bangla', async () => {
    const { harness } = await setup('/payments', {
      summary: makeSummary({ totalDue: 1500, totalPaid: 12000, pendingCount: 1, pendingAmount: 500 }),
    });
    expect(q(harness, '[data-testid="card-due"]')?.textContent).toContain('আমার বকেয়া');
    expect(q(harness, '[data-testid="card-due"]')?.textContent).toContain('১,৫০০');
    expect(q(harness, '[data-testid="card-paid"]')?.textContent).toContain('পরিশোধ করেছি');
    expect(q(harness, '[data-testid="card-paid"]')?.textContent).toContain('১২,০০০');
    expect(q(harness, '[data-testid="chip-pending"]')?.textContent).toContain('যাচাই চলছে');
    expect(q(harness, '[data-testid="chip-pending"]')?.textContent).toContain('৫০০');
  });

  it('hides the pending chip when nothing is being checked and shows the empty state when nothing is due', async () => {
    const { harness } = await setup('/payments', { summary: makeSummary({ totalDue: 0, dues: [], payableFeeTypes: [] }) });
    expect(q(harness, '[data-testid="chip-pending"]')).toBeNull();
    expect(text(harness)).toContain('এখন কোনো বকেয়া নেই');
  });

  it('renders history with the four status chips', async () => {
    const { harness } = await setup('/payments', {
      history: [
        makeHistoryItem({ id: 1, status: 'pending' }),
        makeHistoryItem({ id: 2, status: 'approved' }),
        makeHistoryItem({ id: 3, status: 'rejected', rejectionReason: 'ভুল আইডি' }),
        makeHistoryItem({ id: 4, kind: 'other_fee', status: 'recorded', title: 'পিকনিক ফি' }),
      ],
    });
    const rows = harness.routeNativeElement?.querySelectorAll('[data-testid="history-row"]') as NodeListOf<HTMLElement>;
    expect(rows.length).toBe(4);
    expect(rows[0].textContent).toContain('যাচাই চলছে');
    expect(rows[1].textContent).toContain('গৃহীত');
    expect(rows[2].textContent).toContain('বাতিল — কারণ: ভুল আইডি');
    expect(rows[3].textContent).toContain('জমা হয়েছে');
    expect(rows[3].textContent).toContain('অন্যান্য ফি');
  });

  it('keeps kind and status filters in the query string and refetches history', async () => {
    const { harness, history, router } = await setup('/payments?kind=installment&status=pending');
    expect(history).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'installment', status: 'pending' }));

    (q(harness, '[data-testid="kind-cost_share"]') as HTMLElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(router.url).toContain('kind=cost_share');
    expect(router.url).toContain('status=pending');
    expect(history).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'cost_share', status: 'pending' }));

    (q(harness, '[data-testid="kind-all"]') as HTMLElement).click();
    await harness.fixture.whenStable();
    expect(router.url).not.toContain('kind=');
  });

  it('opens the pay flow from the button, and straight away for ?pay=1', async () => {
    const first = await setup('/payments');
    expect(q(first.harness, 'app-pay-flow-dialog')).toBeNull();
    (q(first.harness, '[data-testid="pay-now"]') as HTMLElement).click();
    first.harness.detectChanges();
    expect(q(first.harness, 'app-pay-flow-dialog')).not.toBeNull();
  });

  it('opens the pay flow automatically for ?pay=1', async () => {
    const { harness } = await setup('/payments?pay=1');
    expect(q(harness, 'app-pay-flow-dialog')).not.toBeNull();
  });

  it('preselects the picnic fee for ?kind=other_fee&fee=picnic&pay=1', async () => {
    const { harness } = await setup('/payments?kind=other_fee&fee=picnic&pay=1');
    expect((q(harness, '[data-testid="fee-picnic"]') as HTMLInputElement).checked).toBe(true);
    expect((q(harness, '[data-testid="due-installment-41"]') as HTMLInputElement).checked).toBe(false);
  });

  it('shows a retry for the history without hiding the summary', async () => {
    const { harness, history } = await setup('/payments');
    history.mockReturnValueOnce(throwError(() => new Error('x')));
    (q(harness, '[data-testid="kind-installment"]') as HTMLElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(q(harness, '[data-testid="history-retry"]')).not.toBeNull();
    expect(q(harness, '[data-testid="card-due"]')).not.toBeNull();
  });

  it('refreshes summary and history and thanks the member after a full success', async () => {
    const { harness, summary, history } = await setup('/payments?pay=1');
    const before = { summary: summary.mock.calls.length, history: history.mock.calls.length };
    (q(harness, '[data-testid="next"]') as HTMLElement).click();
    harness.detectChanges();
    (q(harness, '[data-testid="method-cash"]') as HTMLElement).click();
    const ref = q(harness, '[data-testid="reference"]') as HTMLInputElement;
    ref.value = 'RCPT-1001';
    ref.dispatchEvent(new Event('input'));
    harness.detectChanges();
    // cost share submit is not mocked to succeed here; deselect it by going back first
    (q(harness, '[data-testid="back"]') as HTMLElement).click();
    harness.detectChanges();
    (q(harness, '[data-testid="due-cost_share-9"]') as HTMLElement).click();
    (q(harness, '[data-testid="next"]') as HTMLElement).click();
    harness.detectChanges();
    (q(harness, '[data-testid="submit"]') as HTMLElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(q(harness, 'app-pay-flow-dialog')).toBeNull();
    expect(text(harness)).toContain('জমা হয়েছে। অফিস যাচাই করছে।');
    expect(summary.mock.calls.length).toBeGreaterThan(before.summary);
    expect(history.mock.calls.length).toBeGreaterThan(before.history);
  });
});
