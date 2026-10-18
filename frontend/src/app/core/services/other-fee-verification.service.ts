import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { toFileUrl } from './admin.service';
import type { BulkItem } from './cost-share-payment.service';
import type { PaymentStatus } from './installment-payment.service';

/** `fee` = fee_payments, `picnic` = picnic_payments (their ids overlap). */
export type OtherFeeKind = 'fee' | 'picnic';

export interface AdminOtherFeePayment {
  id: number;
  kind: OtherFeeKind;
  memberId: number;
  memberName: string | null;
  memberDisplayId: string | null;
  feeLabel: string;
  amount: number;
  method: string | null;
  /** Masked society account the member says they paid into (fee payments only). */
  paymentAccountSnapshot: string | null;
  receiptNo: string | null;
  paymentDate: string;
  proofUrl: string | null;
  status: PaymentStatus;
  rejectionReason: string | null;
}

interface AdminOtherFeePaymentApi {
  id: number;
  kind: OtherFeeKind;
  member_id: number;
  member_name: string | null;
  member_display_id: string | null;
  fee_label: string;
  amount: string | number;
  payment_method: string | null;
  payment_account_snapshot: string | null;
  receipt_no: string | null;
  payment_date: string;
  proof_url: string | null;
  status: PaymentStatus;
  rejection_reason: string | null;
}

const toRow = (api: AdminOtherFeePaymentApi): AdminOtherFeePayment => ({
  id: api.id,
  kind: api.kind,
  memberId: api.member_id,
  memberName: api.member_name,
  memberDisplayId: api.member_display_id,
  feeLabel: api.fee_label,
  amount: Number(api.amount),
  method: api.payment_method,
  paymentAccountSnapshot: api.payment_account_snapshot,
  receiptNo: api.receipt_no,
  paymentDate: api.payment_date,
  proofUrl: toFileUrl(api.proof_url) ?? null,
  status: api.status,
  rejectionReason: api.rejection_reason,
});

/** Committee side of member other-fee and picnic payments (pay_verify_other_fees). */
@Injectable({ providedIn: 'root' })
export class OtherFeeVerificationService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin/other-fee-payments`;

  /** Bulk-approve item: `kind: "other_fee"` with `id_ref: "fee:<id>" | "picnic:<id>"`. */
  static bulkItem(kind: OtherFeeKind, id: number): BulkItem {
    return { kind: 'other_fee', id, id_ref: `${kind}:${id}` };
  }

  listForAdmin(status?: PaymentStatus): Observable<AdminOtherFeePayment[]> {
    const params: Record<string, string> = status ? { status } : {};
    return this.http.get<AdminOtherFeePaymentApi[]>(this.base, { params }).pipe(map((rows) => rows.map(toRow)));
  }

  approve(kind: OtherFeeKind, id: number): Observable<unknown> {
    return this.http.post(`${this.base}/${kind}/${id}/approve`, {});
  }

  reject(kind: OtherFeeKind, id: number, reason: string): Observable<unknown> {
    return this.http.post(`${this.base}/${kind}/${id}/reject`, { reason });
  }
}
