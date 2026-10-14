"""Batch 5: `GET /api/admin/membership-applications?search=` (name, and phone by
its trailing digits) plus the shared `phone_tail_clause` helper."""

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.member import Member
from app.models.membership_appeal import MembershipApplication
from app.services.member_search import SEARCH_MAX_LENGTH, phone_tail_clause

pytestmark = pytest.mark.asyncio

URL = "/api/admin/membership-applications"


def _application(n: int, name: str, mobile: str, status: str = "received") -> MembershipApplication:
    return MembershipApplication(
        application_no=f"APP-S{n}",
        full_name=name,
        father_name="F",
        mother_name="M",
        mobile=mobile,
        email=f"app{n}@example.com",
        ownership_type="owner",
        status=status,
        sla_due_at=date(2026, 12, 1),
    )


@pytest.fixture
async def applications(db_session):
    rows = {
        "rahim": _application(1, "রহিম উদ্দিন", "+8801712345678"),
        "karim": _application(2, "Karim Ali", "01812345678", status="under_review"),
        "saudi": _application(3, "Saudi Worker", "+966501234567"),
        "pct": _application(4, "100%_Real", "+8801912345678"),
    }
    db_session.add_all(rows.values())
    await db_session.commit()
    return rows


def _headers(admin_user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(admin_user.id), 'executive_committee')}"}


async def _search(client: AsyncClient, admin_user, term=None, **extra) -> list[int]:
    params = {**extra}
    if term is not None:
        params["search"] = term
    response = await client.get(URL, params=params, headers=_headers(admin_user))
    assert response.status_code == 200, response.text
    return sorted(item["id"] for item in response.json())


@pytest.mark.parametrize("term", ["karim", "KARIM", "  Karim  ", "Ali"])
async def test_matches_name_case_insensitively(client, admin_user, applications, term) -> None:
    assert await _search(client, admin_user, term) == [applications["karim"].id]


async def test_matches_bangla_name(client, admin_user, applications) -> None:
    assert await _search(client, admin_user, "রহিম") == [applications["rahim"].id]


@pytest.mark.parametrize(
    "term", ["01712345678", "+8801712345678", "8801712345678", "০১৭১২৩৪৫৬৭৮", "1712345678", "0171 234-5678"]
)
async def test_phone_in_any_format_matches_by_its_tail(client, admin_user, applications, term) -> None:
    assert await _search(client, admin_user, term) == [applications["rahim"].id]


async def test_bangla_digit_tail_matches_a_legacy_row(client, admin_user, applications) -> None:
    assert await _search(client, admin_user, "০১৮১২৩৪৫৬৭৮") == [applications["karim"].id]


async def test_short_digit_strings_do_not_trigger_phone_matching(client, admin_user, applications) -> None:
    assert await _search(client, admin_user, "123456") == []


async def test_wildcards_are_literal(client, admin_user, applications) -> None:
    assert await _search(client, admin_user, "%") == [applications["pct"].id]
    assert await _search(client, admin_user, "_") == [applications["pct"].id]
    assert await _search(client, admin_user, "z%z") == []


async def test_blank_search_returns_everything_and_combines_with_status(
    client, admin_user, applications
) -> None:
    everything = sorted(a.id for a in applications.values())
    assert await _search(client, admin_user, "  ") == everything
    assert await _search(client, admin_user) == everything
    assert await _search(client, admin_user, "a", status_filter="under_review") == [applications["karim"].id]


async def test_over_long_search_is_rejected(client, admin_user, applications) -> None:
    response = await client.get(URL, params={"search": "x" * (SEARCH_MAX_LENGTH + 1)}, headers=_headers(admin_user))

    assert response.status_code == 422


async def test_phone_tail_clause_helper(db_session, applications) -> None:
    assert phone_tail_clause(MembershipApplication.mobile, "name only") is None
    assert phone_tail_clause(MembershipApplication.mobile, "123456") is None  # < 7 digits
    clause = phone_tail_clause(MembershipApplication.mobile, "০১৭১২৩৪৫৬৭৮")
    rows = (await db_session.execute(select(MembershipApplication.id).where(clause))).scalars().all()
    assert rows == [applications["rahim"].id]
    member_clause = phone_tail_clause(Member.mobile, "01712345678")
    assert member_clause is not None
