import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { toFileUrl } from './admin.service';

export type PaymentAccountType = 'bank' | 'mfs';
export type PaymentAccountStatus = 'active' | 'inactive';

/** Admin view: everything, including status and audit timestamps. */
export interface AdminPaymentAccount {
  id: number;
  type: PaymentAccountType;
  status: PaymentAccountStatus;
  displayOrder: number;
  label: string;
  bankName: string | null;
  branchName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
  provider: string | null;
  mfsNumber: string | null;
  accountKind: string | null;
  accountHolder: string | null;
  instructions: string | null;
  qrImageUrl: string | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PaymentAccountInput {
  type: PaymentAccountType;
  label: string;
  bankName?: string;
  branchName?: string;
  accountName?: string;
  accountNumber?: string;
  routingNumber?: string;
  provider?: string;
  mfsNumber?: string;
  accountKind?: string;
  accountHolder?: string;
  instructions?: string;
  displayOrder?: number;
}

interface AdminPaymentAccountApi {
  id: number;
  type: PaymentAccountType;
  status: PaymentAccountStatus;
  display_order: number;
  label: string;
  bank_name: string | null;
  branch_name: string | null;
  account_name: string | null;
  account_number: string | null;
  routing_number: string | null;
  provider: string | null;
  mfs_number: string | null;
  account_kind: string | null;
  account_holder: string | null;
  instructions: string | null;
  qr_image_url: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string | null;
  updated_at: string | null;
}

const toAccount = (api: AdminPaymentAccountApi): AdminPaymentAccount => ({
  id: api.id,
  type: api.type,
  status: api.status,
  displayOrder: api.display_order,
  label: api.label,
  bankName: api.bank_name,
  branchName: api.branch_name,
  accountName: api.account_name,
  accountNumber: api.account_number,
  routingNumber: api.routing_number,
  provider: api.provider,
  mfsNumber: api.mfs_number,
  accountKind: api.account_kind,
  accountHolder: api.account_holder,
  instructions: api.instructions,
  qrImageUrl: toFileUrl(api.qr_image_url) ?? null,
  createdBy: api.created_by,
  updatedBy: api.updated_by,
  createdAt: api.created_at,
  updatedAt: api.updated_at,
});

/** Details shown to admins in list rows: masked identifying line. */
export function accountIdentityLine(account: AdminPaymentAccount): string {
  const mask = (n: string | null) => (n ? `••••${n.slice(-4)}` : '');
  if (account.type === 'bank') {
    return [account.bankName, mask(account.accountNumber)].filter(Boolean).join(' ');
  }
  return [account.provider?.toUpperCase(), mask(account.mfsNumber)].filter(Boolean).join(' ');
}

/** Admin management of the society payment accounts members pay into. */
@Injectable({ providedIn: 'root' })
export class AdminPaymentAccountsService {
  private readonly base = `${environment.apiBaseUrl}/admin/payment-accounts`;

  constructor(private http: HttpClient) {}

  list(filters: { type?: PaymentAccountType; status?: PaymentAccountStatus } = {}): Observable<AdminPaymentAccount[]> {
    const params: Record<string, string> = {};
    if (filters.type) params['type'] = filters.type;
    if (filters.status) params['status'] = filters.status;
    return this.http
      .get<AdminPaymentAccountApi[]>(this.base, { params })
      .pipe(map((rows) => rows.map(toAccount)));
  }

  create(payload: PaymentAccountInput): Observable<AdminPaymentAccount> {
    return this.http
      .post<AdminPaymentAccountApi>(this.base, payload)
      .pipe(map(toAccount));
  }

  update(id: number, payload: Partial<PaymentAccountInput>): Observable<AdminPaymentAccount> {
    return this.http
      .put<AdminPaymentAccountApi>(`${this.base}/${id}`, payload)
      .pipe(map(toAccount));
  }

  setStatus(id: number, status: PaymentAccountStatus): Observable<AdminPaymentAccount> {
    return this.http
      .patch<AdminPaymentAccountApi>(`${this.base}/${id}/status`, { status })
      .pipe(map(toAccount));
  }

  reorder(orderedIds: number[]): Observable<AdminPaymentAccount[]> {
    return this.http
      .patch<AdminPaymentAccountApi[]>(`${this.base}/reorder`, { ids: orderedIds })
      .pipe(map((rows) => rows.map(toAccount)));
  }

  uploadQr(file: File): Observable<{ url: string }> {
    const form = new FormData();
    form.append('qr_image', file);
    return this.http.post<{ url: string }>(`${this.base}/upload-qr`, form);
  }
}
