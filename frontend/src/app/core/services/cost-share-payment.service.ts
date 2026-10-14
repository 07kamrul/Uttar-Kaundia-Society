import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { toFileUrl } from './admin.service';
import type { PaymentStatus } from './installment-payment.service';

export interface AdminCostSharePayment {
  id: number;
  memberId: number;
  memberName: string | null;
  memberDisplayId: string | null;
  shareId: number;
  costTitle: string | null;
  amountDue: number;
  amountPaid: number;
  /** amount_due - amount_paid; does not subtract payments still pending. */
  remaining: number;
  method: string;
  transactionRef: string;
  senderAccount: string | null;
  amount: number;
  paidOn: string;
  proofUrl: string | null;
  note: string | null;
  status: PaymentStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export type BulkKind = 'installment' | 'cost_share';
export interface BulkItem {
  kind: BulkKind;
  id: number;
}
export interface BulkApproveResult {
  batchId: string;
  approvedCount: number;
  approvedTotal: number;
  approved: Array<BulkItem & { amount: number }>;
  failed: Array<BulkItem & { code: string }>;
}
interface BulkApproveApi {
  batch_id: string;
  approved_count: number;
  approved_total: string;
  approved: Array<BulkItem & { amount: string }>;
  failed: Array<BulkItem & { code: string }>;
}

export interface PendingVerificationCounts {
  installment: number;
  costShare: number;
  total: number;
}

interface AdminCostSharePaymentApi {
  id: number;
  member_id: number;
  member_name: string | null;
  member_display_id: string | null;
  share_id: number;
  cost_title: string | null;
  amount_due: string | number;
  amount_paid: string | number;
  remaining: string | number;
  method: string;
  transaction_ref: string;
  sender_account: string | null;
  amount: string | number;
  paid_on: string;
  proof_url: string | null;
  note: string | null;
  status: PaymentStatus;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const toAdminPayment = (api: AdminCostSharePaymentApi): AdminCostSharePayment => ({
  id: api.id,
  memberId: api.member_id,
  memberName: api.member_name,
  memberDisplayId: api.member_display_id,
  shareId: api.share_id,
  costTitle: api.cost_title,
  amountDue: Number(api.amount_due),
  amountPaid: Number(api.amount_paid),
  remaining: Number(api.remaining),
  method: api.method,
  transactionRef: api.transaction_ref,
  senderAccount: api.sender_account,
  amount: Number(api.amount),
  paidOn: api.paid_on,
  proofUrl: toFileUrl(api.proof_url) ?? null,
  note: api.note,
  status: api.status,
  rejectionReason: api.rejection_reason,
  reviewedAt: api.reviewed_at,
  createdAt: api.created_at,
});

/** Committee side of member cost-share payments (verify / reject), plus the combined pending count. */
@Injectable({ providedIn: 'root' })
export class CostSharePaymentService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin`;

  listForAdmin(status?: PaymentStatus): Observable<AdminCostSharePayment[]> {
    const params: Record<string, string> = status ? { status } : {};
    return this.http
      .get<AdminCostSharePaymentApi[]>(`${this.base}/cost-share-payments`, { params })
      .pipe(map((rows) => rows.map(toAdminPayment)));
  }

  approve(id: number): Observable<AdminCostSharePayment> {
    return this.http
      .post<AdminCostSharePaymentApi>(`${this.base}/cost-share-payments/${id}/approve`, {})
      .pipe(map(toAdminPayment));
  }

  reject(id: number, reason: string): Observable<AdminCostSharePayment> {
    return this.http
      .post<AdminCostSharePaymentApi>(`${this.base}/cost-share-payments/${id}/reject`, { reason })
      .pipe(map(toAdminPayment));
  }

  /** admin_bulk_verify: approve many payments at once; per-item failures come back in `failed`. */
  bulkApprove(items: BulkItem[], expectedCount: number, expectedTotal: string): Observable<BulkApproveResult> {
    return this.http
      .post<BulkApproveApi>(`${this.base}/payment-verifications/bulk-approve`, {
        items,
        expected_count: expectedCount,
        expected_total: expectedTotal,
      })
      .pipe(
        map((r) => ({
          batchId: r.batch_id,
          approvedCount: r.approved_count,
          approvedTotal: Number(r.approved_total),
          approved: r.approved.map((a) => ({ kind: a.kind, id: a.id, amount: Number(a.amount) })),
          failed: r.failed,
        })),
      );
  }

  pendingCounts(): Observable<PendingVerificationCounts> {
    return this.http
      .get<{ installment: number; cost_share: number; total: number }>(`${this.base}/payment-verifications/pending-count`)
      .pipe(map((r) => ({ installment: r.installment, costShare: r.cost_share, total: r.total })));
  }
}
