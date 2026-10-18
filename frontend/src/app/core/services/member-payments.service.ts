import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { toFileUrl } from './admin.service';
import type { PaymentAccount } from './installment-payment.service';
import { toAccount as toPaymentAccount } from './payment-accounts.service';
import { toFeeType, type OtherFeeType, type OtherFeeTypeApi } from './other-fees.service';

export type PaymentKind = 'installment' | 'other_fee' | 'cost_share';
export type HistoryStatus = 'pending' | 'approved' | 'rejected' | 'recorded';

export interface DueItem {
  kind: 'installment' | 'cost_share';
  refId: number;
  title: string;
  amount: number;
  dueDate: string | null;
  pending: boolean;
}

export interface PaymentSummary {
  currency: string;
  totalDue: number;
  totalPaid: number;
  pendingCount: number;
  pendingAmount: number;
  dues: DueItem[];
  payableFeeTypes: OtherFeeType[];
  accounts: PaymentAccount[];
}

export interface PaymentHistoryItem {
  kind: PaymentKind;
  id: number;
  title: string;
  amount: number;
  method: string | null;
  reference: string | null;
  date: string;
  status: HistoryStatus;
  rejectionReason: string | null;
  proofUrl: string | null;
}

export interface PaymentHistoryPage {
  items: PaymentHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HistoryFilter {
  kind?: PaymentKind;
  status?: HistoryStatus;
  page?: number;
  pageSize?: number;
}

export interface CostSharePaymentSubmission {
  shareId: number;
  amount: number;
  method: string;
  transactionRef: string;
  paidOn: string;
  senderAccount?: string;
  note?: string;
  proof?: File | null;
}

interface SummaryApi {
  currency: string;
  total_due: string | number;
  total_paid: string | number;
  pending_count: number;
  pending_amount: string | number;
  dues: {
    kind: DueItem['kind'];
    ref_id: number;
    title: string;
    amount: string | number;
    due_date: string | null;
    pending: boolean;
  }[];
  payable_fee_types: OtherFeeTypeApi[];
  accounts: import('./payment-accounts.service').PaymentAccountApi[];
}

interface HistoryItemApi {
  kind: PaymentKind;
  id: number;
  title: string;
  amount: string | number;
  method: string | null;
  reference: string | null;
  date: string;
  status: HistoryStatus;
  rejection_reason: string | null;
  proof_url: string | null;
}

interface HistoryPageApi {
  items: HistoryItemApi[];
  total: number;
  page: number;
  page_size: number;
}

const toHistoryItem = (api: HistoryItemApi): PaymentHistoryItem => ({
  kind: api.kind,
  id: api.id,
  title: api.title,
  amount: Number(api.amount),
  method: api.method,
  reference: api.reference,
  date: api.date,
  status: api.status,
  rejectionReason: api.rejection_reason,
  proofUrl: toFileUrl(api.proof_url) ?? null,
});

/** The merged "পেমেন্ট" page's endpoints (Batch 2). Installments and other fees still submit through their own services. */
@Injectable({ providedIn: 'root' })
export class MemberPaymentsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/member/payments`;

  summary(): Observable<PaymentSummary> {
    return this.http.get<SummaryApi>(`${this.base}/summary`).pipe(
      map((api) => ({
        currency: api.currency,
        totalDue: Number(api.total_due),
        totalPaid: Number(api.total_paid),
        pendingCount: api.pending_count,
        pendingAmount: Number(api.pending_amount),
        dues: api.dues.map((d) => ({
          kind: d.kind,
          refId: d.ref_id,
          title: d.title,
          amount: Number(d.amount),
          dueDate: d.due_date,
          pending: d.pending,
        })),
        payableFeeTypes: api.payable_fee_types.map(toFeeType),
        accounts: api.accounts.map(toPaymentAccount),
      })),
    );
  }

  history(filter: HistoryFilter = {}): Observable<PaymentHistoryPage> {
    const params: Record<string, string> = {};
    if (filter.kind) params['kind'] = filter.kind;
    if (filter.status) params['status'] = filter.status;
    if (filter.page != null) params['page'] = String(filter.page);
    if (filter.pageSize != null) params['page_size'] = String(filter.pageSize);
    return this.http.get<HistoryPageApi>(`${this.base}/history`, { params }).pipe(
      map((api) => ({
        items: api.items.map(toHistoryItem),
        total: api.total,
        page: api.page,
        pageSize: api.page_size,
      })),
    );
  }

  submitCostShare(payload: CostSharePaymentSubmission): Observable<PaymentHistoryItem> {
    const form = new FormData();
    form.append('share_id', String(payload.shareId));
    form.append('amount', String(payload.amount));
    form.append('method', payload.method);
    form.append('transaction_ref', payload.transactionRef.trim());
    form.append('paid_on', payload.paidOn);
    if (payload.senderAccount?.trim()) form.append('sender_account', payload.senderAccount.trim());
    if (payload.note?.trim()) form.append('note', payload.note.trim());
    if (payload.proof) form.append('proof', payload.proof);
    return this.http.post<HistoryItemApi>(`${this.base}/cost-shares`, form).pipe(map(toHistoryItem));
  }
}
