import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, shareReplay, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { toFileUrl } from './admin.service';
import type { PaymentAccount } from '../models/registration.model';

export interface PaymentAccountApi {
  id: number;
  type: 'bank' | 'mfs';
  method: string;
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
}

export const toAccount = (api: PaymentAccountApi): PaymentAccount => ({
  id: api.id,
  type: api.type,
  method: api.method,
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
});

/**
 * Active society payment accounts (GET /payment-accounts). One shared request:
 * every payment screen shows the same server-managed list, ACTIVE-only is
 * enforced by the backend.
 */
@Injectable({ providedIn: 'root' })
export class PaymentAccountsService {
  private cache$: Observable<PaymentAccount[]> | null = null;

  constructor(private http: HttpClient) {}

  getActiveAccounts(): Observable<PaymentAccount[]> {
    this.cache$ ??= this.http
      .get<PaymentAccountApi[]>(`${environment.apiBaseUrl}/payment-accounts`)
      .pipe(
        map((rows) => rows.map(toAccount)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.cache$;
  }

  /** Called by retry paths so the next getActiveAccounts() hits the server again. */
  invalidate(): void {
    this.cache$ = null;
  }
}
