"""Cached public reads: HIT on repeat, identical payload, and fresh data
immediately after the writes that change them."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import cache
from app.models.member import Member, MemberStatus
from tests.test_public_and_notices_filters import _submit

pytestmark = pytest.mark.asyncio


async def _admin_headers(client: AsyncClient) -> dict[str, str]:
    login = await client.post(
        "/api/admin/login", json={"email": "admin@example.com", "password": "adminpass123"}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _create_notice(client: AsyncClient, headers: dict, **fields) -> dict:
    payload = {"title": "Notice", "body": "Body", "is_published": True, **fields}
    response = await client.post("/api/admin/notices", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def test_repeat_notice_list_is_a_hit_with_identical_payload(
    client: AsyncClient, admin_user
) -> None:
    headers = await _admin_headers(client)
    await _create_notice(client, headers, title="First")

    first = await client.get("/api/public/notices")
    second = await client.get("/api/public/notices")

    assert first.headers["X-Cache"] == "MISS"
    assert second.headers["X-Cache"] == "HIT"
    assert second.json() == first.json()


async def test_new_notice_is_visible_immediately_after_create(
    client: AsyncClient, admin_user
) -> None:
    headers = await _admin_headers(client)
    await _create_notice(client, headers, title="Old")
    await client.get("/api/public/notices")  # warm the cache

    await _create_notice(client, headers, title="Fresh")
    response = await client.get("/api/public/notices")

    assert response.headers["X-Cache"] == "MISS"
    assert [n["title"] for n in response.json()] == ["Fresh", "Old"]


async def test_unpublishing_removes_notice_immediately(client: AsyncClient, admin_user) -> None:
    headers = await _admin_headers(client)
    notice = await _create_notice(client, headers)
    assert len((await client.get("/api/public/notices")).json()) == 1

    await client.patch(f"/api/admin/notices/{notice['id']}", json={"is_published": False}, headers=headers)

    assert (await client.get("/api/public/notices")).json() == []


async def test_drafts_and_members_only_never_reach_the_public_cache(
    client: AsyncClient, admin_user
) -> None:
    headers = await _admin_headers(client)
    await _create_notice(client, headers, title="Draft", is_published=False)
    await _create_notice(client, headers, title="Members", is_members_only=True)
    await _create_notice(client, headers, title="Public")

    for _ in range(2):
        titles = [n["title"] for n in (await client.get("/api/public/notices")).json()]
        assert titles == ["Public"]


async def test_query_params_are_part_of_the_key(client: AsyncClient, admin_user) -> None:
    headers = await _admin_headers(client)
    for index in range(3):
        await _create_notice(client, headers, title=f"N{index}")

    page_one = await client.get("/api/public/notices", params={"limit": 1})
    page_two = await client.get("/api/public/notices", params={"limit": 1, "offset": 1})

    assert page_two.headers["X-Cache"] == "MISS"
    assert page_one.json() != page_two.json()


async def test_stats_reflect_member_approval_immediately(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    created = await _submit(client, 1, MemberStatus.PENDING)
    before = (await client.get("/api/public/stats")).json()

    member = await db_session.get(Member, created["id"])
    member.status = MemberStatus.APPROVED
    await db_session.commit()
    after = await client.get("/api/public/stats")

    assert (before["approved_count"], before["pending_count"]) == (0, 1)
    assert after.headers["X-Cache"] == "MISS"
    assert (after.json()["approved_count"], after.json()["pending_count"]) == (1, 0)


async def test_roadmap_item_create_invalidates_roadmap(client: AsyncClient, admin_user) -> None:
    headers = await _admin_headers(client)
    # The first read seeds default timeframes and commits mid-load, so its
    # result is (correctly) not stored; the second read fills the cache.
    await client.get("/api/roadmap", headers=headers)
    roadmap = (await client.get("/api/roadmap", headers=headers)).json()
    assert (await client.get("/api/roadmap", headers=headers)).headers["X-Cache"] == "HIT"

    timeframe_id = roadmap["timeframes"][0]["id"]
    created = await client.post(
        "/api/admin/roadmap/items",
        json={"timeframe_id": timeframe_id, "text": "Paint the gate", "notify": False},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    after = await client.get("/api/roadmap", headers=headers)

    assert after.headers["X-Cache"] == "MISS"
    texts = [item["text"] for tf in after.json()["timeframes"] for item in tf["items"]]
    assert "Paint the gate" in texts


async def test_disabled_cache_serves_correct_uncached_data(
    client: AsyncClient, admin_user, monkeypatch
) -> None:
    monkeypatch.setattr(cache, "is_enabled", lambda: False)
    headers = await _admin_headers(client)
    await _create_notice(client, headers, title="Only")

    responses = [await client.get("/api/public/notices") for _ in range(2)]

    assert [r.headers["X-Cache"] for r in responses] == ["MISS", "MISS"]
    assert all([n["title"] for n in r.json()] == ["Only"] for r in responses)
