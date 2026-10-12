# AI SESSIONS LEDGER
> READ THIS FILE FIRST before doing anything. Update it while working. Never delete history.
> Protocol: see the "MANDATORY PROTOCOL" block at the top of `CLAUDE.md` / `AGENTS.md`. Optional helpers: `scripts/ai/`.

## ACTIVE STATE
<!-- Rewrite in place; this is the single source of truth for resuming. Status: IDLE | IN_PROGRESS | INTERRUPTED | DONE -->
- Status: IN_PROGRESS
- Current session ID: SESSION-20261012-0613-claude
- Current agent: claude
- Current task / user prompt: Per-view section loaders + responsive layout for management pages (plan approved: phases 1-2 first)
- Last completed step: Phase 1-2: section-loader component+spec, global skeleton/tab/table/checkbox CSS, governance per-tab loading, review+committee wired; build+378 tests OK
- NEXT step: Phase 3: roll <app-section-loader> + responsive table/tab fixes to remaining ~45 management/member pages in batches; visual check at 360/768/1440 not done (needs running app)
- Files touched so far: frontend/src/styles.scss, frontend/src/app/shared/section-loader/*, management/pages/{membership-governance, membership-review, committee-registry}
- Uncommitted / half-finished work: none
- Blockers / decisions pending: none
- Last updated (UTC): 2026-10-12 06:13

## TASK QUEUE
- [x] Set up cross-AI session ledger (AI_SESSIONS.md, protocol in entry files, scripts/ai helpers) | sessions: `SESSION-20261011-1051-claude`
- [x] Execute EXECUTE-GOVERNANCE-VERIFICATION.md — governance modules final re-verification, integration sweeps, visual QA, report | sessions: `SESSION-20261011-1253-zcode`
- [x] Fix Dokploy build: target stage runtime not found in backend/Dockerfile | sessions: `SESSION-20261011-1718-claude`
- [x] Make member governance pages UI+functionality smart/professional/responsive (8 pages redesign + sidebar auto-scroll) | sessions: `SESSION-20261011-1733-zcode`
- [ ] Make member governance pages UI+functionality smart, professional, user friendly, fully responsive | sessions: `SESSION-20261011-1728-zcode`
- [x] Make the 3 screenshot pages (emergency-safety, profile correction-request, funds/fund-addition) UI+functionality smart, professional, user friendly, fully responsive on any device | sessions: `SESSION-20261011-1804-claude`
- [x] Implement cross-AI rules plan: master docs/AI_RULES.md synced to all AI tool instruction files + enforcement configs + pre-commit hook | sessions: `SESSION-20261011-1808-claude`
- [x] Implement global smart loader plan | sessions: `SESSION-20261011-1821-claude`
- [ ] Per-view section loaders + responsive layout for management pages (plan approved: phases 1-2 first) | sessions: `SESSION-20261012-0545-claude`, `SESSION-20261012-0613-claude`

## SESSION LOG
<!-- Append-only, newest at bottom. Entry format:
  ### [SESSION-YYYYMMDD-HHMM-<agent>] START
  - Agent: claude | codex | zcode | zai | other
  - Model:
  - Started (UTC):
  - User prompt (verbatim or tight summary):
  - Resumed from: <previous session ID or "none">
  - Plan:
  #### CHECKPOINTS
  - [HH:MM] step done -> files changed -> next step
  ### END
  - Ended (UTC):
  - End reason: COMPLETED | LIMIT_REACHED | ERROR | USER_STOPPED | HANDOFF
  - Summary of work done:
  - Files created/modified/deleted:
  - Remaining work (exact):
  - Notes for the next agent (gotchas, conventions, commands to run):
-->

### [SESSION-20261011-1051-claude] START
- Agent: claude
- Model: claude-opus-5-5
- Started (UTC): 2026-10-11 10:51
- User prompt: Implement a cross-AI session ledger (AI_SESSIONS.md + protocol in CLAUDE.md / AGENTS.md / .zcode/RULES.md + optional scripts/ai helpers) so Claude, Codex, ZCode, z.ai can hand off and resume sessions. No source/config/build changes, no new dependencies.
- Resumed from: none
- Plan: write protocol -> prepend to entry files -> bash + PowerShell helpers -> seed ledger -> test helpers on a scratch copy
#### CHECKPOINTS
- [10:53] Protocol written; prepended to CLAUDE.md and AGENTS.md (original content kept below it) -> .zcode/RULES.md, CLAUDE.md, AGENTS.md -> write helper scripts
- [10:57] Helper scripts written (bash + PowerShell, shared lib each) -> scripts/ai/* -> seed AI_SESSIONS.md
- [10:58] Ledger seeded -> AI_SESSIONS.md -> verify helpers against a scratch copy of the ledger
### END
- Ended (UTC): 2026-10-11 10:58
- End reason: COMPLETED
- Summary of work done: Created the cross-AI session ledger and its protocol. Protocol block (with RESUME PHRASES and helper usage) is prepended to CLAUDE.md and AGENTS.md and is the full content of .zcode/RULES.md. .zai/ does not exist, so .zai/RULES.md was skipped.
- Files created/modified/deleted: created AI_SESSIONS.md, .zcode/RULES.md, scripts/ai/_ledger_lib.sh, scripts/ai/ai_start.sh, scripts/ai/ai_checkpoint.sh, scripts/ai/ai_end.sh, scripts/ai/_ledger_lib.ps1, scripts/ai/ai_start.ps1, scripts/ai/ai_checkpoint.ps1, scripts/ai/ai_end.ps1; modified (prepend only) CLAUDE.md, AGENTS.md
- Remaining work (exact): none
- Notes for the next agent: CLAUDE.md imports AGENTS.md via `@AGENTS.md`, so Claude sees the protocol twice; that is expected. AGENTS.md's `<!-- BEGIN/END:nextjs-agent-rules -->` block is managed by `next dev`; keep the protocol block outside those markers. Helpers find fields by the exact "- <Field>:" labels in ACTIVE STATE and by the "## <Section>" headings; do not rename them. Scripts honour AI_LEDGER=<path> to target another ledger file (useful for testing). Uncommitted frontend changes (admin-dashboard, fund-transparency, roadmap, member/pages/amendments) were present during this session and are not from this session.

### [SESSION-20261011-1253-zcode] START
- Agent: zcode
- Model: GLM-5.3-Flash
- Started (UTC): 2026-10-11 12:53
- User prompt: Execute EXECUTE-GOVERNANCE-VERIFICATION.md — governance modules final re-verification, integration sweeps, visual QA, report
- Resumed from: none
- Plan: 1 re-verify tests/build; 2 i18n+route+audit sweeps; 3 visual QA desktop+mobile; 4 report+wrap-up
#### CHECKPOINTS
- [15:53] Verification pass done: pytest 636/1 (known CORS only), alembic 1 head, vitest 362/0, i18n 0 missing (fixed 4 keys + 2 template refs), audit coverage clean, 4 acceptance rules verified, P0 route fix (NG04014 picnic-payments), 57 screenshots captured -> frontend/src/app/app.routes.ts, frontend/src/app/features/member/pages/membership/membership.component.ts, frontend/public/i18n/bn.json, frontend/public/i18n/en.json, backend/tests/test_admin_member_management_routes.py, backend/tests/test_registration_installment.py, backend/tests/test_upload_validation.py, docs/governance-alignment-report.md -> Collect visual-judge verdicts, fix any fails, re-screenshot; fill report §5; final ng build; wrap-up ledger+memory+commit
- [17:01] All judge findings fixed: P0 NG04014, admin-queue 500 (+regression test), SLA labels ×3 pages, emergency steps, tab contrast ×5 components, file-input webview quirk; backend 637/1 (known CORS only), vitest 362/0; re-captures done, final re-judge running -> frontend/src/styles/_forms.scss, frontend/src/app/features/management/pages/membership-review/membership-review.component.ts, frontend/src/app/features/management/pages/complaints-admin/complaints-admin.component.ts, frontend/src/app/features/member/pages/complaints/complaints.component.ts, frontend/src/app/features/member/pages/complaints/emergency-help.component.ts, frontend/src/app/features/{member/pages/elections,member/pages/membership,management/pages/membership-review,management/pages/membership-governance}/*.component.ts, docs/governance-alignment-report.md -> Final re-judge verdict -> final ng build -> single coherent commit -> ledger END + memory
### END
- Ended (UTC): 2026-10-11 17:06
- End reason: COMPLETED
- Summary of work done: Executed EXECUTE-GOVERNANCE-VERIFICATION.md on the macOS copy: full re-verification (backend 637/1 known CORS only, vitest 362/0, ng build clean, single alembic head f1a3c5e7b9d2), integration sweeps (i18n parity 0 missing, route/nav audit, audit coverage, 4 acceptance rules verified), visual QA of 26 pages at 1440+360 via 3 visual-judge agents, all findings fixed and re-judged to pass, report at docs/governance-alignment-report.md, committed a83b9c7
- Files created/modified/deleted: frontend/src/app/app.routes.ts, frontend/src/app/features/member/pages/membership/membership.component.ts, frontend/public/i18n/bn.json, frontend/public/i18n/en.json, backend/tests/test_admin_member_management_routes.py, backend/tests/test_registration_installment.py, backend/tests/test_upload_validation.py, docs/governance-alignment-report.md, frontend/src/styles/_forms.scss, frontend/src/app/features/management/pages/membership-review/membership-review.component.ts, frontend/src/app/features/management/pages/complaints-admin/complaints-admin.component.ts, frontend/src/app/features/member/pages/complaints/complaints.component.ts, frontend/src/app/features/member/pages/complaints/emergency-help.component.ts, frontend/src/app/features/{member/pages/elections, member/pages/membership, management/pages/membership-review, management/pages/membership-governance}/*.component.ts, backend/dev.db-shm.pre-gov-verify.bak, backend/dev.db-wal.pre-gov-verify.bak, backend/dev.db.pre-gov-verify.bak
- Remaining work (exact): none — task complete
- Notes for the next agent: P0 found: NG04014 route misconfig blanked the app (redirectTo+canActivate). Dev servers left running: uvicorn :8000, ng serve :9091. dev.db reseeded (backup: backend/dev.db.pre-gov-verify.bak). Demo logins: admin@example.com / member 01711000001. QA screenshots in /tmp/qa/. Do not commit dev.db* backups.

### [SESSION-20261011-1718-claude] START
- Agent: claude
- Model: claude-sonnet-5-5
- Started (UTC): 2026-10-11 17:18
- User prompt: Fix Dokploy build: target stage runtime not found in backend/Dockerfile
- Resumed from: none
- Plan: see CHECKPOINTS
#### CHECKPOINTS
### END
- Ended (UTC): 2026-10-11 17:18
- End reason: COMPLETED
- Summary of work done: Named the backend Dockerfile stage 'runtime' so Dokploy build target resolves
- Files created/modified/deleted: backend/Dockerfile, backend/dev.db-shm.pre-gov-verify.bak, backend/dev.db-wal.pre-gov-verify.bak, backend/dev.db.pre-gov-verify.bak
- Remaining work (exact): none
- Notes for the next agent: none

### [SESSION-20261011-1728-zcode] START
- Agent: zcode
- Model: GLM-5.3-Flash
- Started (UTC): 2026-10-11 17:28
- User prompt: Make member governance pages UI+functionality smart, professional, user friendly, fully responsive
- Resumed from: none
- Plan: 1 explore member gov pages; 2 redesign each page UI/UX; 3 responsive mobile; 4 verify desktop+mobile screenshots; 5 build+tests; 6 ledger END
#### CHECKPOINTS
- [17:30] Explored all 8 member governance pages + design system + tests + i18n + icons -> read only -> Redesign pages: dashboard first, then service-standard, elections, complaints, membership, petitions, welfare-fund, amendments (ds-card language, responsive grids, better disabled buttons)
### END
- Ended (UTC): 2026-10-11 17:33
- End reason: LIMIT_REACHED
- Summary of work done: Read-only exploration only; no code changes.
- Files created/modified/deleted: none
- Remaining work (exact): see SESSION-20261011-1733-zcode
- Notes for the next agent: superseded by new session

### [SESSION-20261011-1733-zcode] START
- Agent: zcode
- Model: GLM-5.3-Flash
- Started (UTC): 2026-10-11 17:33
- User prompt: make those ui and functionality smart, professional and user friendly with fully responsive any kind of size and device (3 screenshots: emergency-safety page, profile correction-request section, funds/fund-addition page)
- Resumed from: SESSION-20261011-1728-zcode
- Plan: 1 explore the 3 target pages; 2 redesign UI/UX per page incl. raw-input/label bug fixes; 3 full responsiveness; 4 verify desktop+mobile screenshots via visual-judge; 5 build+tests; 6 ledger END + commit
#### CHECKPOINTS
- [17:43] Redesigned 8 member pages (dashboard, service-standard, elections, complaints, membership, petitions, welfare-fund, amendments) + shared gov-* primitives in styles.scss + data-tone badge colors + 20 i18n keys -> frontend/src/styles.scss, frontend/src/app/features/member/pages/{dashboard,service-standard,elections,complaints,membership,petitions,welfare-fund,amendments}/*, frontend/public/i18n/{bn,en,json keys.tsv} -> Run vitest + ng build, then visual QA at 1440/390 widths
- [17:44] Explored 3 target pages; root cause found: btn-* modifier classes used without .btn base (styles.scss) render raw; plan: global btn fix + redesign emergency-help & my-data-panel + polish fund-transparency (filters collapse, totals chips, audit empty state) + i18n keys -> read only -> Edit styles.scss button base group, then rewrite emergency-help.component.ts

### [SESSION-20261011-1804-claude] START
- Agent: claude
- Model: claude-opus-5-5
- Started (UTC): 2026-10-11 18:04
- User prompt: Implement rules so AI cannot access the database or server
- Resumed from: SESSION-20261011-1733-zcode
- Plan: Create .claude/settings.json deny rules, scripts/ai/block-infra.sh hook, AGENTS.md note
#### CHECKPOINTS
### END
- Ended (UTC): 2026-10-11 18:05
- End reason: COMPLETED
- Summary of work done: Added AI no-database/no-server rules: settings deny list, PreToolUse hook block-infra.sh, AGENTS.md policy section
- Files created/modified/deleted: AI_SESSIONS.md, frontend/src/styles.scss, frontend/src/app/features/member/pages/{dashboard, service-standard, elections, complaints, membership, petitions, welfare-fund, amendments}/*, frontend/public/i18n/{bn, en, json keys.tsv}, read only, frontend/public/i18n/bn.json, frontend/public/i18n/en.json, frontend/public/i18n/keys.tsv, frontend/src/app/features/member/pages/amendments/amendments.component.ts, frontend/src/app/features/member/pages/complaints/complaints.component.ts, frontend/src/app/features/member/pages/complaints/emergency-help.component.ts, frontend/src/app/features/member/pages/dashboard/member-dashboard.component.html, frontend/src/app/features/member/pages/dashboard/member-dashboard.component.ts, frontend/src/app/features/member/pages/elections/elections.component.ts, frontend/src/app/features/member/pages/fund-transparency/fund-transparency.component.html, frontend/src/app/features/member/pages/fund-transparency/fund-transparency.component.scss, frontend/src/app/features/member/pages/fund-transparency/fund-transparency.component.ts, frontend/src/app/features/member/pages/membership/membership.component.ts, frontend/src/app/features/member/pages/petitions/petitions.component.ts, frontend/src/app/features/member/pages/profile/my-data-panel.component.ts, frontend/src/app/features/member/pages/service-standard/service-standard.component.ts, frontend/src/app/features/member/pages/welfare-fund/welfare-fund.component.ts, .claude/settings.json, frontend/src/app/features/member/pages/dashboard/member-dashboard.component.scss
- Remaining work (exact): none for this task; zcode UI task SESSION-20261011-1733-zcode remains open at its NEXT step
- Notes for the next agent: none

### [SESSION-20261011-1808-claude] START
- Agent: claude
- Model: claude-opus-5-5
- Started (UTC): 2026-10-11 18:08
- User prompt: Implement cross-AI rules plan: master docs/AI_RULES.md synced to all AI tool instruction files + enforcement configs + pre-commit hook
- Resumed from: none
- Plan: Phases 1-5 of approved plan
#### CHECKPOINTS
- [18:10] Phase 1-2 done: docs/AI_RULES.md master + sync_rules.sh/.ps1; synced 8 tool files -> docs/AI_RULES.md, scripts/ai/sync_rules.*, AGENTS.md, .zcode/RULES.md, .github/copilot-instructions.md, .cursor/rules/ai-rules.mdc, GEMINI.md, .windsurfrules, .clinerules, CONVENTIONS.md -> Condense CLAUDE.md to @AGENTS.md pointer, then Phase 3 configs (opencode.json, .codex/config.toml, ignore files, .aider.conf.yml)
### END
- Ended (UTC): 2026-10-11 18:16
- End reason: COMPLETED
- Summary of work done: Cross-AI rules: master docs/AI_RULES.md synced by scripts/ai/sync_rules.sh/.ps1 into AGENTS.md, .zcode/RULES.md, Copilot, Cursor, Gemini, Windsurf, Cline, Aider files; CLAUDE.md imports AGENTS.md; opencode.json and .codex/config.toml locks; ignore files; Claude ask-rules and extended block-infra hook; .githooks/pre-commit guard. Verified with scratchpad test suite.
- Files created/modified/deleted: docs/AI_RULES.md, scripts/ai/sync_rules.*, AGENTS.md, .zcode/RULES.md, .github/copilot-instructions.md, .cursor/rules/ai-rules.mdc, GEMINI.md, .windsurfrules, .clinerules, CONVENTIONS.md, .zcodeignore, CLAUDE.md, frontend/public/i18n/bn.json, frontend/public/i18n/en.json, frontend/public/i18n/keys.tsv, frontend/src/app/features/member/pages/amendments/amendments.component.ts, frontend/src/app/features/member/pages/complaints/complaints.component.ts, frontend/src/app/features/member/pages/complaints/emergency-help.component.ts, frontend/src/app/features/member/pages/dashboard/member-dashboard.component.html, frontend/src/app/features/member/pages/dashboard/member-dashboard.component.ts, frontend/src/app/features/member/pages/elections/elections.component.ts, frontend/src/app/features/member/pages/fund-transparency/fund-transparency.component.html, frontend/src/app/features/member/pages/fund-transparency/fund-transparency.component.scss, frontend/src/app/features/member/pages/fund-transparency/fund-transparency.component.ts, frontend/src/app/features/member/pages/membership/membership.component.ts, frontend/src/app/features/member/pages/petitions/petitions.component.ts, frontend/src/app/features/member/pages/profile/my-data-panel.component.ts, frontend/src/app/features/member/pages/service-standard/service-standard.component.ts
- Remaining work (exact): User must enable the git hooks folder once (see .githooks/pre-commit header); AI is not allowed to change git hook config. Commit new files when ready.
- Notes for the next agent: none

### [SESSION-20261011-1821-claude] START
- Agent: claude
- Model: claude-opus-5-5
- Started (UTC): 2026-10-11 18:21
- User prompt: Implement global smart loader plan
- Resumed from: none
- Plan: service, interceptor, component, wiring, opt-outs, verify
#### CHECKPOINTS
- [18:30] Phase 1-2: LoaderService + loader interceptor + context tokens, 13 tests green -> frontend/src/app/core/services/loader.service*.ts, frontend/src/app/core/interceptors/loader*.ts -> Phase 3: create shared/loader/global-loader.component (bar + overlay), then wire app.ts/app.config.ts, i18n, SKIP_LOADER on media-token + subscription-quote
- [18:42] Phase 3-5: global-loader component, wiring, i18n, SKIP_LOADER opt-outs; 378 tests + build pass -> frontend/src/app/shared/loader/*, app.ts, app.config.ts, media-token.service.ts, registration.service.ts, public/i18n/* -> Manual visual QA in browser (bar on GET, overlay on POST, mobile 360px, dark theme), then commit when user asks
### END
- Ended (UTC): 2026-10-11 18:42
- End reason: COMPLETED
- Summary of work done: Global smart loader: LoaderService (debounced show/min-visible/slow flag), loaderInterceptor + SKIP_LOADER/LOADER_MODE tokens, app-global-loader (top bar for reads/route loads, blocking overlay for writes), i18n bn/en, opt-outs on media-token + subscription-quote. 378 tests pass, build OK.
- Files created/modified/deleted: frontend/src/app/core/services/loader.service*.ts, frontend/src/app/core/interceptors/loader*.ts, frontend/src/app/shared/loader/*, app.ts, app.config.ts, media-token.service.ts, registration.service.ts, public/i18n/*, frontend/public/i18n/bn.json, frontend/public/i18n/en.json, frontend/public/i18n/keys.tsv, frontend/src/app/app.config.ts, frontend/src/app/app.ts, frontend/src/app/core/services/media-token.service.ts, frontend/src/app/core/services/registration.service.ts, frontend/src/app/core/interceptors/loader-context.ts, frontend/src/app/core/interceptors/loader.interceptor.spec.ts, frontend/src/app/core/interceptors/loader.interceptor.ts, frontend/src/app/core/services/loader.service.spec.ts, frontend/src/app/core/services/loader.service.ts, frontend/src/app/shared/loader/
- Remaining work (exact): Manual browser QA on slow network; initial bundle 510.88kB vs 500kB budget warning (pre-existing or loader-related, unverified); commit when user asks
- Notes for the next agent: none
### END
- Ended (UTC): 2026-10-11 19:38
- End reason: COMPLETED
- Summary of work done: Redesigned 8 member governance pages (dashboard, service-standard, elections, complaints, membership, petitions, welfare-fund, amendments) with shared gov-* design primitives, colored data-tone badges, brand-green disabled buttons, success banners, ballot-style candidate cards, type-picker cards, timelines; sidebar auto-scroll for active item; 20 new i18n keys; vitest 378/378, ng build clean; visual QA 16 pages desktop+mobile all pass; E2E complaint submit verified
- Files created/modified/deleted: AI_SESSIONS.md, frontend/src/styles.scss, frontend/src/app/features/member/pages/complaints/emergency-help.component.ts, frontend/src/app/features/member/pages/profile/my-data-panel.component.ts, frontend/src/app/features/member/pages/fund-transparency/{fund-transparency.component.html, scss, ts}, frontend/public/i18n/{bn, en}.json
- Remaining work (exact): none — task complete. Note: most page redesign files were committed by a concurrent session inside 30f6dfd/c5ffcc8; this session committed 5eef9b1 (sidebar scroll fix). QA artifacts in /tmp/qa-gov. Member QA login: 01711000002/Member@123 (member 1 keeps being reset by another process)
- Notes for the next agent: A concurrent agent session was active on the same tree — it committed this session's uncommitted redesign work and reset member-1's password 3x via admin API

### [SESSION-20261012-0545-claude] START
- Agent: claude
- Model: claude-sonnet-5-5
- Started (UTC): 2026-10-12 05:45
- User prompt: Per-view section loaders + responsive layout for management pages (plan approved: phases 1-2 first)
- Resumed from: none
- Plan: shared loader/LoadState, fix 3 screenshot pages, then rollout
#### CHECKPOINTS
- [05:48] Phase 1-2: section-loader component+spec, global skeleton/tab/table/checkbox CSS, governance per-tab loading, review+committee wired; build+378 tests OK -> frontend/src/styles.scss, frontend/src/app/shared/section-loader/*, management/pages/{membership-governance,membership-review,committee-registry} -> Visual check at 360/768/1440 of 3 pages, then Phase 3 rollout to remaining pages in batches
### END
- Ended (UTC): 2026-10-12 05:49
- End reason: HANDOFF
- Summary of work done: Phases 1-2 done: shared <app-section-loader>, global skeleton/tab/table/checkbox CSS, per-tab loading on Membership Governance, loader on Membership Review + Committee Registry. Build OK, 382 tests pass.
- Files created/modified/deleted: frontend/src/styles.scss, frontend/src/app/shared/section-loader/*, management/pages/{membership-governance, membership-review, committee-registry}, frontend/src/app/features/management/pages/committee-registry/committee-registry.component.ts, frontend/src/app/features/management/pages/membership-governance/membership-governance.component.ts, frontend/src/app/features/management/pages/membership-review/membership-review.component.ts, frontend/src/app/shared/section-loader/
- Remaining work (exact): Phase 3: roll <app-section-loader> + responsive table/tab fixes to remaining ~45 management/member pages in batches; visual check at 360/768/1440 not done (needs running app)
- Notes for the next agent: Initial bundle 512 kB vs 500 kB budget (was 510.9 before; pre-existing overage)

### [SESSION-20261012-0613-claude] START
- Agent: claude
- Model: claude-sonnet-5-5
- Started (UTC): 2026-10-12 06:13
- User prompt: Complete all phases: roll section loader + responsive fixes across all remaining pages
- Resumed from: SESSION-20261012-0545-claude
- Plan: 4 parallel agents by area, then build/test/verify
#### CHECKPOINTS

## ARCHIVE
<!-- Sessions older than the last 10 move here, condensed to 3-5 lines each. -->
