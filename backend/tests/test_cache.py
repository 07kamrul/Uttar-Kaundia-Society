"""Unit tests for the in-process read cache (app/core/cache.py)."""

import asyncio
import threading
from datetime import date

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import cache
from app.core.cache import CacheName
from app.models.fee_settings import FeeSetting


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock() -> FakeClock:
    fake = FakeClock()
    cache.configure(timer=fake)
    yield fake
    cache.configure()


def _loader(value, calls: list):
    async def load():
        calls.append(1)
        return value

    return load


async def test_second_call_is_a_hit_and_skips_the_loader(clock: FakeClock) -> None:
    calls: list = []

    first, first_hit = await cache.get_or_load(CacheName.PUBLIC_LISTS, ("k",), _loader([1], calls))
    second, second_hit = await cache.get_or_load(CacheName.PUBLIC_LISTS, ("k",), _loader([2], calls))

    assert (first, first_hit) == ([1], False)
    assert (second, second_hit) == ([1], True)
    assert len(calls) == 1


async def test_entry_expires_after_ttl(clock: FakeClock) -> None:
    calls: list = []
    await cache.get_or_load(CacheName.PUBLIC_LISTS, ("k",), _loader("old", calls))

    clock.now += cache.get_settings().cache_public_lists_ttl + 1
    value, hit = await cache.get_or_load(CacheName.PUBLIC_LISTS, ("k",), _loader("new", calls))

    assert (value, hit) == ("new", False)
    assert len(calls) == 2


async def test_maxsize_evicts_entries(clock: FakeClock) -> None:
    maxsize = cache.get_settings().cache_public_lists_maxsize
    for index in range(maxsize + 10):
        await cache.get_or_load(CacheName.PUBLIC_LISTS, (index,), _loader(index, []))

    stats = {row["name"]: row for row in cache.get_cache_stats()}
    assert stats["public_lists"]["size"] == maxsize


async def test_returned_value_mutation_does_not_leak_into_cache(clock: FakeClock) -> None:
    first, _ = await cache.get_or_load(CacheName.PUBLIC_LISTS, ("k",), _loader({"items": [1]}, []))
    first["items"].append(99)

    second, hit = await cache.get_or_load(CacheName.PUBLIC_LISTS, ("k",), _loader({}, []))

    assert hit is True
    assert second == {"items": [1]}


async def test_concurrent_misses_compute_once(clock: FakeClock) -> None:
    calls: list = []

    async def slow_load():
        calls.append(1)
        await asyncio.sleep(0.05)
        return "value"

    results = await asyncio.gather(
        *(cache.get_or_load(CacheName.FEE_RATES, ("same",), slow_load) for _ in range(20))
    )

    assert len(calls) == 1
    assert all(value == "value" for value, _ in results)


async def test_loader_error_is_not_cached_and_reaches_every_waiter(clock: FakeClock) -> None:
    async def failing():
        await asyncio.sleep(0.01)
        raise RuntimeError("boom")

    results = await asyncio.gather(
        *(cache.get_or_load(CacheName.FEE_RATES, ("x",), failing) for _ in range(3)),
        return_exceptions=True,
    )
    assert all(isinstance(result, RuntimeError) for result in results)

    value, hit = await cache.get_or_load(CacheName.FEE_RATES, ("x",), _loader("ok", []))
    assert (value, hit) == ("ok", False)


async def test_invalidation_during_load_discards_the_stale_result(clock: FakeClock) -> None:
    async def load_then_get_invalidated():
        cache.invalidate(CacheName.FINANCE_SUMMARY, reason="write landed mid-load")
        return "stale"

    value, _ = await cache.get_or_load(CacheName.FINANCE_SUMMARY, ("k",), load_then_get_invalidated)
    fresh, hit = await cache.get_or_load(CacheName.FINANCE_SUMMARY, ("k",), _loader("fresh", []))

    assert value == "stale"  # the in-flight caller still gets its own read
    assert (fresh, hit) == ("fresh", False)  # but it was never stored


async def test_invalidate_single_key_keeps_others(clock: FakeClock) -> None:
    await cache.get_or_load(CacheName.PUBLIC_LISTS, ("a",), _loader(1, []))
    await cache.get_or_load(CacheName.PUBLIC_LISTS, ("b",), _loader(2, []))

    cache.invalidate(CacheName.PUBLIC_LISTS, ("a",), reason="test")

    _, a_hit = await cache.get_or_load(CacheName.PUBLIC_LISTS, ("a",), _loader(1, []))
    _, b_hit = await cache.get_or_load(CacheName.PUBLIC_LISTS, ("b",), _loader(2, []))
    assert (a_hit, b_hit) == (False, True)


async def test_clear_all_empties_every_cache(clock: FakeClock) -> None:
    for name in CacheName:
        await cache.get_or_load(name, ("k",), _loader(1, []))

    cache.clear_all(reason="test")

    assert all(row["size"] == 0 for row in cache.get_cache_stats())


async def test_disabled_cache_always_calls_loader(clock: FakeClock, monkeypatch) -> None:
    monkeypatch.setattr(cache, "is_enabled", lambda: False)
    calls: list = []

    for _ in range(3):
        value, hit = await cache.get_or_load(CacheName.PUBLIC_LISTS, ("k",), _loader("v", calls))
        assert (value, hit) == ("v", False)

    assert len(calls) == 3


async def test_stats_report_hits_misses_and_ratio(clock: FakeClock) -> None:
    for _ in range(4):
        await cache.get_or_load(CacheName.PERMISSIONS, ("k",), _loader(1, []))

    row = next(r for r in cache.get_cache_stats() if r["name"] == "permissions")
    assert (row["hits"], row["misses"], row["hit_ratio"]) == (3, 1, 0.75)
    assert row["ttl_seconds"] == cache.get_settings().cache_permissions_ttl


def test_sync_access_from_threads_is_safe(clock: FakeClock) -> None:
    errors: list[BaseException] = []

    def worker(offset: int) -> None:
        try:
            for index in range(500):
                cache.put(CacheName.PUBLIC_LISTS, (offset, index % 50), index)
                cache.peek(CacheName.PUBLIC_LISTS, (offset, index % 50))
                if index % 97 == 0:
                    cache.invalidate(CacheName.PUBLIC_LISTS, reason="thread test")
        except BaseException as exc:  # noqa: BLE001 - surfaced via the assertion below
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(n,)) for n in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []


def test_make_key_normalizes_equivalent_requests() -> None:
    assert cache.make_key("notices", limit=10, Lang="BN") == cache.make_key(
        "notices", lang="bn", limit=10
    )
    assert cache.make_key("notices", limit=10) != cache.make_key("notices", limit=11)


async def test_commit_of_mapped_table_invalidates_dependent_cache(
    clock: FakeClock, db_session: AsyncSession
) -> None:
    await cache.get_or_load(CacheName.FEE_RATES, ("k",), _loader(1, []))
    db_session.add(FeeSetting(key="picnic_fee", value=1, start_date=date(2001, 1, 1)))

    await db_session.flush()
    _, hit_before_commit = await cache.get_or_load(CacheName.FEE_RATES, ("k",), _loader(2, []))
    await db_session.commit()
    value, hit_after_commit = await cache.get_or_load(CacheName.FEE_RATES, ("k",), _loader(3, []))

    assert hit_before_commit is True  # nothing visible to other readers yet
    assert (value, hit_after_commit) == (3, False)


async def test_bulk_update_statement_invalidates_on_commit(
    clock: FakeClock, db_session: AsyncSession
) -> None:
    await cache.get_or_load(CacheName.FEE_RATES, ("k",), _loader(1, []))

    await db_session.execute(update(FeeSetting).values(value=FeeSetting.value))
    await db_session.commit()

    _, hit = await cache.get_or_load(CacheName.FEE_RATES, ("k",), _loader(2, []))
    assert hit is False


async def test_unrelated_table_commit_keeps_other_caches(
    clock: FakeClock, db_session: AsyncSession
) -> None:
    await cache.get_or_load(CacheName.PUBLIC_LISTS, ("k",), _loader(1, []))
    db_session.add(FeeSetting(key="picnic_fee", value=1, start_date=date(2001, 1, 1)))
    await db_session.commit()

    _, hit = await cache.get_or_load(CacheName.PUBLIC_LISTS, ("k",), _loader(2, []))
    assert hit is True  # fee_settings does not feed public_lists
