# Batch 5 — Admin console "আজকের কাজ": shared contract (backend · Angular · Flutter)

Source: [`ux-simplification-audit.md`](ux-simplification-audit.md) §6, R9/R10 and §13.
**Rule:** with every new flag **off**, today's admin UI is unchanged. Hidden items move, never get deleted; every ⚖ approval trail and reason stays mandatory.
The `/installments-management` and `/fees-management` permission fix is **already shipped** (`manage_finance`, commit 3decf27). It is kept here as a regression test only.

## Today (verified in code)

- **Admin landing:** `features/dashboard/dashboard.component.ts` renders `management/pages/dashboard/admin-dashboard.component.ts` (pending submissions + finance overview only).
- **Intake queues:**
  - `/submissions` → `GET /api/admin/submissions?status=&search=&limit=&offset=` (`membership.review`, returns `needs_dag`);
  - `/membership-review` → `GET /api/admin/membership-applications?status_filter=` (`membership_application.manage`, **no search**).
- **Search:** `GET /api/admin/members?search=` and `/submissions?search=` (`services/member_search.py`) have **no UI**. `admin.service.ts` `listSubmissions(status)` and `listMembers()` do not pass `search`.
- **Payments:** single approve/reject only.
  - `/api/admin/installment-payments/{id}/approve|reject`;
  - `/api/admin/cost-share-payments/{id}/approve|reject`;
  - `/api/admin/payment-verifications/pending-count`.
  - The reason is free text.
- **Pending counts:** `GET /api/admin/plot-boundaries/pending/count`. Complaint SLA is computed through `services/governance.sla_status` (`DUE_SOON_WINDOW_DAYS = 3`). Committee terms come from `CommitteeTerm.term_end` / `computed_status`.
- **Phone fixes:** `GET/PUT /api/admin/phone-fixes` (`member.manage`) has **no UI**. `GET /api/admin/cache/stats` (`manage_system_config`) has **no UI**.
- **Fee settings:** `fee-settings.component.*` (636-line TS) is one page. `POST /api/admin/fee-settings` takes `{key, value, unit?, start_date?, fee_category?}`.
- **Menu:** `features/shell/nav-config.ts` has the Management (16) and Administration (9) sections, flat.

## Flags

| Key | Status | Covers |
|---|---|---|
| `admin_console` | **New** | The "আজকের কাজ" landing; the merged **"আবেদন"** queue; the search UI; the notices + events page; the "ফোন নম্বর ঠিক করুন" page; canned reject reasons |
| `admin_bulk_verify` | **New** | Bulk approve on payment verifications. With the flag off, the bulk endpoint returns 404 `FEATURE_DISABLED`. |
| `fee_wizard` | **New** | Fee-rate wizard at the top of fee settings; history, calculator and create-type move into "Advanced" |
| `nav_advanced_section` | Exists (Batch 3 deferred it here) | Admin menu in 4 groups + Advanced; cache stats page |

All four are independent. With `nav_advanced_section` on and `admin_console` off, the groups list `/submissions` and `/membership-review` separately, and notices and events separately.
Read-only endpoints (`/admin/today`, the search params) always work; only the UI is gated.

## Backend

### `GET /api/admin/today`

Any admin account (`get_current_admin`). Each section is computed only if the caller holds its permission (`get_effective_permissions`); otherwise it is `null` and the client hides that card. There is no cache; the endpoint makes at most 12 COUNT queries, and a query-count test enforces this.

```json
{"as_of":"2026-10-13T08:00:00Z",
 "applications":{"registrations_pending":4,"membership_applications_open":2,"total":6},
 "needs_dag":1,
 "payment_verifications":{"installment":3,"cost_share":1,"total":4},
 "complaints":{"open":7,"due_soon":2,"overdue":1},
 "property_requests":{"pending":2},
 "boundaries":{"pending":3},
 "committee_terms":{"expiring_soon":1,"expired":0,"window_days":60},
 "phone_fixes":{"open":5}}
```

| Field | Rule | Permission |
|---|---|---|
| `registrations_pending` | `Member.status == pending` | `membership.review` (its sub-field is null without it) |
| `membership_applications_open` | status in received, under_review | `membership_application.manage` |
| `needs_dag` | pending members with a property matching `dag_guard._needs_dag_clause()` | `membership.review` |
| `payment_verifications` | same as `/payment-verifications/pending-count` | `manage_finance` |
| `complaints` | `open` = submitted / acknowledged / investigating.<br>`overdue` = an open complaint where (not acknowledged and `sla_ack_due` < today) or (`first_update_at` null and `sla_update_due` < today).<br>`due_soon` = otherwise, either due within `DUE_SOON_WINDOW_DAYS`. | `complaint.manage` |
| `property_requests` | `PropertyChangeStatus.PENDING` | `property.review` |
| `boundaries` | same as `/plot-boundaries/pending/count` | `boundary.review` |
| `committee_terms` | Terms not caretaker and not replaced (`replaced_by_term_id` null). `expired`: `term_end` < today. `expiring_soon`: `term_end` within 60 days. | `committee_registry.manage` |
| `phone_fixes` | `PhoneFixQueue.resolved_at` null | `member.manage` |

The logic lives in a new `services/admin_today.py`; the route goes in a new `api/routes/admin_today.py`, registered beside `admin.py`.

### Search on membership applications (additive)

`GET /api/admin/membership-applications?status_filter=&search=`
- `search` has `max_length` `SEARCH_MAX_LENGTH`.
- It matches the application's name with `ilike`.
- Phone-like terms match `mobile` by the tail, as in `member_search_clause` (factor out a helper `phone_tail_clause(column, term)`).

### Bulk approve (`manage_finance`, flag `admin_bulk_verify`)

`POST /api/admin/payment-verifications/bulk-approve`
```json
{"items":[{"kind":"installment","id":12},{"kind":"cost_share","id":4}],
 "expected_count":2,"expected_total":"1500.00"}
```
Validation:
- 1–50 unique items.
- **Stale guard:** if any item is no longer pending, or the server's count or total differs from `expected_*`, the server returns 409 `BULK_SELECTION_STALE` and **nothing is written**.

**Decision: per-item results, not all-or-nothing.**
- Each item is approved inside its own SAVEPOINT (`db.begin_nested()`), calling the existing `installment_payment.approve_payment` / `cost_share_payment.approve_payment`.
- One `db.commit()` runs at the end.
- Reason: the payments come from different members and are independent. A single row that became "no longer due" (409 inside `approve_payment`) must not block the rest. The stale guard already makes sure the admin confirmed the exact count and total.

Audit: **one row per approved payment**, with the same actions as the single endpoints (`installment_payment.approve`, or `cost_share_payment.approve` + `society_cost.payment`). The detail is suffixed ` bulk=<batch_id>`. There is no batch-level row. Member notifications are sent after the commit, for approved items only (best effort, as today).

Response 200:
```json
{"batch_id":"b7f3c2a1","approved_count":1,"approved_total":"500.00",
 "approved":[{"kind":"installment","id":12,"amount":"500.00"}],
 "failed":[{"kind":"cost_share","id":4,"code":"NO_LONGER_DUE|ALREADY_REVIEWED|AMOUNT_EXCEEDS_REMAINING|NOT_FOUND"}]}
```
There is no bulk reject: every rejection needs its own reason.

### Canned reject reasons

**Decision: config-list rows, not constants.** They are admin-editable in Config Lists (Advanced) with no new UI, and are read through the existing cached `GET /api/public/config-lists/{category}`. Finance reviewers often lack `manage_system_config`, so they cannot use the admin list endpoint.

Additive data migration chained onto the head (`e3a7c1b5d9f2` today). It inserts a row only if `(category, value)` is missing; downgrade deletes only these seeded values.
- `reject_reason_payment`: "TrxID মিলছে না" · "টাকার পরিমাণ মিলছে না" · "স্ক্রিনশট অস্পষ্ট" · "ডুপ্লিকেট পেমেন্ট"
- `reject_reason_application`: "কাগজপত্র অস্পষ্ট" · "খতিয়ান/দাগ মিলছে না" · "ছবি স্পষ্ট নয়" · "ডুপ্লিকেট আবেদন"
- `reject_reason_property_request`: "কাগজপত্র অস্পষ্ট" · "তথ্য মিলছে না"
- `reject_reason_boundary`: "সীমানা দাগের সাথে মিলছে না" · "অন্য সীমানার উপর পড়েছে"

The server keeps its rules: the reason is free text, mandatory, and has the existing minimum length.

## Angular

- **`management/pages/admin-today/`** (new). `dashboard.component.ts` renders it instead of `<app-admin-dashboard>` when `admin_console` is on.
  - Count cards (icon + word + Bangla number, at least 48 px) for each non-null section. Each card links to its queue with a filter, e.g. `/applications?tab=registrations`, `/payment-verifications?status=pending`, `/complaints-admin?sla=overdue`, `/submissions?needs_dag=1`, `/phone-fixes`.
  - Overdue counts are red with the word "দেরি হয়েছে".
  - Skeleton + retry. Empty state: "আজ কোনো জমে থাকা কাজ নেই".
- **`management/pages/applications/`** (new, route `/applications`, guard: `membership.review` OR `membership_application.manage`).
  - Tabs: "নতুন নিবন্ধন" (the existing submissions-list content) | "সদস্যপদের আবেদন" (the existing membership-review content).
  - A tab is hidden without its permission. The tab is kept in `?tab=`.
  - Both old routes stay.
- **Search:** `shared/queue-search` (debounce 300 ms, minimum 2 characters, `inputmode="search"`, placeholder "নাম / মোবাইল / সদস্য আইডি"), on submissions, members and membership applications. `admin.service.ts` gains `listSubmissions(status, search?)`, `listMembers(search?)` and `listApplications(status, search?)`.
- **`payment-verifications`:**
  - checkbox column (pending tab only) and a sticky bar "৩টি নির্বাচিত · মোট ৳১,৫০০ — অনুমোদন করুন";
  - confirm dialog "৩টি পেমেন্ট, মোট ৳১,৫০০ অনুমোদন করবেন?";
  - result "২টি অনুমোদিত, ১টি হয়নি — কারণ: …", with the failed rows staying selected;
  - 409 stale → refresh the list + "তালিকা বদলে গেছে, আবার দেখুন".
- **`shared/reason-picker`:** chips from the config list that fill an editable textarea. It falls back to built-in constants if the list is empty or fails. It is used in payment, submission, membership-application, property-request and boundary rejects.
- **`management/pages/notices-events/`** (route `/notices-events`, `manage_notices`): tabs that host the existing `NoticesComponent` and `EventsComponent` unchanged. Both old routes stay.
- **`management/pages/phone-fixes/`** (route `/phone-fixes`, `member.manage`), "ফোন নম্বর ঠিক করুন":
  - each row shows the member, field (Bangla label), the raw value and the `app-phone-input`;
  - `PUT` per row;
  - the server's 409/422 codes are mapped through `core/errors/user-error.ts`.
- **`management/pages/cache-stats/`** (route `/advanced/cache`, `manage_system_config`): a read-only table of name, entries/max, TTL, hit ratio and invalidations, with a refresh button. **No flush button.**
- **`nav-config.ts`** + `shell.component.ts`: with `nav_advanced_section` on, admin sections become `ADMIN_GROUPS`:
  - **আবেদন ও সদস্য:** আবেদন, সদস্য তালিকা, সম্পত্তির অনুরোধ, সদস্যপদ, ফোন নম্বর ঠিক করুন
  - **টাকা-পয়সা:** পেমেন্ট যাচাই, কিস্তি, অন্যান্য ফি, পিকনিক, আয়-ব্যয়, সমিতির খরচ, তহবিল নিয়ন্ত্রণ
  - **সংগঠন:** নোটিশ ও অনুষ্ঠান, সভার সিদ্ধান্ত, অভিযোগ, কমিটি, নির্বাচন, কল্যাণ কার্যক্রম, সীমানা যাচাই, আরও › সম্পদ রেজিস্টার
  - **সেটিংস:** ফি সেটিংস, পরিকল্পনা, হেল্পলাইন
  - **সেটিংস › Advanced** (one-line explanation each): Roles & Permissions, Config Lists (with the reject reasons), Audit Log, Amendment versions, Cache stats
  - A badge shows `/admin/today` totals on আবেদন and পেমেন্ট যাচাই.
- **`fee-settings`** with `fee_wizard`, new `fee-rate-wizard` component, using the existing endpoints only:
  1. Choose the fee + the new amount. The "current" rate is the newest history row with `start_date` ≤ today, not the `status==1` row.
  2. Effective date, default today, range today to +365. Backdating stays in Advanced.
  3. Confirm "পুরোনো ৳X → নতুন ৳Y, কার্যকর ১ নভেম্বর ২০২৬" → `POST /admin/fee-settings` (keeps `unit` and `fee_category`).

  The wizard is blocked when a future-dated version already exists: "একটি নতুন রেট ইতিমধ্যে নির্ধারিত আছে". The old form, history, calculator and create-type go under a collapsed "Advanced".

## Flutter (admin subset that exists today)

- `features/management/pages/today_page.dart` + repository `today()`. It is shown as the admin landing when `admin_console` is on.
- A search field on `members_list_page.dart` and `submissions_list_page.dart`.
- `payment_verifications_page.dart`: multi-select + bulk approve (`admin_bulk_verify`) and the reason chips.
- `core/navigation/nav_items.dart`: admin groups when `nav_advanced_section` is on.
- Merged queue, notices + events, phone fixes, cache stats and the fee wizard are **Angular only** in this batch.

## Copy (BN)

- Headings: আজকের কাজ · আবেদন · নতুন নিবন্ধন · সদস্যপদের আবেদন · দাগ দরকার · পেমেন্ট যাচাই · অভিযোগ (দেরি হয়েছে / শীঘ্রই সময় শেষ) · সম্পত্তির অনুরোধ · সীমানা যাচাই · কমিটির মেয়াদ শেষ হচ্ছে · ফোন নম্বর ঠিক করুন
- Actions: নির্বাচিতগুলো অনুমোদন করুন · কারণ বেছে নিন বা লিখুন · নতুন রেট চালু করুন · কবে থেকে কার্যকর · নিশ্চিত করুন

## Tests

**Backend:**
- `/admin/today` per-permission nulls (finance-only admin sees only payments; super admin sees all);
- each count rule (complaint due-soon vs overdue boundaries, expiring vs expired terms, `needs_dag`);
- query count ≤ 12;
- application search (name, Bangla-digit phone tail);
- bulk approve:
  - flag off → 404;
  - stale guard → 409 with no writes;
  - mixed kinds;
  - one item no longer due → per-item failure while the others are approved;
  - one audit row per payment with `bulk=`;
  - notifications only for approved items;
  - 51 items → 422;
  - permission 403;
- reject-reason migration upgrade/downgrade, idempotent;
- regression: `installments-management` and `fees-management` API endpoints need `manage_finance`.

**Angular (Vitest):**
- dashboard switches with the flag on/off;
- today cards hidden on null and the link targets;
- applications tabs by permission;
- queue-search debounce and the `search` param sent;
- bulk bar total, confirm text, partial result, 409 refresh;
- reason-picker fill + edit + fallback;
- notices-events tabs;
- phone-fix resolve + error mapping;
- cache stats has no flush button;
- **menu guard:** with `nav_advanced_section` on, every admin route in `NAV_SECTIONS` appears in exactly one group (test fails otherwise); off = same labels as today;
- fee wizard: current-rate derivation, future-version block, POST body.

**Flutter:** the today page, list search, bulk select, and nav groups with the flag on/off.

## Risks

- `/admin/today` adds a request on every admin landing. Keep it COUNT-only on indexed columns.
- Savepoints on SQLite tests behave differently from Postgres row locks. Keep `test_installment_payment_races.py` green.
- The public config-list endpoint exposes the reason texts publicly. They are harmless wording, but the owner should be aware.
- The fee wizard relies on the existing "close current row today" behaviour. A future-dated rate shows as active in `GET /fee-settings`, so the UI must use history.

## Open decisions (owner)

- **B5-O1:** Per-item bulk results (proposed) or all-or-nothing?
- **B5-O2:** Committee "expiring soon" window: 60 days (proposed)?
- **B5-O3:** Should the cache flush button ever be in the UI? Proposed: no; the API only.
- **B5-O4:** Asset Register under সংগঠন › আরও (proposed, which satisfies both §6.2 and R10), or under Advanced?

**Adopted for implementation (owner may override):** every open decision above takes its *proposed* option.
