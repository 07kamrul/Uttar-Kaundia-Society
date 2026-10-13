"""The member's own profile tells the apps' Home whether the office still has
to record a dag number (`needs_dag`), so the clients can use the server value
instead of re-deriving it."""

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token
from app.models.member import Member, MemberStatus
from app.models.property import Property

pytestmark = pytest.mark.asyncio


async def _member(db_session, *, properties: list[Property], status=MemberStatus.APPROVED) -> Member:
    member = Member(
        status=status,
        member_id="UKAMKS-201",
        full_name="Needs Dag",
        father_or_husband="F",
        mother="M",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="Job",
        nid="1234500201",
        mobile="+8801712000201",
        gender="male",
        email="needsdag@example.com",
        admission_fee="500",
        subscription="100",
        receipt_no="R-201",
        payment_method="Cash",
        submission_date="2026-01-01",
        properties=properties,
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)
    return member


def _headers(member: Member) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(member.id), 'member')}"}


def _property(**overrides) -> Property:
    values = {"property_type": ["জমি"], "dag_no_cs": "12", "dag_no_rs": "34", "dag_unknown": False}
    values.update(overrides)
    return Property(**values)


async def test_me_exposes_needs_dag_true_while_dag_is_unknown_and_empty(
    client: AsyncClient, db_session
) -> None:
    member = await _member(
        db_session, properties=[_property(dag_no_cs="", dag_no_rs=None, dag_unknown=True)]
    )

    response = await client.get("/api/member/me", headers=_headers(member))

    assert response.status_code == 200
    assert response.json()["needs_dag"] is True


async def test_me_exposes_needs_dag_false_for_a_normal_member(client: AsyncClient, db_session) -> None:
    member = await _member(db_session, properties=[_property()])

    body = (await client.get("/api/member/me", headers=_headers(member))).json()

    assert body["needs_dag"] is False


async def test_me_needs_dag_is_false_without_properties(client: AsyncClient, db_session) -> None:
    member = await _member(db_session, properties=[])

    body = (await client.get("/api/member/me", headers=_headers(member))).json()

    assert body["needs_dag"] is False


async def test_me_needs_dag_false_once_the_office_filled_a_dag(client: AsyncClient, db_session) -> None:
    member = await _member(
        db_session, properties=[_property(dag_no_cs="77", dag_no_rs="", dag_unknown=False)]
    )

    body = (await client.get("/api/member/me", headers=_headers(member))).json()

    assert body["needs_dag"] is False


async def test_needs_dag_survives_a_contact_only_profile_edit(client: AsyncClient, db_session) -> None:
    member = await _member(
        db_session, properties=[_property(dag_no_cs="", dag_no_rs="", dag_unknown=True)]
    )

    response = await client.patch(
        "/api/member/profile", json={"urgent_contact_name": "Rahim"}, headers=_headers(member)
    )

    assert response.status_code == 200, response.text
    assert response.json()["needs_dag"] is True
