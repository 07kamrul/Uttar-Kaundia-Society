# Batch 2 — Payments merge ("পেমেন্ট"): shared contract (backend · Angular · Flutter)

Source: [`ux-simplification-audit.md`](ux-simplification-audit.md) §4, §9 (pay in ≤ 4 taps) and §13 (payments from abroad).
**Rule:** with `pay_merged_page` **off**, today's behaviour is unchanged. Existing endpoints stay as they are, and everything new is additive.

## Today (verified in code)

| Kind | Member endpoints | Verification |
|---|---|---|
| Installment | `GET /api/member/installments`, `GET /api/member/installment-payments/payable`, `POST /api/member/installment-payments` (multipart: installment_ids, method, transaction_ref, paid_on, sender_account?, note?, proof?) | **Yes**: pending → approved/rejected by `manage_finance` |
| Other fee (incl. picnic) | `GET /api/member/other-fees/types`, `GET/POST /api/member/other-fees/payments` (JSON) | **No**: the row counts as paid as soon as it is written |
| Cost share | `GET /api/member/cost-shares` (read-only) | An admin records payments via `PATCH /api/admin/cost-split-shares/{id}` (`manage_costs`) |

Payment accounts come from `services/installment_payment.list_payment_accounts`.

## Flag

`pay_merged_page` (default off), added to all three registries (`payMergedPage` in Dart). When it is on:
- `/installments`, `/other-fees` and `/cost-shares` redirect to `/payments?kind=…`;
- the member menu shows one "পেমেন্ট" entry instead of three;
- cost-share self-payment is enabled.

When it is off, `POST /api/member/payments/cost-shares` returns 404 `FEATURE_DISABLED`. The read-only summary and history endpoints always work.

## Backend

### `cost_share_payments` table (additive migration, chained onto the current head)

It mirrors `installment_payments`. Columns: id, member_id (FK CASCADE), share_id (FK `cost_split_shares` CASCADE), method (cash/bkash/nagad/rocket/bank/other), transaction_ref (same pattern as installments), sender_account?, amount Numeric(12,2), paid_on, proof_url?, note?, status pending/approved/rejected, rejection_reason, reviewed_by (FK admin_users SET NULL), reviewed_at, created_at.

Rules:
- **Uniqueness:** partial unique `(method, transaction_ref)` where status is not rejected. The service also rejects a reference that is live in `installment_payments`, and the reverse (409 `DUPLICATE_TRANSACTION_REF`).
- **Amount:** must be > 0 and ≤ `amount_due - amount_paid - pending sum`, otherwise 422 `AMOUNT_EXCEEDS_REMAINING`.
- **Approve:** adds the amount to `share.amount_paid`, sets status partial/paid and `paid_at`, writes `receipt_no` = reference, notifies the member, and audits `cost_share_payment.approve`. It mirrors any finance-ledger entry that the admin PATCH path creates today.
- **Reject:** stores the reason, notifies the member, and audits `cost_share_payment.reject`.

### Member endpoints (`/api/member/payments`; fee-manager accounts get 403 as today)

`GET /summary`:
```json
{"currency":"BDT","total_due":"1500.00","total_paid":"12000.00","pending_count":1,"pending_amount":"500.00",
 "dues":[{"kind":"installment|cost_share","ref_id":41,"title":"…","amount":"500.00","due_date":"2026-01-31|null","pending":false}],
 "payable_fee_types":[/* OtherFeeTypeOut, without pay-once types already paid */],
 "accounts":[/* PaymentAccountOut */]}
```
- `total_due` = DUE installments not held by a pending payment, plus unpaid share remainders.
- `total_paid` = approved installment payments, plus fee and picnic totals, plus share `amount_paid`.

`GET /history?kind=installment|other_fee|cost_share&status=pending|approved|rejected|recorded&page=&page_size=`
- Merged newest-first, paginated after the merge.
- Items: `{kind, id, title, amount, method, reference, date, status, rejection_reason, proof_url}`.
- Other fees have status `recorded`.

`POST /cost-shares` takes multipart fields share_id, amount, method, transaction_ref, paid_on, sender_account?, note?, proof?, and returns 201 with a history item. Error codes:
- 404 `SHARE_NOT_FOUND` (the share is not the member's)
- 409 `SHARE_ALREADY_PAID`
- 409 `DUPLICATE_TRANSACTION_REF`
- 422 `AMOUNT_EXCEEDS_REMAINING`

Installments and other fees keep using their existing POST endpoints.

### Admin endpoints (`manage_finance`)

- `GET /api/admin/cost-share-payments?status=` — includes member name, cost title and the remaining amount.
- `GET /api/admin/cost-share-payments/pending-count`
- `POST /api/admin/cost-share-payments/{id}/approve`
- `POST /api/admin/cost-share-payments/{id}/reject`, body `{reason}`
- `GET /api/admin/payment-verifications/pending-count` → `{installment, cost_share, total}`

## Angular

New `features/member/pages/payments/`:
- the page;
- summary cards "আমার বকেয়া ৳…", "পরিশোধ করেছি ৳…" and a "যাচাই চলছে ৳…" chip;
- `pay-flow-dialog` with three steps:
  1. **কিসের জন্য দিচ্ছেন?** — dues pre-ticked; fee types listed below them (picnic head-count stepper, custom amount where allowed); live total.
  2. **কীভাবে দিলেন?** — method cards with the account number and a copy button; reference label "ট্রানজেকশন আইডি (TrxID)" for MFS and "রসিদ নম্বর" otherwise; screenshot upload (compressed); `paid_on` defaults to today; abroad note.
  3. **Confirm → জমা দিন** — one request per kind. On partial failure, show per-item results ("২টির মধ্যে ১টি জমা হয়েছে") and keep the failed item selected so it can be retried.
- combined history with kind and status filter chips, kept in query params;
- `core/services/member-payments.service.ts`.

Tap path from Home: **পেমেন্ট করুন → পরবর্তী → method + TrxID → জমা দিন = 4**.

Routes: lazy `payments`. A guard `payMergedRedirect(kind)` on the three old routes, active only with the flag on; `?type=picnic` becomes `?kind=other_fee&fee=picnic`. The old components and `pay-dues-dialog` are kept. With the flag on, the shell shows one `nav.payments` item.

Admin payment verifications: a kind tab "কিস্তি | খরচের ভাগ" (shown regardless of the flag), the existing approve/reject dialog, the proof image, and the combined pending count on the menu badge.

## Flutter

- `features/member/pages/payments_page.dart`
- `presentation/widgets/pay_flow_sheet.dart`
- repository: `summary()`, `history()`, `submitCostShare()`
- entities: `PaymentSummary`, `PaymentHistoryItem`, `PaymentKind`
- With the flag on, `/installments`, `/cost-shares` and `/picnic-payment` redirect to `/payments`, and `nav_items` shows one payments item. This gives Flutter other-fee payments for the first time. Old pages are kept.

## Copy (BN)

"পেমেন্ট" · "আমার বকেয়া" · "পরিশোধ করেছি" · "যাচাই চলছে" · "পেমেন্ট করুন" · "কিসের জন্য দিচ্ছেন?" · "কীভাবে দিলেন?" · "জমা দিন"
Status chips: "যাচাই চলছে" · "গৃহীত" · "বাতিল — কারণ: …" · "জমা হয়েছে"
Kinds: "কিস্তি" · "অন্যান্য ফি" · "খরচের ভাগ"
Empty state: "এখন কোনো বকেয়া নেই"

## Tests

- **Backend:**
  - summary totals across sources;
  - history filters, pagination and member isolation;
  - cost-share submit: flag off, someone else's share, over the remaining amount, already paid, duplicate reference within and across tables;
  - approve/reject: effects on the share, audit, permission;
  - combined pending count;
  - migration upgrade and downgrade.
- **Angular (Vitest):**
  - payments page, plus the pay flow (reference label per method, abroad note, per-kind dispatch, partial failure);
  - redirect guard with the flag on and off;
  - shell showing 3 items vs 1;
  - verifications kind tab;
  - **"payment merge" UI flow test** (component-level integration in Vitest; the repo has no Playwright): Home → pay → bKash + TrxID → submit in ≤ 4 interactions, and history shows "যাচাই চলছে".
- **Flutter:** payments page, pay sheet, repository, nav with the flag on and off.

## Open decision (owner)

**B2-R1:** other fees (including picnic) are still recorded straight away and never verified. Sending them through verification would need a `status` column on `fee_payments` and `picnic_payments` (old rows set to `approved`) and changes how admin totals are counted. This is proposed as **Batch 2b behind `pay_verify_other_fees`** and is **not built** until the owner approves.
