# CLAUDE.md

Claude Code loads this file at session start. Project-wide rules, commands and
conventions live in `AGENTS.md` (single source of truth, shared with every AI tool).

@AGENTS.md

## Claude Code specifics

- Guardrails: `.claude/settings.json` deny-rules plus the `scripts/ai/block-infra.sh`
  PreToolUse hook enforce the FORBIDDEN ACTIONS in `AGENTS.md`. Never weaken them.
- Useful review agents for this stack: `python-reviewer` (backend), `typescript-reviewer`
  (Angular frontend), `flutter-reviewer` / `dart-build-resolver` (mobile).
- Feature contracts (batch specs) live in `docs/batch*-contract.md` — read the relevant
  one before changing public registration, payments, navigation, map, admin, login or
  performance/a11y behavior.
- Cache rules (`CACHE_INTEGRATION.md`): any route reading cached data must be listed in
  `TABLE_DEPENDENCIES` in `backend/app/core/cache.py`; new tables that back cached reads
  must be added there or stale data ships.

## Directory notes

- `backend/` — FastAPI app. See `backend/CLAUDE.md`.
- `frontend/` — Angular 22 member/admin web app (source of truth for behavior & design).
- `mobile/` — Flutter port of the Angular app. See `mobile/CLAUDE.md`.
- `web/` — legacy/scratch Angular workspace (hr/operations); do not extend without asking.
- Root `README.md` documents the LEGACY Google-Sheets prototype flow — superseded by the
  FastAPI/Angular app; see `docs/BUSINESS.md` for current business logic.
