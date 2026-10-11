# EXECUTE: Governance modules — final verification & visual QA

Paste this whole file as the task prompt in a NEW ZCode session in
`E:\Personal Documents\Projects\Kaundia-Member-Registry-Form`.
It is self-contained; no other context is needed.

---

## Background (what already happened)

This repo (Angular 22 standalone frontend in `frontend/`, FastAPI backend in `backend/`)
received a 7-module governance expansion implementing the society গঠনতন্ত্র
(constitution). All 7 modules are BUILT and were verified green at build time
(backend `632 passed / 2 failed`, frontend `ng build` clean, vitest `362 passed / 0 failed`).
What has NOT been done: a final integrated re-verification after the last agents ran
(a concurrent AI session is also editing this repo — plot-boundary/rs-match/rbac files),
and a VISUAL acceptance pass of all new screens. That is your job.

Key decisions already locked (do not re-litigate):
- Subscription extra-decimal rate = **20 টাকা** per constitution (seed lives in
  `backend/tests/conftest.py`; calculation is version-driven via Fee Settings).
- Role mapping: super_admin/executive_committee/administrator = committee-tier admin;
  Member = সাধারণ; `member_class` field (founder/general/honorary_associate) is set
  per-member by admins; election eligibility = founder + general only
  (`is_election_eligible` in `backend/app/services/governance.py`).

## What exists (map)

Backend (all under `backend/app/`):
- `services/governance.py` — SLA/quorum/eligibility helpers, constants
  (AGM_NOTICE_DAYS=15, EMERGENCY_MEETING_NOTICE_DAYS=3, APPEAL_WINDOW_DAYS=30,
  PETITION_RESPONSE_DAYS=30, COMPLAINT_ACK/UPDATE_WORKING_DAYS=3/15,
  MEMBERSHIP_SLA_WORKING_DAYS=20, COUNCIL_POSTS 11 posts, INCOME_SOURCES,
  DEFAULT_EXPENSE_TWO_PERSON_THRESHOLD=50000, fiscal_year_for, audit_reminder_state,
  majority_met, DISSOLUTION_NOTICE_BN).
- Models: `membership_appeal.py`, `complaint.py`, `committee_election.py`,
  `fund_controls.py`, `amendment.py`, `registers.py`; extended `member.py`
  (member_class, governance_status), `resolution_book.py` (council_type, quorum,
  vote_mode, casting_vote, OpenVoteChoice, SpecialSessionPetition),
  `financial_transaction.py` (income_source, foreign funding, secondary approval).
- Routers: `governance.py` (GET /api/governance/constants),
  `member_governance.py`, `membership_appeal.py`, `complaints.py`,
  `committee_registry.py`, `elections.py`, `petitions.py`, `fund_controls.py`,
  `amendments.py`, `registers.py` — all wired in `main.py` under `/api`.
- PDF services: `letters_pdf.py`, `election_pdf.py` + existing finance/roadmap/resolution PDFs.
- Tests: `tests/test_governance_foundation.py`, `test_membership_appeal.py`,
  `test_complaints.py`, `test_committee_election.py`, `test_meetings_quorum.py`,
  `test_fund_controls.py`, `test_amendments.py`, `test_registers.py`.
- Alembic: governance migrations `f4a7b9c2e6d8` → `c5d8e1a3f7b9` →
  `b7f3d2c9e4a1` → `c5d8e2f4a6b9`; the concurrent session added `e4b9c1d7a2f3`
  and `f1a3c5e7b9d2` on top. Head must stay SINGLE — verify with `alembic heads`.

Frontend (under `frontend/src/app/`):
- Services: `core/services/governance.service.ts`, `committee-registry.service.ts`,
  `elections.service.ts`, `petitions.service.ts`, `fund-controls.service.ts`,
  `amendments.service.ts`, `registers.service.ts`; extended finance/resolution-book services.
- Member pages (`features/member/pages/`): `membership/`, `complaints/` (incl.
  land-protection form + emergency-help), `service-standard/`, `elections/`,
  `petitions/`, `welfare-fund/`, `amendments/`, `my-data-panel` on profile,
  welfare-activities section on roadmap, audit summary on fund-transparency.
- Management pages (`features/management/pages/`): `membership-review/`,
  `membership-governance/`, `complaints-admin/`, `committee-registry/`,
  `elections-admin/`, `fund-controls/`, `amendments/`, `asset-register/`,
  `welfare-activities/`; extensions to finance-management and the admin dashboard.
- Routes in `src/app/app.routes.ts` (permissionGuard), nav in
  `features/shell/shell.component.ts`, i18n namespaces in BOTH
  `frontend/public/i18n/bn.json` and `en.json` (membershipGov, complaintsModule,
  emergency, serviceStandard, membershipReview, membershipGovernance, complaintsAdmin,
  myData, committeeRegistry, elections, petitions, fundControls, welfareFund,
  auditReports, amendments, assetRegister, welfareActivities).

## Environment facts

- Python: ALWAYS `backend/venv/Scripts/python.exe` (global python lacks deps).
  Backend tests: `cd backend && venv/Scripts/python.exe -m pytest -q`.
  Known-failing BEFORE any of this work (pre-existing, do NOT fix, do NOT count
  as regressions): photo-upload validation test, CORS-middleware test, upload-serving
  tests (exact set drifts — the concurrent session fixes/breaks some; at last run:
  `test_cors_middleware_allows_configured_origin` and one submission/password-change
  test). Governance tests must ALL pass.
- Alembic CANNOT run on the local sqlite dev.db (pre-existing gender ALTER fails);
  verify migration chains only via `alembic heads` / `alembic history`, never `upgrade head` locally.
- Frontend: `cd frontend && npm run build` and `npm test -- --watch=false` (vitest).
  npm install may be needed first. Angular 22, standalone, signals, OnPush, ngx-translate.
- CONCURRENT SESSION HAZARD: another AI session edits this repo (plot-boundary,
  plot-map, rs-match, rbac, config). NEVER revert or "fix" its files. Before finishing,
  re-verify YOUR governance edits still exist (spot-check a few files) — stale-buffer
  reverts have happened before. Surface conflicts, don't race them.
- Design system: cream/maroon/gold/dark-green tokens in `frontend/src/styles.scss`
  (dark mode via tokens + `core/services/theme.service.ts`), shared `app-date-picker`
  / `app-time-picker` / `app-confirm-modal` / `app-member-picker`, global field styles
  in `src/styles/_forms.scss`, global `.card` `.ds-badge-*` `.ds-empty` `.skeleton-line`
  `.data-table.data-table-cards` (responsive `td [attr.data-label]`).
- i18n: edit bn.json/en.json ONLY via JSON round-trip (python: json.load → merge →
  json.dump preserving key order). NEVER string surgery (duplicate keys exist across sections).
- Audit: every write goes through `record_audit` (app/services/audit.py) — no new logging system.
- Dev run for visual QA: backend `uvicorn app.main:app` on :8000 (see
  `backend/.env` — override DATABASE_URL, live DB unreachable locally; local dev.db
  reseed via create_all, alembic fails on sqlite), frontend `ng serve` on :9091 with
  environment.ts temporarily pointed at :8000 (restore after).

## YOUR TASKS (execute in order)

### 1. Re-verify nothing was reverted (concurrent-session check)
- `cd backend && venv/Scripts/python.exe -m pytest -q` → report counts. All
  test_governance_* / test_membership_appeal / test_complaints / test_committee_election
  / test_meetings_quorum / test_fund_controls / test_amendments / test_registers tests
  must pass; only the known pre-existing failures may fail.
- `venv/Scripts/python.exe -m alembic heads` → exactly ONE head.
- Spot-check fee rate seed still 20.00 (`grep -n "20" backend/tests/conftest.py | grep -i additional`),
  `member_class` still on Member model, `governance.py` still has the constants,
  `frontend/public/i18n/bn.json` still has `committeeRegistry` + `fundControls` namespaces,
  shell.component.ts still has the new nav items.
- `cd frontend && npm run build` and `npm test -- --watch=false` → clean (known
  baseline only). If npm deps missing: `npm install` first.

### 2. Integration sweeps
- i18n parity: for each new namespace, verify every key referenced in templates
  exists in BOTH bn.json and en.json (write a small python script comparing key sets;
  fix any missing keys via JSON round-trip, Bangla-first wording).
- Route/nav audit: every new page has a route in app.routes.ts with a sensible
  permissionGuard, and a shell nav entry; member pages reachable from member nav,
  management pages from management nav.
- Audit coverage: grep the new routers for write endpoints missing `record_audit` — fix any gaps.
- Confirm the 4 acceptance rules: no governance feature runs without the confirmed
  role mapping (is_election_eligible / quorum_met / snapshot-based voting),
  suspension never blocks member auth (test exists), appeals routed to a DIFFERENT
  reviewer than the original decision-maker (server-enforced), secret ballots expose
  counts only (no ballot content in any read endpoint).

### 3. Visual acceptance pass (the main event)
- Start backend (:8000) + frontend (:9091) per the environment facts above; reseed
  local dev.db with a few demo rows per new module if empty (members, one election in
  voting phase, complaints in various SLA states, a committee registry with one expired
  term and one vacancy, an amendment, an asset) so screens have content.
- Screenshot every new page at desktop (1440) AND mobile (360) widths — use the
  browser tooling (scroll + viewport screenshots for tall pages; click via dom_cua;
  fixed 1280x720 viewport harness with iframe wrapper if IAB screenshots glitch).
  Pages: membership, complaints (+land form, emergency-help), service-standard,
  elections (member), petitions, welfare-fund, amendments (member), profile my-data panel,
  membership-review, membership-governance, complaints-admin, committee-registry,
  elections-admin, fund-controls, amendments-admin, asset-register, welfare-activities,
  plus the extended finance-management, fund-transparency, resolution-book meeting
  form/detail, and both dashboards.
- Judge each screenshot for: layout breakage, overflow at 360px, dark-mode
  consistency, missing skeleton/empty states, untranslated or mixed-language labels,
  SLA badges rendering, badge/eye-sore contrast. FIX what you find (frontend fixes in
  the page component/scss or i18n; backend only if data shape is wrong), then
  re-screenshot the fixed pages.
- Do NOT dispatch this to visual-judge subagents if they are unavailable in the
  session you run this in — inspect the images yourself, but LOOK at every page.

### 4. Wrap-up
- Write `docs/governance-alignment-report.md`: per module (1–7) — what was built,
  endpoint list, routes, SLA rules enforced, the ৳20 fee decision, the role-mapping
  decision, test/build evidence, known limitations (e.g. dissolution execution
  intentionally manual + legal-counsel-guided, expat: report exactly what the
  constitution asked vs what shipped).
- Final pytest + ng build + vitest counts in the report.
- Leave changes uncommitted ONLY if the concurrent session is mid-flight (check
  `git log --oneline -3` timestamps); otherwise commit the governance work as a
  single coherent commit (`feat(governance): modules 1-7 ...`) — never commit the
  concurrent session's plot-boundary/rs-match files separately-mixed; if the tree
  mixes both, commit ONLY files from the map above (git add by explicit path).
- Update the memory dir (`C:\Users\kamrul\.zcode\cli\memories\projects\kaundia-member-registry-form-8cd6009f0b1151af\memory\`):
  rewrite `other-fees-feature-plan.md`-style status into a new
  `governance-modules-complete.md` memory with final state + any leftovers.

## Acceptance bar (same as the original build brief)
- Every module reachable from member/admin navigation; no governance logic on an
  unconfirmed mapping; all writes audit-logged; role-enforced server-side; fully
  responsive at 1440/1024/768/520/360; visually consistent (cream/maroon/gold/dark-green,
  serif headings, shared cards/pickers/checkboxes); live SLA badges not static dates;
  letterhead PDFs for formal documents; Bangla-first plain language; dark mode consistent.
