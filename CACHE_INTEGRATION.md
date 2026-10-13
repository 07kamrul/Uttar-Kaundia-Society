# Cache integration

How read caching works in this project, what is cached, and how it is cleared.
Code: [`backend/app/core/cache.py`](backend/app/core/cache.py) · tests: `backend/tests/test_cache*.py`.

## Layers

| Layer | Where | What it does |
|---|---|---|
| Server read caches | `backend/app/core/cache.py` | Bounded in-process `TTLCache`s (cachetools) for hot, mostly-static reads |
| Response compression | `backend/app/main.py` (`GZipMiddleware`, min 1000 bytes, level 6) | Smaller JSON on slow mobile data |
| Browser GET cache | `frontend/src/app/core/interceptors/cache.interceptor.ts` | Reuses identical authenticated GETs for 60 s (max 100 entries); any write or logout clears it |

## Server caches

| Cache (`CacheName`) | Used by | Cleared when these tables commit a change |
|---|---|---|
| `permissions` | `core/permissions.py` → effective permissions per admin | `admin_users`, `roles`, `permissions`, `user_permission_overrides` |
| `public_lists` | `GET /api/public/stats`, `/config-lists/{category}`, `/notices`, `/events`; roadmap | `notices`, `events`, `config_list_items`, `members`, `roadmap_items`, `roadmap_timeframes` |
| `fee_rates` | `GET /api/public/fee-settings` | `fee_settings`, `fee_types` |
| `finance_summary` | `services/finance.py` summary | `financial_transactions`, `config_list_items` |

The authoritative table → cache map is `TABLE_DEPENDENCIES` in `cache.py`.

### Safety rules (enforced in code)

- **Bounded:** every cache has a max size and a TTL from settings.
- **No shared mutation:** values are deep-copied in and out. Only plain data is cached, never ORM objects.
- **Single-flight:** concurrent misses on one key share a single load.
- **Invalidation wins:** a per-cache generation counter stops a load that was in flight during an invalidation from storing its stale result.
- **Auto-invalidation after commit:** SQLAlchemy session events record the touched tables and clear the dependent caches *after* the commit. Rolled-back writes clear nothing.
- **Member-specific responses** (profile, dues, payments) are not server-cached. The only per-user entry is the effective permission set, keyed per admin.
- **`X-Cache: HIT|MISS` response header** on endpoints served through `cached_response`, for debugging.

### Single-process limitation

The caches live in memory per process. The deployment runs **one uvicorn worker**. With more workers, invalidations would not reach the other processes. Keep TTLs short (default 60 s), or replace this module with a shared cache (e.g. Redis) before scaling out.

## Settings (environment variables)

| Variable | Default |
|---|---|
| `CACHE_ENABLED` | `true` (set `false` to bypass all server caches) |
| `CACHE_PERMISSIONS_TTL` / `CACHE_PERMISSIONS_MAXSIZE` | 60 s / 1024 |
| `CACHE_PUBLIC_LISTS_TTL` / `CACHE_PUBLIC_LISTS_MAXSIZE` | 60 s / 128 |
| `CACHE_FEE_RATES_TTL` / `CACHE_FEE_RATES_MAXSIZE` | 60 s / 256 |
| `CACHE_FINANCE_SUMMARY_TTL` / `CACHE_FINANCE_SUMMARY_MAXSIZE` | 60 s / 256 |

## Admin endpoints

Both require the `manage_system_config` permission.

- `GET /api/admin/cache/stats` returns hits, misses, size and invalidations per cache.
- `POST /api/admin/cache/clear` is an emergency flush of every cache. It records an audit-log entry (`cache.clear_all`) first.

There is no admin UI yet. A read-only stats view is planned under Settings › Advanced (see `docs/ux-simplification-audit.md` §6.2).

## Adding a new cached read

1. If no existing `CacheName` fits, add one with its `cache_<name>_ttl` / `cache_<name>_maxsize` settings.
2. Wrap the loader with `cached_response(response, CacheName.X, make_key(...), load)` for endpoints, or `get_or_load(...)` for services. Return plain data.
3. Add every table the result depends on to `TABLE_DEPENDENCIES`.
4. Add a test that a committed write to those tables invalidates the cache (see `tests/test_cache_public_reads.py`).
