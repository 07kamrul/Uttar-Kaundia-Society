import logging

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route

from app.core import timing
from app.core.timing import TimingMiddleware, format_server_timing, install_query_listeners


def test_format_server_timing_splits_db_and_app_time():
    header = format_server_timing(total_ms=120.0, db_ms=80.0, queries=4)

    assert "db;dur=80.0" in header
    assert "app;dur=40.0" in header
    assert "total;dur=120.0" in header
    assert '"4 queries"' in header


def test_format_server_timing_never_reports_negative_app_time():
    assert "app;dur=0.0" in format_server_timing(total_ms=5.0, db_ms=9.0, queries=1)


@pytest.fixture
async def client_and_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    install_query_listeners(engine.sync_engine)

    async def three_queries(request):
        async with engine.connect() as conn:
            for _ in range(3):
                await conn.execute(text("SELECT 1"))
        return JSONResponse({"ok": True})

    async def no_queries(request):
        return JSONResponse({"ok": True})

    app = Starlette(routes=[Route("/q", three_queries), Route("/n", no_queries)])
    app.add_middleware(TimingMiddleware)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        yield client
    await engine.dispose()


async def test_response_carries_server_timing_with_query_count(client_and_engine):
    response = await client_and_engine.get("/q")

    assert response.status_code == 200
    assert '"3 queries"' in response.headers["server-timing"]


async def test_request_without_queries_reports_zero(client_and_engine):
    response = await client_and_engine.get("/n")

    assert '"0 queries"' in response.headers["server-timing"]


async def test_query_counts_do_not_leak_between_requests(client_and_engine):
    await client_and_engine.get("/q")
    response = await client_and_engine.get("/n")

    assert '"0 queries"' in response.headers["server-timing"]


async def test_slow_request_is_logged(client_and_engine, monkeypatch, caplog):
    monkeypatch.setattr(timing, "SLOW_REQUEST_MS", 0)

    with caplog.at_level(logging.WARNING, logger="app.core.timing"):
        await client_and_engine.get("/n")

    assert any("[perf] GET '/n'" in record.message for record in caplog.records)


async def test_fast_request_is_not_logged(client_and_engine, caplog):
    with caplog.at_level(logging.WARNING, logger="app.core.timing"):
        await client_and_engine.get("/n")

    assert not any("[perf]" in record.message for record in caplog.records)
