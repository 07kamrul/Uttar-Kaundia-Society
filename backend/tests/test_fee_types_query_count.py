"""The admin fee-type list must not issue queries per fee type (N+1)."""

import pytest
from httpx import AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import AdminUser
from app.models.fee_settings import FeeType
from tests.test_fee_types_admin import _admin_headers, seeded_fee_types  # noqa: F401 - fixture

pytestmark = pytest.mark.asyncio


async def _count_list_queries(client: AsyncClient, db_session: AsyncSession, headers: dict) -> int:
    statements: list[str] = []
    engine = db_session.bind.sync_engine

    def record(conn, cursor, statement, *args) -> None:  # noqa: ARG001
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        response = await client.get("/api/admin/fee-types", headers=headers)
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert response.status_code == 200
    return len(statements)


async def test_fee_type_list_query_count_is_independent_of_row_count(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: AdminUser,
    seeded_fee_types: None,  # noqa: F811
) -> None:
    headers = await _admin_headers(client)
    await client.get("/api/admin/fee-types", headers=headers)  # warm auth/permission caches
    baseline = await _count_list_queries(client, db_session, headers)

    db_session.add_all(
        FeeType(key=f"extra_fee_{n}", label_bn="ফি", label_en="Fee", calculation_type="fixed")
        for n in range(5)
    )
    await db_session.commit()
    await client.get("/api/admin/fee-types", headers=headers)  # re-warm after the commit
    with_more_rows = await _count_list_queries(client, db_session, headers)

    assert with_more_rows == baseline
