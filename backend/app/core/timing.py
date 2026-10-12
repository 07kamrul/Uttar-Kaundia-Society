"""Per-request timing: Server-Timing header, slow-request log, query counter.

Phase 0 of the performance work. It makes slow endpoints measurable from the
browser (DevTools > Network > Timing shows ``app`` and ``db``) and from the
server log, and flags N+1 patterns through the query count.
"""

import logging
import time
from contextvars import ContextVar
from dataclasses import dataclass

from sqlalchemy import event
from sqlalchemy.engine import Engine
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)

SLOW_REQUEST_MS = 500
MANY_QUERIES = 15


@dataclass
class RequestStats:
    queries: int = 0
    db_seconds: float = 0.0


_current_stats: ContextVar[RequestStats | None] = ContextVar("request_stats", default=None)


def install_query_listeners(engine: Engine) -> None:
    """Attach cursor listeners to a sync engine (pass ``async_engine.sync_engine``)."""

    @event.listens_for(engine, "before_cursor_execute")
    def _before(conn, cursor, statement, parameters, context, executemany):  # noqa: ARG001
        stats = _current_stats.get()
        if stats is not None:
            context._perf_started = time.perf_counter()

    @event.listens_for(engine, "after_cursor_execute")
    def _after(conn, cursor, statement, parameters, context, executemany):  # noqa: ARG001
        stats = _current_stats.get()
        started = getattr(context, "_perf_started", None)
        if stats is not None and started is not None:
            stats.db_seconds += time.perf_counter() - started
            stats.queries += 1


def format_server_timing(total_ms: float, db_ms: float, queries: int) -> str:
    app_ms = max(total_ms - db_ms, 0)
    return (
        f'db;dur={db_ms:.1f}, app;dur={app_ms:.1f}, total;dur={total_ms:.1f}, '
        f'q;desc="{queries} queries"'
    )


class TimingMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        stats = RequestStats()
        token = _current_stats.set(stats)
        started = time.perf_counter()

        async def send_with_timing(message: Message) -> None:
            if message["type"] == "http.response.start":
                total_ms = (time.perf_counter() - started) * 1000
                headers = MutableHeaders(scope=message)
                headers["Server-Timing"] = format_server_timing(
                    total_ms, stats.db_seconds * 1000, stats.queries
                )
            await send(message)

        try:
            await self.app(scope, receive, send_with_timing)
        finally:
            total_ms = (time.perf_counter() - started) * 1000
            if total_ms >= SLOW_REQUEST_MS or stats.queries >= MANY_QUERIES:
                logger.warning(
                    "[perf] %s %r took %.0f ms (db %.0f ms, %d queries)",
                    scope.get("method"),
                    scope.get("path"),
                    total_ms,
                    stats.db_seconds * 1000,
                    stats.queries,
                )
            _current_stats.reset(token)
