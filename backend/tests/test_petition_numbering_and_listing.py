"""Petition numbering survives deletions; admin list paginates without N+1 shape changes."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.resolution_book import SpecialSessionPetition
from tests.test_meetings_quorum import _admin_headers, _make_member, _member_headers

pytestmark = pytest.mark.asyncio


async def _file(client: AsyncClient, member) -> dict:
    response = await client.post(
        "/api/petitions", json={"title": "t", "justification": "j"}, headers=_member_headers(member)
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_petition_number_unique_after_deletion(client, db_session, admin_user):
    member = await _make_member(db_session, 31)
    first = await _file(client, member)
    second = await _file(client, member)
    row = await db_session.get(SpecialSessionPetition, first["id"])
    await db_session.delete(row)
    await db_session.commit()

    third = await _file(client, member)

    assert third["petition_no"] != second["petition_no"]
    numbers = (await db_session.execute(select(SpecialSessionPetition.petition_no))).scalars().all()
    assert len(numbers) == len(set(numbers))


async def test_list_petitions_limit_offset_keeps_shape(client, db_session, admin_user):
    admin = await _admin_headers(client)
    member = await _make_member(db_session, 32)
    for _ in range(3):
        await _file(client, member)

    page = await client.get("/api/petitions?limit=2&offset=0", headers=admin)
    rest = await client.get("/api/petitions?limit=2&offset=2", headers=admin)
    too_big = await client.get("/api/petitions?limit=501", headers=admin)

    assert page.status_code == 200
    assert set(page.json()) == {"items", "today"}
    assert len(page.json()["items"]) == 2
    assert len(rest.json()["items"]) == 1
    assert page.json()["items"][0]["signers"][0]["name"] == "Quorum Member 32"
    assert too_big.status_code == 422
