import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { environment } from '../../../environments/environment';
import {
  AdminPaymentAccountsService,
  accountIdentityLine,
  type AdminPaymentAccount,
} from './admin-payment-accounts.service';

const BASE = `${environment.apiBaseUrl}/admin/payment-accounts`;

const apiRow = {
  id: 1,
  type: 'bank',
  status: 'active',
  display_order: 1,
  label: 'ব্র্যাক ব্যাংক',
  bank_name: 'ব্র্যাক ব্যাংক পিএলসি',
  branch_name: 'শ্যামপুর শাখা',
  account_name: 'Md Kamrul Hasan',
  account_number: '1071193760001',
  routing_number: '060276537',
  provider: null,
  mfs_number: null,
  account_kind: null,
  account_holder: null,
  instructions: null,
  qr_image_url: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-10-17T00:00:00Z',
  updated_at: '2026-10-17T00:00:00Z',
};

const makeRow = (over: Record<string, unknown> = {}): AdminPaymentAccount => {
  const row = { ...apiRow, ...over } as typeof apiRow;
  return {
    id: row.id,
    type: row.type as 'bank' | 'mfs',
    status: row.status as 'active' | 'inactive',
    displayOrder: row.display_order,
    label: row.label,
    bankName: row.bank_name,
    branchName: row.branch_name,
    accountName: row.account_name,
    accountNumber: row.account_number,
    routingNumber: row.routing_number,
    provider: row.provider,
    mfsNumber: row.mfs_number,
    accountKind: row.account_kind,
    accountHolder: row.account_holder,
    instructions: row.instructions,
    qrImageUrl: null,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

describe('AdminPaymentAccountsService', () => {
  let http: HttpTestingController;
  let service: AdminPaymentAccountsService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(AdminPaymentAccountsService);
  });
  afterEach(() => http.verify());

  it('lists accounts with the chosen type/status filters and maps to camelCase', () => {
    let result: unknown;
    service.list({ type: 'mfs', status: 'inactive' }).subscribe((r) => (result = r));
    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('type')).toBe('mfs');
    expect(req.request.params.get('status')).toBe('inactive');
    req.flush([apiRow]);
    expect(result).toEqual([makeRow()]);
  });

  it('sends no params when no filter is set', () => {
    service.list().subscribe();
    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.keys().length).toBe(0);
    req.flush([]);
  });

  it('creates with the payload as given', () => {
    let created: unknown;
    service
      .create({ type: 'bank', label: 'ব্র্যাক', bankName: 'ব্র্যাক', accountName: 'K', accountNumber: '123' })
      .subscribe((r) => (created = r));
    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      type: 'bank',
      label: 'ব্র্যাক',
      bankName: 'ব্র্যাক',
      accountName: 'K',
      accountNumber: '123',
    });
    req.flush(apiRow);
    expect((created as AdminPaymentAccount).accountNumber).toBe('1071193760001');
  });

  it('updates via PUT, toggles status via PATCH /status with {status}', () => {
    service.update(3, { label: 'নতুন নাম' }).subscribe();
    const put = http.expectOne(`${BASE}/3`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ label: 'নতুন নাম' });
    put.flush(apiRow);

    service.setStatus(3, 'inactive').subscribe();
    const patch = http.expectOne(`${BASE}/3/status`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ status: 'inactive' });
    patch.flush({ ...apiRow, status: 'inactive' });
  });

  it('reorders via PATCH /reorder with the id list', () => {
    let rows: unknown;
    service.reorder([2, 1]).subscribe((r) => (rows = r));
    const req = http.expectOne(`${BASE}/reorder`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ ids: [2, 1] });
    req.flush([apiRow]);
    expect(rows).toEqual([makeRow()]);
  });

  it('uploads the QR file under the qr_image field', () => {
    let url: { url: string } | undefined;
    service.uploadQr(new File([new Uint8Array([1])], 'qr.png', { type: 'image/png' })).subscribe((r) => (url = r));
    const req = http.expectOne(`${BASE}/upload-qr`);
    expect(req.request.body).toBeInstanceOf(FormData);
    expect(req.request.body.get('qr_image')).toBeInstanceOf(File);
    req.flush({ url: '/uploads/payment_accounts/qr/qr.png' });
    expect(url).toEqual({ url: '/uploads/payment_accounts/qr/qr.png' });
  });
});

describe('accountIdentityLine', () => {
  it('shows bank name with a masked number for bank accounts', () => {
    expect(accountIdentityLine(makeRow())).toBe('ব্র্যাক ব্যাংক পিএলসি ••••0001');
  });

  it('shows provider with a masked number for MFS accounts', () => {
    expect(
      accountIdentityLine(makeRow({ type: 'mfs', bank_name: null, account_number: null, provider: 'bkash', mfs_number: '01758290421' })),
    ).toBe('BKASH ••••0421');
  });

  it('omits missing parts instead of printing empty masks', () => {
    expect(accountIdentityLine(makeRow({ bank_name: null, account_number: null }))).toBe('');
  });
});
