"""The member plot map must not issue queries per boundary (N+1)."""

import pytest
from sqlalchemy import event

from tests.test_plot_boundaries import (  # noqa: F401 - autouse fixture
    BBOX,
    SQUARE,
    _approve,
    _draw,
    _fresh_rate_limiter,
    _make_admin,
    _member,
    _member_headers,
)

pytestmark = pytest.mark.asyncio


def _offset(geometry: dict, step: int) -> dict:
    ring = [[lng + 0.02 * step, lat] for lng, lat in geometry["coordinates"][0]]
    return {"type": "Polygon", "coordinates": [ring]}


async def _approved_boundaries(client, db_session, admin, count: int, start: int) -> None:
    for step in range(start, start + count):
        owner = await _member(db_session, f"Owner {step}", dag=f"5{step:02d}")
        drawn = await _draw(client, owner, geometry=_offset(SQUARE, step))
        assert drawn.status_code == 201, drawn.text
        assert (await _approve(client, admin, db_session, drawn.json()["id"])).status_code == 200


async def _map_query_count(client, db_session, viewer) -> tuple[int, int]:
    statements: list[str] = []
    engine = db_session.bind.sync_engine

    def record(conn, cursor, statement, *args) -> None:  # noqa: ARG001
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        response = await client.get(f"/api/member/plot-map?bbox={BBOX}", headers=_member_headers(viewer))
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert response.status_code == 200
    return len(statements), response.json()["count"]


async def test_plot_map_query_count_is_independent_of_boundary_count(client, db_session):
    admin = await _make_admin(db_session)
    viewer = await _member(db_session, "Viewer", dag="499")
    await _approved_boundaries(client, db_session, admin, count=1, start=0)
    await _map_query_count(client, db_session, viewer)  # warm auth lookups
    few_queries, few = await _map_query_count(client, db_session, viewer)

    await _approved_boundaries(client, db_session, admin, count=4, start=1)
    many_queries, many = await _map_query_count(client, db_session, viewer)

    assert (few, many) == (1, 5)
    assert many_queries == few_queries
