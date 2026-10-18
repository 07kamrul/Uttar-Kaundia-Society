import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import {
  AdminPaymentAccountsService,
  type AdminPaymentAccount,
} from '../../../../core/services/admin-payment-accounts.service';
import { PaymentAccountsComponent } from './payment-accounts.component';

function row(over: Partial<AdminPaymentAccount> = {}): AdminPaymentAccount {
  return {
    id: 1,
    type: 'bank',
    status: 'active',
    displayOrder: 1,
    label: 'ব্র্যাক ব্যাংক',
    bankName: 'ব্র্যাক ব্যাংক পিএলসি',
    branchName: 'শ্যামপুর শাখা',
    accountName: 'Md Kamrul Hasan',
    accountNumber: '1071193760001',
    routingNumber: '060276537',
    provider: null,
    mfsNumber: null,
    accountKind: null,
    accountHolder: null,
    instructions: null,
    qrImageUrl: null,
    createdBy: null,
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
    ...over,
  };
}

async function setup(rows: AdminPaymentAccount[] = [row()], listError = false) {
  const service = {
    list: vi.fn((_f?: unknown) => (listError ? throwError(() => new Error('down')) : of(rows))),
    create: vi.fn((_p: unknown) => of(rows[0])),
    update: vi.fn((_id: number, _p: unknown) => of(rows[0])),
    setStatus: vi.fn((_id: number, _s: string) => of(rows[0])),
    reorder: vi.fn((_ids: number[]) => of(rows)),
    uploadQr: vi.fn((_f: File) => of({ url: '/u/qr.png' })),
  };
  TestBed.configureTestingModule({
    imports: [PaymentAccountsComponent],
    providers: [provideTranslateService(), { provide: AdminPaymentAccountsService, useValue: service }],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const f = TestBed.createComponent(PaymentAccountsComponent);
  await f.whenStable();
  f.detectChanges();
  return { f, service };
}

const q = (f: ComponentFixture<unknown>, sel: string) => f.nativeElement.querySelector(sel) as HTMLElement | null;
const qa = (f: ComponentFixture<unknown>, sel: string) => [...f.nativeElement.querySelectorAll(sel)] as HTMLElement[];
const text = (f: ComponentFixture<unknown>) => f.nativeElement.textContent ?? '';

describe('PaymentAccountsComponent', () => {
  it('lists rows with label, masked identity line and a status pill', async () => {
    const { f } = await setup();
    expect(text(f)).toContain('ব্র্যাক ব্যাংক');
    expect(text(f)).toContain('••••0001');
    expect(q(f, '.status-pill.is-active')).not.toBeNull();
  });

  it('refetches with query params when the type tab or status chip changes', async () => {
    const { f, service } = await setup();
    (q(f, '.tabs .tab:nth-child(2)') as HTMLButtonElement).click(); // ব্যাংক
    (q(f, '.status-filter .chip:nth-child(3)') as HTMLButtonElement).click(); // নিষ্ক্রিয়
    expect(service.list).toHaveBeenLastCalledWith({ type: 'bank', status: 'inactive' });
  });

  it('shows the failure state with retry when listing fails', async () => {
    const { f } = await setup([], true);
    expect(q(f, '[data-testid="load-failed"]')).not.toBeNull();
  });

  it('opens a blank create form and posts a bank payload on save', async () => {
    const { f, service } = await setup([]);
    (q(f, '.page-header .btn-primary') as HTMLButtonElement).click();
    f.detectChanges();
    expect(q(f, '.modal-backdrop')).not.toBeNull();

    const type = (id: string, value: string) => {
      const el = q(f, `#${id}`) as HTMLInputElement;
      el.value = value;
      el.dispatchEvent(new Event('input'));
    };
    type('pa-label', 'নতুন ব্যাংক');
    type('pa-bank', 'ব্যাংক নাম');
    type('pa-acname', 'ধরক');
    type('pa-acno', '12345678');
    f.detectChanges();
    (q(f, '.modal-backdrop .btn-primary') as HTMLButtonElement).click();

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'bank', label: 'নতুন ব্যাংক', accountNumber: '12345678' }),
    );
  });

  it('maps backend 422 detail codes to translated inline errors', async () => {
    const { f, service } = await setup([]);
    (service.create as ReturnType<typeof vi.fn>).mockReturnValue(
      throwError(() => ({ error: { detail: 'ROUTING_NUMBER_INVALID' } })),
    );
    (q(f, '.page-header .btn-primary') as HTMLButtonElement).click();
    f.detectChanges();
    const type = (id: string, value: string) => {
      const el = q(f, `#${id}`) as HTMLInputElement;
      el.value = value;
      el.dispatchEvent(new Event('input'));
    };
    type('pa-label', 'x');
    type('pa-bank', 'y');
    type('pa-acname', 'z');
    type('pa-acno', '1');
    f.detectChanges();
    (q(f, '.modal-backdrop .btn-primary') as HTMLButtonElement).click();
    f.detectChanges();
    expect(q(f, '[data-testid="form-error"]')!.textContent).toContain('রাউটিং নম্বর ঠিক ৯ সংখ্যার হতে হবে');
  });

  it('warns when deactivating the last active account of its type', async () => {
    const { f } = await setup();
    (qa(f, '.row-actions .btn-sm')[1] as HTMLButtonElement).click(); // deactivate
    f.detectChanges();
    expect(text(f)).toContain('শেষ সক্রিয় অ্যাকাউন্ট');
  });

  it('toggles status through the confirm modal and reloads', async () => {
    const { f, service } = await setup();
    (qa(f, '.row-actions .btn-sm')[1] as HTMLButtonElement).click();
    f.detectChanges();
    const confirmBtn = [...f.nativeElement.querySelectorAll('app-confirm-modal button')].find(
      (b) => b.textContent?.includes('নিশ্চিত করুন'),
    ) as HTMLButtonElement;
    expect(confirmBtn).not.toBeNull();
    confirmBtn.click();
    expect(service.setStatus).toHaveBeenCalledWith(1, 'inactive');
  });

  it('reorders by swapping with the neighbour and refetching', async () => {
    const { f, service } = await setup([
      row({ id: 1 }),
      row({ id: 2, type: 'mfs', provider: 'bkash', bankName: null, accountNumber: null, mfsNumber: '01758290421', label: 'বিকাশ' }),
    ]);
    f.detectChanges();
    const downButtons = qa(f, '.row-actions .btn-icon');
    (downButtons[1] as HTMLButtonElement).click(); // first row, move down
    expect(service.reorder).toHaveBeenCalledWith([2, 1]);
  });

  it('disables the up arrow on the first row and down on the last', async () => {
    const { f } = await setup([row({ id: 1 }), row({ id: 2 })]);
    f.detectChanges();
    const firstRowButtons = qa(f, '.account-row:first-child .btn-icon');
    expect((firstRowButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((firstRowButtons[1] as HTMLButtonElement).disabled).toBe(false);
    const lastRowButtons = qa(f, '.account-row:last-child .btn-icon');
    expect((lastRowButtons[0] as HTMLButtonElement).disabled).toBe(false);
    expect((lastRowButtons[1] as HTMLButtonElement).disabled).toBe(true);
  });
});
