# Batch 2b — Other-fee verification (B2-R1): shared contract (backend · Angular · Flutter)

Builds on [`batch2-payments-contract.md`](batch2-payments-contract.md) and [`batch5-admin-contract.md`](batch5-admin-contract.md).
**Rule:** with `pay_verify_other_fees` **off**, behaviour is exactly today's: other-fee and picnic payments are recorded as paid immediately. Everything here is additive.

## Flag

`pay_verify_other_fees` (default off), added to all three registries (`payVerifyOtherFees` in Dart).

## Backend

### Migration (additive, reversible, chained after the current head `f5b8d2a6c1e7`)

For both `fee_payments` and `picnic_payments` add:

| Column | Type | Notes |
|---|---|---|
| status | str(16), NOT NULL, server_default `approved` | pending / approved / rejected. **Existing rows become `approved`.** |
| rejection_reason | str(500) null | |
| reviewed_by | FK admin_users, SET NULL, null | |
| reviewed_at | datetime null | |
| proof_url | str(512) null | Stored under `other_fee_payments/member_{id}` |

Index `(status, created_at)` on each table. Downgrade drops the columns.

### Behaviour

- **Flag off:** `POST /api/member/other-fees/payments` and `POST /api/member/picnic-payments` create rows with `status='approved'`, as today.
- **Flag on:** the same endpoints create `status='pending'`.
  - `receipt_no` (the reference) is required when the method is `bkash`, `nagad` or `rocket`, in the same format as installment references (422 `REFERENCE_REQUIRED`).
  - A pending row blocks a duplicate pay-once fee (`already_paid` counts pending and approved, never rejected).
  - The reference rule from Batch 2 applies: the same member may reuse a live reference across their own payments, and a reference live for another member is 409 `DUPLICATE_TRANSACTION_REF`.
- `POST /api/member/other-fees/payments/{id}/proof` takes multipart `proof` and is allowed only for the member's own **pending** row. The server validates the file type and size before storing it, and the endpoint is audited as `other_fee_payment.proof`.
- **Totals count only `approved` rows**, everywhere a fee or picnic total is computed: member summaries and history, `GET /api/admin/other-fees/payments` and picnic totals, the finance summary and the admin dashboard. Pending and rejected rows are listed but never counted.
- **History** (`/api/member/payments/history`): other-fee items now carry the real status (`pending|approved|rejected`) with `rejection_reason` and `proof_url`. When the flag is off every item is `approved`, which the UI shows as "জমা হয়েছে" (unchanged).
- `GET /api/member/payments/summary`: `pending_count` and `pending_amount` include pending other fees.

### Admin endpoints (`manage_finance`, available when the flag is on; 404 `FEATURE_DISABLED` otherwise)

- `GET /api/admin/other-fee-payments?status=&kind=fee|picnic` — includes member name, fee label, amount, method, reference and proof.
- `POST /api/admin/other-fee-payments/{kind}/{id}/approve`
- `POST /api/admin/other-fee-payments/{kind}/{id}/reject`, body `{reason}` (the reason is mandatory)
- Approve and reject are audited as `other_fee_payment.approve` and `other_fee_payment.reject`, and the member is notified as in the installment flow.
- `GET /api/admin/payment-verifications/pending-count` returns `{installment, cost_share, other_fee, total}`.
- `GET /api/admin/today` → `payment_verifications` gains `other_fee`, and `total` includes it.
- `POST /api/admin/payment-verifications/bulk-approve` accepts other-fee items. Choose an item encoding that fits the existing item schema (for example `kind: "other_fee"` with `id_ref: "fee:<id>"` or `"picnic:<id>"`) and document it.

### Tests

- Flag off: both POSTs create `approved` rows, and totals are unchanged (regression).
- Flag on: POST creates `pending`, a mobile-money method without a reference gets 422, a pay-once duplicate is blocked, a rejected row frees the fee.
- Totals ignore pending and rejected rows in every place listed above.
- Approve and reject: effects, mandatory reason, audit rows, permission (a member and a finance-less admin get 403), and a second review gets 409.
- Proof upload: only the owner, only pending, a bad type is rejected.
- Pending counts and the bulk path include other fees.
- Migration upgrade and downgrade, with existing rows becoming `approved`.

## Angular

- **Member:** the history and pay flow use the real status: "যাচাই চলছে" (pending), "গৃহীত" (approved), "বাতিল — কারণ: …" (rejected). The pay flow shows the reference field and the screenshot upload for other fees when the flag is on, and calls the proof endpoint after creating the payment. The old other-fees page shows the status column when the flag is on.
- **Admin `payment-verifications`:** a third tab "অন্যান্য ফি" with approve and reject (reason picker), proof link and the bulk bar. The menu badge and "আজকের কাজ" use the new combined count.
- Error codes are mapped through `core/errors/user-error.ts`: `REFERENCE_REQUIRED`, `DUPLICATE_TRANSACTION_REF`, `FEATURE_DISABLED`.

## Flutter

- The payments page and pay sheet mirror the Angular behaviour. Where Flutter has an admin payment verifications page, add the "অন্যান্য ফি" tab.

## Copy (BN)

"অন্যান্য ফি" · "যাচাই চলছে" · "গৃহীত" · "বাতিল — কারণ: …" · "জমা হয়েছে" (when the flag is off) · reference label by method as in Batch 2.
