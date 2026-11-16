# AGENTS.md — Kaundia Member Registry

Instructions for every AI coding agent (Claude, Codex, Cursor, Gemini, etc.).
Claude Code imports this file from its `CLAUDE.md`; other tools read it directly.

Generated AI-rules block is at the bottom (do not edit inside its markers).

## Project Overview

Member registration, approval and dues (subscription/installment) management for
উত্তর কাউন্দিয়া আবাসন মালিক কল্যাণ সোসাইটি (Uttar Kaundia Residential Landowners'
Welfare Association, Bangladesh). Single-locale Bengali web app. See
`docs/BUSINESS.md` for full business logic and user stories.

| Directory | What it is |
|---|---|
| `backend/` | FastAPI + SQLAlchemy 2 (async) + Alembic + PostgreSQL (SQLite for dev/tests). JWT auth, file uploads, aiosmtplib email. |
| `frontend/` | Angular 22 standalone-component web app — **source of truth** for behavior and design. |
| `mobile/` | Flutter port of the Angular app (Clean Architecture, `flutter_bloc`). Consume backend unchanged. |
| `web/` | Legacy/scratch Angular workspace (hr/operations). Do not extend. |
| `docs/` | Business overview, batch contracts, governance, runbooks, AI rules source. |

The root `README.md` documents the LEGACY Google Sheets/Drive prototype — superseded.

## Commands

### Backend (`backend/`)

```bash
cd backend
python -m venv venv && venv\Scripts\activate   # Windows
pip install -r requirements.txt
cp .env.example .env                            # set DATABASE_URL etc.
uvicorn app.main:app --reload                   # dev server (SQLite: DATABASE_URL=sqlite+aiosqlite:///./dev.db)
pytest                                          # all tests (pytest.ini: asyncio_mode=auto)
pytest tests/test_cache.py                      # single file
pytest tests/test_cache.py -k "name"            # single test
alembic revision --autogenerate -m "..."        # generate migration (writing files is allowed)
```

### Frontend (`frontend/`)

```bash
cd frontend
npm install
npm start        # ng serve (dev)
npm run build    # ng build
npm test         # ng test
```

### Mobile (`mobile/`)

```bash
cd mobile
flutter pub get
flutter gen-l10n
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000/api --dart-define=APP_FLAVOR=dev
flutter analyze   # must be clean
flutter test      # must be green
```

## Per-Area Layout & Conventions

This is the only rules file in the repository — there are no per-directory
`AGENTS.md` / `CLAUDE.md` files. All areas are covered here.

### Backend (`backend/`) — FastAPI

Layout:

- `app/main.py` — FastAPI app (GZip middleware, routers, startup).
- `app/api/routes/` — route modules; `app/services/` — business logic;
  `app/models/` — SQLAlchemy models; `app/schemas/` — Pydantic schemas.
- `app/core/cache.py` — in-process TTL caches. Any route reading a cached name must
  have its read paths covered by `TABLE_DEPENDENCIES` or users see stale data.
- `alembic/versions/` — migrations (write-only for AI agents).
- `tests/` — pytest, mirrors route files. `pytest.ini`: `asyncio_mode = auto`.

Conventions:

- Async SQLAlchemy 2.x style; routes in `app/api/routes/`, services in
  `app/services/`, Pydantic schemas in `app/schemas/`. Follow existing patterns in
  the area you touch; tests mirror route files in `backend/tests/`.
- SQLite (`sqlite+aiosqlite:///./dev.db`) is fine for local dev/tests, PostgreSQL
  in production.
- JWT auth (access + refresh); passwords bcrypt. File uploads under `uploads/`.
- FORBIDDEN ACTIONS apply doubly here (especially: never run alembic/DB commands —
  generating migration files is fine).

### Frontend (`frontend/`) — Angular 22

Layout:

- `src/app/features/<area>/` — feature-first: pages/components per area
  (`auth`, `home`, `dashboard`, `member`, `management`, `public-registration`,
  `public-pages`, `public-shell`).
- `src/app/core/` — services, guards (`auth`, `permission`, `role`), interceptors,
  models, routing.
- `public/i18n/{bn,en}.json` — translations. Never hard-code user-visible strings.
- `src/styles.scss` — global styles / theme.

Conventions:

- Standalone components (no NgModules).
- Permission checks go through the core guards/rbac service, not ad-hoc role strings.
- Browser GET cache: `src/app/core/interceptors/cache.interceptor.ts` (60s, cleared on
  writes/logout) — new write endpoints clear it; don't bypass it for authenticated GETs.
- Behavior changes to registration/payments/admin flows: read the matching
  `docs/batch*-contract.md` first.
- This app is the **source of truth** for behavior and design; the Flutter app in
  `mobile/` ports from it.

### Mobile (`mobile/`) — Flutter port of the Angular frontend

Read `mobile/CONVENTIONS.md` before writing any feature code.
`mobile/ANGULAR_SOURCE_OF_TRUTH.md` maps each screen to its Angular source — port
behavior, fields, validation and states from there; do not change backend contracts.

Layout:

- `lib/core/` — config, `ApiClient` (dio) + error mapping, auth/session + permissions,
  router guards, theme, nav config, DI (`get_it`, `sl<T>()`).
- `lib/shared/` — design-system widgets ported from Angular primitives; file utils.
- `lib/features/<area>/{data,domain,presentation}/` — DTOs/mappers → BLoC → pages.

Hard rules (from CONVENTIONS.md):

- No API calls or business logic in widgets — widgets read state, dispatch events.
- Enums for string variants (`lib/core/enums/enums.dart`); never scatter raw status strings.
- Hand-written mappers (`toEntity()` / `toDto()` extensions); `json_serializable` for DTOs only.
- All user-visible strings in BOTH `lib/l10n/app_bn.arb` (template) and `app_en.arb`,
  then run `flutter gen-l10n`. Bangla default.

## Code Style & Conventions

- **Python (backend)**: async SQLAlchemy 2.x style, routes in `app/api/routes/`,
  services in `app/services/`, Pydantic schemas in `app/schemas/`. Follow existing
  patterns in the area you touch; tests mirror route files in `backend/tests/`.
- **Angular (frontend)**: standalone components, feature-first under
  `src/app/features/<area>/`, core services/guards/interceptors under `src/app/core/`.
  i18n via `public/i18n/{bn,en}.json` — never hard-code user-visible strings.
- **Flutter (mobile)**: read `mobile/CONVENTIONS.md` before writing any feature code.
  Feature-first Clean Architecture (`lib/features/<area>/{data,domain,presentation}/`),
  no API calls in widgets, all strings in `lib/l10n/app_{bn,en}.arb` (Bangla template).
  `mobile/ANGULAR_SOURCE_OF_TRUTH.md` maps each screen to its Angular source.

## Architecture Gotchas

- **Caching**: server read caches in `backend/app/core/cache.py`. A route reading
  cached data must be covered by `TABLE_DEPENDENCIES` or it serves stale data. Browser
  GET cache: `frontend/src/app/core/interceptors/cache.interceptor.ts` (60s, cleared on
  writes). Details: `CACHE_INTEGRATION.md`.
- **Migrations**: writing `alembic/versions/` files is allowed; running any alembic
  command is forbidden (see rules below).
- **Contracts**: behavior changes to registration/payments/navigation/map/admin/login/
  perf-a11y are specified in `docs/batch*-contract.md` — read first.

## Commits & PRs

- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- The `.githooks/pre-commit` hook (enable: `git config core.hooksPath .githooks`) blocks
  secrets/database files and stale AI-rule copies. Keep it enabled.
- Before committing changes to `docs/AI_RULES.md`, run `bash scripts/ai/sync_rules.sh`.
- Commit only when the user asks.

## Rules Compliance

This root `AGENTS.md` (imported by root `CLAUDE.md`) is the only AI rules file in
the repository. There are no nested per-directory rules files; everything applies
from here.

<!-- BEGIN:ai-rules -->
<!-- GENERATED from docs/AI_RULES.md by scripts/ai/sync_rules.sh. Do not edit here. -->
# AI RULES — MANDATORY FOR EVERY AI AGENT

Applies to every AI agent or assistant working in this repository: Claude, Codex, z.ai / ZCode, OpenCode, GitHub Copilot, Cursor, Gemini, Windsurf, Cline, Aider, and any other.
These rules override your default behavior. If a user request conflicts with them, stop and ask the user.

Source of truth: `docs/AI_RULES.md`. Copies in other files are generated by `scripts/ai/sync_rules.sh` — edit the source, never the copies.

## 1. FORBIDDEN ACTIONS (never do these, no exceptions)

1. **No database access.** Never connect to, query, dump, restore, or migrate any database — local or production. This includes `psql`, `mysql`, `sqlite3`, `mongosh`, `redis-cli`, `pg_dump`, `pg_restore`, opening `backend/db.sqlite3`, and `alembic upgrade|downgrade|stamp`. Writing migration files is allowed; running them is not.
2. **No server access.** Never connect to or operate any server or deployment: `ssh`, `scp`, `sftp`, `rsync` to remote hosts, Dokploy, `docker exec`, `docker compose exec`, `kubectl`, or any deploy command.
3. **No secrets.** Never read, print, copy, edit, or commit `.env` / `.env.*` files, private keys, tokens, or passwords. Never write secrets into code or logs.
4. **No destructive git.** Never run `git push --force`, `git reset --hard`, `git clean -f`, history rewrites, or branch deletion without explicit user approval.
5. **No bypassing guardrails.** Never disable, edit, or work around these rules, `.claude/settings.json`, `scripts/ai/block-infra.sh`, `opencode.json`, `.codex/config.toml`, the ignore files, or `.githooks/`, unless the user explicitly asks.

If one of these actions is genuinely needed, write out the exact command and ask the user to run it themselves.

## 2. WORKING RULES

- Follow the existing code conventions of the area you touch. Do not alter unrelated logic.
- Keep changes focused on the user's request; do not reformat or refactor unrelated files.
- Do not revert or overwrite another agent's or the user's uncommitted work unless it is broken and the user agrees.
- Commit only when the user asks. Use conventional commit messages (`feat:`, `fix:`, `docs:`, ...).
- Report results honestly: if tests fail or a step was skipped, say so.
<!-- END:ai-rules -->
