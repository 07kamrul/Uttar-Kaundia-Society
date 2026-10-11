# Governance modules 1–7 — final alignment & verification report

Date: 2026-10-11 · Verified on the macOS working copy of this repository
(`Uttar-Kaundia-Society`), executing `EXECUTE-GOVERNANCE-VERIFICATION.md`.

## 0. Re-verification summary (this pass)

| Check | Result |
| --- | --- |
| Backend pytest | **637 passed / 1 failed** — the only failure is the pre-existing `test_cors_middleware_allows_configured_origin` (named in the brief as known-failing). All governance suites pass. |
| Alembic migration chain | Exactly **one head**: `f1a3c5e7b9d2` (payment_ref_partial_unique, down: e4b9c1d7a2f3). Verified by AST-parsing all 43 revision files. |
| Frontend `ng build` | Clean (only benign NG8113 unused-import warning on MembershipComponent). |
| Frontend vitest | **362 passed / 0 failed** (48 spec files). |
| Spot-checks | ৳20.00 additional-decimal seed in `tests/conftest.py:80`; `member_class` on Member model; all governance constants in `services/governance.py`; `committeeRegistry`/`fundControls` + all 17 new i18n namespaces present in **both** bn.json and en.json; shell nav entries present. |
| Audit coverage | Every write endpoint across the 10 governance routers is audit-logged (see §2.3). |
| Visual QA | 57 screenshots, 26 pages at 1440px + 22 page captures at 360px + 4 light-mode captures. Verdicts in §5. |

### Fixes made during this verification pass

1. **P0 — app failed to boot entirely**: `app.routes.ts` route `picnic-payments`
   combined `canActivate` with `redirectTo` — Angular rejects that combination at
   bootstrap (`NG04014: Invalid configuration of route 'picnic-payments'`), so the
   SPA rendered a blank page on every URL. This is invisible to `ng build` and to
   the specs (no spec bootstraps the full router). Fix: dropped the redundant
   `canActivate` — the redirect target `/fees-management` carries the identical
   `member.view_all` guard, so the security posture is unchanged.
2. **Test-collection blockers**: `test_admin_member_management_routes.py` used
   `AdminUser` in fixture annotations without importing it (NameError at collection);
   `test_registration_installment.py` failed transitively because it imports helpers
   from that module; and `test_upload_validation.py` annotated
   `-> AsyncClient.response` (AttributeError at collection). All three aborted the
   whole pytest run before a single test executed. Mechanical repairs: added the
   missing `from app.models.admin import AdminUser` (mirroring `conftest.py`) and
   corrected the annotation to `httpx.Response`. No test logic changed; all three
   files then pass.
3. **i18n gaps (4 keys)**, fixed via JSON round-trip in **both** bn.json and en.json:
   `committeeRegistry.vacant` (শূন্যপদ/Vacant), `fundControls.signatories.branch`
   (শাখা/Branch), `fundControls.signatories.accountName` (হিসাবের নাম/Account name),
   `welfareFund.adminTitle` (কল্যাণ তহবিলের আবেদন পর্যালোচনা/Welfare fund review).
4. **Wrong-case template refs**: `membership.component.ts` referenced
   `membershipGov.waivers.typeWaiver`/`typeInstallment` while the JSON keys (and the
   dynamic `'membershipGov.waivers.type' + waiver.type` concatenation in the same
   template) are lowercase `typewaiver`/`typeinstallment`. Template corrected to the
   lowercase keys; no duplicate JSON entries added.

Fixes 5–8 surfaced by the visual acceptance pass (SLA badge localization, the
membership-applications list 500, emergency-steps translation, light-mode tab
contrast, file-input styling) are detailed in §5.1.

A full i18n parity scan of all 18 new governance components (534 distinct keys,
static + `instant()/get()/stream()` references) now reports **0 missing keys** in
both languages.

## 1. Environment notes for this copy

This macOS copy differs from the Windows machine the brief was written for:

- No `backend/venv` existed; created with `uv venv --python 3.12` + `uv pip install -r requirements.txt`.
- No `backend/.env`; defaults from `app/core/config.py` already point at
  `sqlite+aiosqlite:///./dev.db` and CORS `http://localhost:9091`.
- The committed `dev.db` predated every governance migration (no `member_class`
  column, no governance tables), so it was backed up (`dev.db.pre-gov-verify.bak`)
  and recreated via `Base.metadata.create_all`, then seeded with demo rows for every
  new module (6 members across member classes incl. one suspended; election in
  voting phase with nominations/snapshots/votes; complaints in four SLA states;
  committee terms incl. one expired + a vacancy; amendment proposal on v1; assets;
  bank signatories; audit report; welfare requests; a petition with signatures;
  fee settings). Demo logins: admin `admin@example.com`, member `01711000001`.
- `alembic upgrade` was **not** run locally (brief: sqlite ALTER fails); chain
  verified by revision-graph inspection instead.

## 2. Modules

### Module 1 — সদস্য শাসন (membership governance, review, appeals, my-data)

- **Built**: membership applications with 20-working-day SLA; fee waiver /
  installment requests; governance status (active/suspended) with written-notice
  and response window; membership actions; appeals routed to a different reviewer;
  member "my data" panel + data-correction requests; arrears view.
- **Endpoints (36 + 2)**: `app/api/routes/membership_appeal.py` (applications,
  appeals, fee-waivers, membership-actions, data-correction-requests, my-documents,
  admin review/approve/reject/letter.pdf, suspension-notice/suspend,
  admin appeals assign/decide, members-arrears) and `member_governance.py`
  (GET/PUT member class & governance status).
- **Routes**: `/membership`, `/membership-review`, `/membership-governance`,
  `/profile` (my-data panel).
- **SLA**: `MEMBERSHIP_SLA_WORKING_DAYS = 20`; application `sla_due_at` enforced and
  shown live; appeal window `APPEAL_WINDOW_DAYS = 30`.
- **Role mapping**: member_class founder/general/honorary_associate set per-member by
  admins; election eligibility = founder + general only.

### Module 2 — অভিযোগ ও সেবা মান (complaints, land protection, emergency help)

- **Built**: member complaints (5 categories), the সংযুক্তি-৩ land-protection form
  with mandatory disclaimer + evidence upload, anti-retaliation notice, emergency
  contacts page, admin complaint workflow (acknowledge → assign → update → resolve
  → close/reject), letterhead PDF, service-standard page.
- **Endpoints (17)**: `complaints.py` incl. `GET /governance/service-standard`.
- **Routes**: `/complaints`, `/complaints/land-protection`, `/emergency-help`,
  `/service-standard`, `/complaints-admin`.
- **SLA**: `COMPLAINT_ACK_WORKING_DAYS = 3`, `COMPLAINT_UPDATE_WORKING_DAYS = 15`
  (`sla_ack_due` / `sla_update_due` computed with working-day arithmetic; badges
  render live states, screenshots show on-time/breach/resolved states).

### Module 3 — কমিটি রেজিস্ট্রি ও নির্বাচন (committee registry & elections)

- **Built**: the 11 constitutional posts (`COUNCIL_POSTS`), term registry with
  expiry/caretaker states, vacancy workflow (resignation/removal → notice → member
  response → decision), full election lifecycle draft → nominations_open →
  nominations_closed (voter snapshot frozen) → voting → tabulated → confirmed, one
  secret ballot per snapshot-eligible member per post (DB-unique), election
  complaints, result-sheet PDF.
- **Endpoints (10 + 16)**: `committee_registry.py`, `elections.py`.
- **Routes**: `/committee-registry`, `/elections` (member), `/elections-admin`.
- **Eligibility**: `snapshot_eligible()` re-evaluates on the FROZEN snapshot
  (approved + not suspended + founder/general) — `elections.py:127-133`.

### Module 4 — দাবি-আবেদন (special-session petitions)

- **Built**: petitions with 20%-of-eligible signature requirement
  (`required_signature_count`), numbered `PET-<year>-####` with retry-on-conflict,
  30-working-day response SLA, committee response/reject, meeting linkage.
- **Endpoints (7)**: `petitions.py`. **Route**: `/petitions`.
- **SLA**: `PETITION_RESPONSE_DAYS = 30`.

### Module 5 — তহবিল নিয়ন্ত্রণ ও কল্যাণ তহবিল (fund controls, welfare fund, audit)

- **Built**: constitutional income-source allowlist (foreign funding blocked without
  a government-approval reference), dual-approval threshold
  (`DEFAULT_EXPENSE_TWO_PERSON_THRESHOLD = 50000`, configurable via Fee Settings),
  bank signatory register + bank-letter PDF, annual audit reminder/report/publish,
  member welfare fund (requests → start-review → decide → disburse, decision
  letter PDF), fund-transparency member view with audit summary.
- **Endpoints (24)**: `fund_controls.py` (+ finance transaction extensions:
  `income_source`, `is_foreign_funding`, `requires_secondary`, `second_approved_by`).
- **Routes**: `/fund-controls` (5 admin tabs), `/welfare-fund` (member),
  `/fund-transparency`, finance-management extensions.
- **SLA**: audit reminder state machine (`audit_reminder_state` — warns from June).

### Module 6 — গঠনতন্ত্র সংশোধনী (constitutional amendments)

- **Built**: append-only constitution versions (v1 seeded once), member proposals,
  dissolution proposals force the four-fifths majority (`MAJORITY_FOUR_FIFTHS`),
  attach-meeting requires AGM/EGM notice, adoption creates the next version,
  certificate PDF.
- **Endpoints (13)**: `amendments.py`. **Routes**: `/amendments` (member),
  `/amendments-admin`.

### Module 7 — রেজিস্ট্রি (asset register & welfare activities)

- **Built**: society asset register (condition catalog incl. poor/lost), register
  PDF, welfare-activities log with type catalog, list PDF, member-facing view on
  the roadmap page.
- **Endpoints (11)**: `registers.py`. **Routes**: `/asset-register`,
  `/welfare-activities`, roadmap section.

### Shared / constants

- `governance.py` router: `GET /api/governance/constants` (all SLA day counts,
  council posts, income sources, dissolution notice text) — one read endpoint.
- Every module reachable from the sectioned shell nav (`NAV_SECTIONS`);
  all management routes carry `permissionGuard` with governance permissions
  (e.g. `membership_application.manage`, `membership_appeal.manage`,
  `governance.elections`, `governance.fund_controls`, …).

## 3. Locked decisions (implemented as decided)

1. **Subscription extra-decimal rate = ৳20** — seeded in `backend/tests/conftest.py:80`
   (`monthly_subscription_additional_rate = 20.00`, start 2000-01-01); the runtime
   calculation is version-driven via Fee Settings.
2. **Role mapping** — super_admin / executive_committee / administrator =
   committee-tier admin; Member = সাধারণ; `member_class` (founder / general /
   honorary_associate) set per-member by admins; election eligibility =
   founder + general only via `is_election_eligible()` (`governance.py:269`).

## 4. Acceptance rules — verification evidence

| Rule | Evidence |
| --- | --- |
| No governance feature on an unconfirmed mapping | `is_election_eligible` guards petition create/sign (`petitions.py:155,234`) and election candidacy/voting (`elections.py:774,882`); `quorum_met()` (`governance.py:278`) + `quorum_required_for()` (`resolution_book.py:207`) drive meeting validity; voting eligibility re-evaluated on the frozen snapshot only. |
| Suspension never blocks member auth | `tests/test_governance_foundation.py::test_suspension_does_not_block_member_auth` (passing): `/api/member/me` still 200 for a suspended member. |
| Appeals go to a DIFFERENT reviewer than the original decision-maker | Server-enforced hard rule at `membership_appeal.py:1664-1669` (`_original_decision_maker` + 422 on violation); dedicated appeal tests pass. |
| Secret ballots expose counts only | `elections.py:190-230 _counts()` aggregates COUNT rows only ("no voter or ballot attribution survives"); `/elections/{id}/me` returns post keys only (`elections.py:858`); ballot-cast audit entry records "content secret". |
| All writes audit-logged | AST scan of every write endpoint in the 10 routers: all carry `record_audit` directly or via their shared helper (`_create_complaint` → `complaint.submitted`; `_insert_petition` → `petition.created`). |

## 5. Visual acceptance pass

Setup: backend `uvicorn app.main:app` on :8000 (fresh create_all sqlite DB with
demo rows), frontend `ng serve` on :9091. Captured full-page screenshots at
1440×900 (desktop, dark mode default) and 360×800 (mobile) plus light-mode
captures (kept under `/tmp/qa/`). Judged by three independent visual acceptance
agents (management desktop, member desktop, mobile), then a focused re-judge of
every re-captured page after fixes.

### 5.1 Findings and fixes (visual pass)

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| 1 | **P0** | App rendered a blank dark page on every URL — Angular rejected the route config at bootstrap (`NG04014`: `picnic-payments` combined `redirectTo` + `canActivate`). Invisible to `ng build` and to the specs. | Dropped the redundant `canActivate`; the redirect target `/fees-management` carries the same `member.view_all` guard. |
| 2 | High | `GET /api/admin/membership-applications` returned **500** with any data: the list serializer calls `_application_timeline()`, which reads `application.audit_rows` — an attribute only the detail loader assigns. The review page silently showed a blank queue. Tests never exercised the bare list endpoint. | Batch-loaded audit rows for the whole list in `list_applications` (one query, no N+1) and assigned them per application; added regression test `test_admin_application_queue_lists_with_timeline`. |
| 3 | High | SLA badges rendered raw enum tokens: `due_soon (2)`, `on_track (14)`, `met (2)`, `overdue (-5)` on both the admin and member complaint pages (`slaLabel()` never localized). | Template now pipes the state through `complaintsAdmin.sla.*` (new keys on_track/due_soon/overdue/met in bn+en) with the day count appended; raw-key `slaLabel()` helper removed from both components. |
| 4 | High | Emergency-help page rendered literal `emergency.steps.0 … emergency.steps.4` — the template printed key strings without the translate pipe. | Added `\| translate` to the step `<li>` (the JSON `emergency.steps` array resolves through numeric index keys). |
| 5 | Medium | Inactive filter/tab labels were near-invisible in light mode (inherited color) on complaints-admin, membership, membership-review, membership-governance, elections. | Explicit `color: var(--gray-800)` on `.tab` in all five components (token flips automatically in dark mode). |
| 6 | Medium | Document-upload controls (membership ×2, land-protection ×1, audit-report ×1) rendered as blank ~24px squares: global field styles excluded `input[type=file]`, and the ZCode in-app browser's embedded Chromium additionally renders the native picker button with **no label text at all**, so a token-colored button still had no affordance. | Global `input[type='file']` rule in `styles/_forms.scss`: the whole control draws as a dashed picker box with a fixed icon button (`::file-selector-button` with an inline SVG glyph, native label suppressed) — the affordance no longer depends on browser widget chrome, and in normal browsers the chosen file name still shows beside the icon. |
| 9 | Medium | The membership-review queue rendered SLA badges as raw `on_track (10)` / `overdue (-2)` — same unlocalized pattern as finding 3, on a page the first SLA fix did not cover (the member membership page already localized via `membershipGov.sla.*`). | Same translate-pipe fix as finding 3, reusing the `complaintsAdmin.sla.*` keys. |
| 7 | Seeder | Raw `assetRegister.conditions.needs_repair` badge and English asset categories; finance list filtering mismatch. | Not app bugs: the QA seeder had inserted out-of-catalog values (`needs_repair` is not in `ASSET_CONDITIONS` = good/fair/poor/lost) and free-text categories in English. Demo data corrected to catalog values (ভালো/মোটামুটি, স্থাপনা/জলাধার). |
| 8 | Capture | `fund-controls-threshold` shot showed the income tab; `finance-management` and `resolution-book/add` full-page captures raced data loading; the member `welfare-activities` shot was taken while logged in as a member (permission screen — correct behavior). | Re-captured with the tab switch verified in-page and data load confirmed (5 transaction rows) before the shot. |

Minor notes recorded but intentionally not changed: native date inputs show an
English 'Select date' placeholder (browser-locale control), the fund-controls
income-policy list deliberately shows catalog keys (e.g. `admission_fee`) beside
Bangla labels, signatory tenure and profile dates use ISO format, and the
i18n-correct words নিষ্পত্তি/বিতর্কাধীন were flagged by the judge as suspected
misspellings but are correct as written.

### 5.2 Page verdicts

First pass (3 judges, 53 valid captures): 40 pass, 13 fail — every fail is
accounted for in §5.1 (rows 1–8). All 14 affected pages were re-captured after
the fixes and re-judged; the re-judge verdicts are recorded below and all pass.

Re-judge (post-fix) verdicts:

| Page (width) | Verdict |
| --- | --- |
| complaints-admin (1440 dark / 1440 light / 360) | pass — SLA badges 'সময় আছে (14)' etc., tabs readable in both themes |
| membership-review (1440) | pass — queue lists both seeded applications with timelines |
| fund-controls threshold tab (1440) | pass — dual-approval threshold content |
| finance-management (1440) | pass — 5 transactions incl. 60,000 pending secondary approval |
| resolution-book add form (1440) | pass |
| asset-register (1440 + 360) | pass — Bangla condition tags and categories |
| membership (1440 dark + light) | pass — visible upload buttons, tabs readable, form renders |
| emergency-help (1440 + 360) | pass — five Bangla steps |
| complaints, member (1440) | pass — proper empty state |

## 6. Test / build evidence

- Backend: `637 passed / 1 failed` (known CORS failure only) — includes
  `test_governance_foundation.py`, `test_membership_appeal.py`, `test_complaints.py`,
  `test_committee_election.py`, `test_meetings_quorum.py`, `test_fund_controls.py`,
  `test_amendments.py`, `test_registers.py` all green.
- Frontend: `ng build` clean; vitest `362 passed / 0 failed`.
- Migration chain: single head `f1a3c5e7b9d2`.

## 7. Known limitations (shipped as designed)

1. **Dissolution execution is intentionally manual.** The system tracks a
   dissolution proposal and its four-fifths vote, but actually dissolving the
   society (registrations, asset transfer, legal filings) is deliberately left to
   a legal-counsel-guided manual process; the app only records the decision and
   shows the constitutional notice text (`DISSOLUTION_NOTICE_BN`).
2. **Expat / non-resident members**: the constitution asks that expatriate members
   be able to participate remotely. What shipped: they are tracked as members with
   the same member_class semantics and can log in and vote in elections when
   snapshotted eligible. What is *not* built: dedicated remote-attendance tooling
   for AGM/EGM (video/remote proxy registration) — meetings are recorded in the
   resolution book only. Report this to the society as a partial implementation.
3. Alembic migrations cannot run on a local sqlite dev DB (the historical gender
   ALTER fails on sqlite); local verification relies on `create_all`, matching the
   brief.
4. The QA demo seeder is intentionally not committed (ad-hoc, /tmp) — demo data
   exists only in the local `dev.db` (backup of the pre-governance DB kept alongside
   as `dev.db.pre-gov-verify.bak`).
