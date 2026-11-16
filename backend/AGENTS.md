# Backend — FastAPI

Read root `AGENTS.md` first; the FORBIDDEN ACTIONS there apply doubly here
(especially: never run alembic/DB commands — generating migration files is fine).

## Layout

- `app/main.py` — FastAPI app (GZip middleware, routers, startup).
- `app/api/routes/` — route modules; `app/services/` — business logic;
  `app/models/` — SQLAlchemy models; `app/schemas/` — Pydantic schemas.
- `app/core/cache.py` — in-process TTL caches. Any route reading a cached name must
  have its read paths covered by `TABLE_DEPENDENCIES` or users see stale data.
- `alembic/versions/` — migrations (write-only for AI agents).
- `tests/` — pytest, mirrors route files. `pytest.ini`: `asyncio_mode = auto`.

## Commands

```bash
python -m venv venv && venv\Scripts\activate      # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
pytest                                   # all
pytest tests/test_cache.py -k "name"     # one test
alembic revision --autogenerate -m "..." # generate migration file only
```

## Conventions

- Async SQLAlchemy 2.x; SQLite (`sqlite+aiosqlite:///./dev.db`) is fine for local
  dev/tests, PostgreSQL in production.
- JWT auth (access + refresh); passwords bcrypt. File uploads under `uploads/`.
- Follow existing route/service naming; add tests for new routes.
