"""In-process read caches built on cachetools.

Rules that keep this safe:

* Every cache is a bounded ``TTLCache``; sizes and TTLs come from settings.
* Values are deep-copied on the way in and out, so no caller can mutate what
  another request will be served. Callers cache plain data (dicts / lists /
  frozensets), never ORM objects bound to a session.
* Concurrent misses on one key share a single load (single-flight).
* A per-cache generation counter makes ``invalidate`` win over a load that
  was already in flight: its (possibly stale) result is returned to its own
  caller but never stored.
* Committed writes invalidate automatically: SQLAlchemy session events record
  which tables a transaction touched and, *after commit*, clear every cache in
  ``TABLE_DEPENDENCIES``. Nothing is cleared for writes that never commit.

Per-process only: the deployment runs a single uvicorn worker. With more
workers each process has its own copy and invalidations do not propagate, so
TTLs must stay short until a shared cache (Redis) replaces this module.
"""

import asyncio
import copy
import logging
import threading
import time
from collections.abc import Awaitable, Callable, Hashable
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, TypeVar

from cachetools import TTLCache
from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session
from starlette.responses import Response

from app.core.config import get_settings

logger = logging.getLogger(__name__)

T = TypeVar("T")

_PENDING_TABLES_KEY = "cache_pending_tables"
CACHE_STATUS_HEADER = "X-Cache"


class CacheName(StrEnum):
    PERMISSIONS = "permissions"
    PUBLIC_LISTS = "public_lists"
    FEE_RATES = "fee_rates"
    FINANCE_SUMMARY = "finance_summary"


# Table name -> caches whose content is derived from it. A committed insert,
# update or delete on any of these tables clears the listed caches. When a new
# cached read starts depending on another table, add it here.
TABLE_DEPENDENCIES: dict[str, tuple[CacheName, ...]] = {
    "admin_users": (CacheName.PERMISSIONS,),
    "roles": (CacheName.PERMISSIONS,),
    "permissions": (CacheName.PERMISSIONS,),
    "user_permission_overrides": (CacheName.PERMISSIONS,),
    "notices": (CacheName.PUBLIC_LISTS,),
    "events": (CacheName.PUBLIC_LISTS,),
    "config_list_items": (CacheName.PUBLIC_LISTS,),
    "members": (CacheName.PUBLIC_LISTS,),
    "roadmap_items": (CacheName.PUBLIC_LISTS,),
    "roadmap_timeframes": (CacheName.PUBLIC_LISTS,),
    "fee_settings": (CacheName.FEE_RATES,),
    "fee_types": (CacheName.FEE_RATES,),
    "financial_transactions": (CacheName.FINANCE_SUMMARY,),
}


@dataclass
class _NamedCache:
    name: CacheName
    store: TTLCache
    lock: threading.RLock = field(default_factory=threading.RLock)
    generation: int = 0
    hits: int = 0
    misses: int = 0
    invalidations: int = 0
    inflight: dict[Hashable, asyncio.Future] = field(default_factory=dict)


_registry: dict[CacheName, _NamedCache] = {}


def _limits(name: CacheName) -> tuple[int, float]:
    settings = get_settings()
    return (
        getattr(settings, f"cache_{name.value}_maxsize"),
        getattr(settings, f"cache_{name.value}_ttl"),
    )


def configure(timer: Callable[[], float] = time.monotonic) -> None:
    """(Re)build every cache from settings. Tests pass a fake ``timer``."""
    _registry.clear()
    for name in CacheName:
        maxsize, ttl = _limits(name)
        _registry[name] = _NamedCache(name=name, store=TTLCache(maxsize=maxsize, ttl=ttl, timer=timer))


def is_enabled() -> bool:
    return get_settings().cache_enabled


def make_key(*parts: Hashable, **params: Any) -> tuple:
    """Normalized hashable key: positional parts in order, keyword params
    sorted by lowercased name, string values lowercased and stripped."""

    def norm(value: Any) -> Hashable:
        return value.strip().lower() if isinstance(value, str) else value

    normalized = sorted((name.lower(), norm(value)) for name, value in params.items())
    return (*(norm(part) for part in parts), *normalized)


def peek(name: CacheName, key: Hashable) -> Any | None:
    entry = _registry[name]
    with entry.lock:
        value = entry.store.get(key)
    return None if value is None else copy.deepcopy(value)


def put(name: CacheName, key: Hashable, value: Any) -> None:
    entry = _registry[name]
    stored = copy.deepcopy(value)
    with entry.lock:
        entry.store[key] = stored


async def get_or_load(
    name: CacheName, key: Hashable, loader: Callable[[], Awaitable[T]]
) -> tuple[T, bool]:
    """Return ``(value, was_hit)``. On a miss, one caller runs ``loader``;
    concurrent callers for the same key await that result."""
    if not is_enabled():
        return await loader(), False

    entry = _registry[name]
    with entry.lock:
        if key in entry.store:
            entry.hits += 1
            return copy.deepcopy(entry.store[key]), True
        entry.misses += 1
        pending = entry.inflight.get(key)
        is_leader = pending is None
        if is_leader:
            pending = asyncio.get_running_loop().create_future()
            entry.inflight[key] = pending
            generation = entry.generation

    if not is_leader:
        return copy.deepcopy(await asyncio.shield(pending)), False

    try:
        value = await loader()
    except BaseException as exc:
        with entry.lock:
            entry.inflight.pop(key, None)
        pending.set_exception(exc)
        # Mark retrieved so an error with no waiters is not logged as unhandled.
        pending.exception()
        raise

    stored = copy.deepcopy(value)
    with entry.lock:
        entry.inflight.pop(key, None)
        if entry.generation == generation:
            entry.store[key] = stored
    pending.set_result(stored)
    return value, False


async def cached_response(
    response: Response, name: CacheName, key: Hashable, loader: Callable[[], Awaitable[T]]
) -> T:
    """``get_or_load`` for route handlers: also sets ``X-Cache: HIT|MISS``."""
    value, hit = await get_or_load(name, key, loader)
    response.headers[CACHE_STATUS_HEADER] = "HIT" if hit else "MISS"
    return value


def invalidate(name: CacheName, key: Hashable | None = None, *, reason: str) -> None:
    """Drop one key, or the whole cache when ``key`` is None."""
    entry = _registry[name]
    with entry.lock:
        entry.generation += 1
        entry.invalidations += 1
        if key is None:
            entry.store.clear()
        else:
            entry.store.pop(key, None)
    logger.debug("[cache] invalidate %s key=%r reason=%s", name.value, key, reason)


def clear_all(*, reason: str) -> None:
    for name in CacheName:
        invalidate(name, reason=reason)


def get_cache_stats() -> list[dict[str, Any]]:
    rows = []
    for name, entry in _registry.items():
        with entry.lock:
            lookups = entry.hits + entry.misses
            rows.append(
                {
                    "name": name.value,
                    "enabled": is_enabled(),
                    "size": entry.store.currsize,
                    "maxsize": entry.store.maxsize,
                    "ttl_seconds": entry.store.ttl,
                    "hits": entry.hits,
                    "misses": entry.misses,
                    "hit_ratio": round(entry.hits / lookups, 4) if lookups else 0.0,
                    "invalidations": entry.invalidations,
                }
            )
    return rows


# --- named invalidation helpers (explicit calls from write paths) -----------


def invalidate_permissions(reason: str = "rbac change") -> None:
    invalidate(CacheName.PERMISSIONS, reason=reason)


def invalidate_public_lists(reason: str = "public content change") -> None:
    invalidate(CacheName.PUBLIC_LISTS, reason=reason)


def invalidate_fee_rates(reason: str = "fee settings change") -> None:
    invalidate(CacheName.FEE_RATES, reason=reason)


def invalidate_finance(reason: str = "finance change") -> None:
    invalidate(CacheName.FINANCE_SUMMARY, reason=reason)


# --- commit-driven invalidation ---------------------------------------------


def _remember(session: Session, table_names: set[str]) -> None:
    if table_names:
        session.info.setdefault(_PENDING_TABLES_KEY, set()).update(table_names)


@event.listens_for(Session, "after_flush")
def _track_flushed_tables(session: Session, _flush_context: Any) -> None:
    touched = {*session.new, *session.dirty, *session.deleted}
    _remember(session, {obj.__table__.name for obj in touched if hasattr(obj, "__table__")})


@event.listens_for(Session, "do_orm_execute")
def _track_bulk_statements(state: ORMExecuteState) -> None:
    if not (state.is_insert or state.is_update or state.is_delete):
        return
    table = getattr(state.statement, "table", None)
    if table is not None:
        _remember(state.session, {table.name})


@event.listens_for(Session, "after_commit")
def _invalidate_after_commit(session: Session) -> None:
    # Leftovers from a rolled-back transaction are kept until the next commit:
    # an extra invalidation is harmless, a missed one serves stale data.
    tables = session.info.pop(_PENDING_TABLES_KEY, set())
    names = {name for table in tables for name in TABLE_DEPENDENCIES.get(table, ())}
    for name in names:
        invalidate(name, reason=f"commit touched {sorted(tables)}")


configure()
