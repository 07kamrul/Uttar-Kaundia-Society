"""Governance foundation: working-day math, SLA status, quorum, election
eligibility, the public constants endpoint, member-class assignment (with
audit), and the constitutional 20-taka additional-rate seed."""

from datetime import date, datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import create_access_token, hash_password
from app.models.audit_log import AuditLog
from app.models.credential import MemberCredential
from app.models.fee_settings import FeeSetting
from app.models.member import (
    GOVERNANCE_STATUS_SUSPENDED,
    MEMBER_CLASS_FOUNDER,
    MEMBER_CLASS_GENERAL,
    MEMBER_CLASS_HONORARY_ASSOCIATE,
    Member,
    MemberStatus,
)
from app.services.governance import (
    AGM_NOTICE_DAYS,
    APPEAL_WINDOW_DAYS,
    COMPLAINT_ACK_WORKING_DAYS,
    COMPLAINT_UPDATE_WORKING_DAYS,
    EMERGENCY_MEETING_NOTICE_DAYS,
    EXECUTIVE_COUNCIL_SIZE,
    MEMBERSHIP_SLA_WORKING_DAYS,
    PETITION_RESPONSE_DAYS,
    add_working_days,
    is_election_eligible,
    public_constants,
    quorum_met,
    sla_status,
    working_days_between,
)

pytestmark = pytest.mark.asyncio

# 2026-10-11 is a Sunday (weekday 6); 2026-10-16 is a Friday, 10-17 a Saturday.
SUNDAY = date(2026, 10, 11)
FRIDAY = date(2026, 10, 16)
SATURDAY = date(2026, 10, 17)


async def test_add_working_days_skips_friday_saturday() -> None:
    # Thursday 2026-10-15 + 1 working day -> Sunday 10-18? No: Fri+Sat are the
    # weekend, so the next working day is Sunday 10-18.
    assert add_working_days(date(2026, 10, 15), 1) == date(2026, 10, 18)
    # Thursday + 3 working days: Sun 18, Mon 19, Tue 20.
    assert add_working_days(date(2026, 10, 15), 3) == date(2026, 10, 20)
    # Zero days -> unchanged even when start is on the weekend.
    assert add_working_days(SATURDAY, 0) == SATURDAY


async def test_working_days_between_excludes_weekend_and_is_signed() -> None:
    # Sunday 11 -> Saturday 17 is [Sun..Thu) = 5 working days (half-open;
    # Friday 16 is a weekend day anyway).
    assert working_days_between(SUNDAY, SATURDAY) == 5
    # A Sat->Sun span holds no working days, so 0 in both directions.
    assert working_days_between(SATURDAY, date(2026, 10, 18)) == 0
    assert working_days_between(date(2026, 10, 18), SATURDAY) == 0
    assert working_days_between(SUNDAY, SUNDAY) == 0


async def test_sla_status_states() -> None:
    now = datetime(2026, 10, 11, 12, 0, tzinfo=timezone.utc)
    due_soon = {"due": date(2026, 10, 13), "now": now}
    assert sla_status(**due_soon)["state"] == "due_soon"
    assert sla_status(due=date(2026, 10, 30), now=now) == {"state": "on_track", "days_remaining": 19}
    assert sla_status(due=date(2026, 10, 10), now=now) == {"state": "overdue", "days_remaining": -1}
    # Acknowledged before the deadline -> met; after -> overdue.
    assert sla_status(due=date(2026, 10, 10), acknowledged=datetime(2026, 10, 8, tzinfo=timezone.utc), now=now)[
        "state"
    ] == "met"
    assert sla_status(due=date(2026, 10, 10), acknowledged=datetime(2026, 10, 12, tzinfo=timezone.utc), now=now)[
        "state"
    ] == "overdue"


async def test_quorum_met_majority_of_eleven() -> None:
    assert quorum_met(6, "executive")
    assert not quorum_met(5, "executive")
    assert quorum_met(6, "standing")
    assert not quorum_met(5, "standing")
    with pytest.raises(ValueError):
        quorum_met(6, "ad_hoc")
    assert EXECUTIVE_COUNCIL_SIZE == 11


async def test_is_election_eligible_requires_class_status_and_not_suspended() -> None:
    def _member(**kw):
        base = dict(
            status=MemberStatus.APPROVED,
            member_class=MEMBER_CLASS_GENERAL,
            governance_status="active",
        )
        base.update(kw)
        return type("M", (), base)()

    assert is_election_eligible(_member())
    assert is_election_eligible(_member(member_class=MEMBER_CLASS_FOUNDER))
    assert not is_election_eligible(_member(member_class=MEMBER_CLASS_HONORARY_ASSOCIATE))
    assert not is_election_eligible(_member(member_class=None))
    assert not is_election_eligible(_member(status=MemberStatus.PENDING))
    assert not is_election_eligible(_member(governance_status=GOVERNANCE_STATUS_SUSPENDED))


async def test_constitutional_constants_documented_values() -> None:
    assert AGM_NOTICE_DAYS == 15
    assert EMERGENCY_MEETING_NOTICE_DAYS == 3
    assert APPEAL_WINDOW_DAYS == 30
    assert PETITION_RESPONSE_DAYS == 30
    assert COMPLAINT_ACK_WORKING_DAYS == 3
    assert COMPLAINT_UPDATE_WORKING_DAYS == 15
    assert MEMBERSHIP_SLA_WORKING_DAYS == 20


async def test_public_constants_shape() -> None:
    body = public_constants()
    assert body["council_size"] == 11
    assert body["quorum"] == {"executive": 6, "standing": 6}
    assert len(body["council_posts"]) == 11
    keys = {post["key"] for post in body["council_posts"]}
    assert "president" in keys and "standing_council_member" in keys
    income_keys = {src["key"] for src in body["income_sources"]}
    assert income_keys == {
        "admission_fee",
        "subscription",
        "donation",
        "welfare_fund",
        "government_grant",
        "other_income",
    }
    other = next(src for src in body["income_sources"] if src["key"] == "other_income")
    assert other["requires_justification"] is True
    assert body["foreign_funding_blocked"] is True


async def _approved_member_with_login(db_session, **kw) -> Member:
    member = Member(
        status=MemberStatus.APPROVED,
        full_name="Md. Governance",
        father_or_husband="Father",
        mother="Mother",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="Job",
        nid="1234567890",
        mobile="01758290421",
        gender="পুরুষ",
        email="gov@example.com",
        admission_fee="500",
        subscription="100",
        receipt_no="R-1",
        payment_method="Cash",
        submission_date="2026-01-01",
        **kw,
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)
    db_session.add(
        MemberCredential(
            member_id=member.id,
            username="ukamks-8888",
            password_hash=hash_password("currentpass123"),
            must_change_password=False,
        )
    )
    await db_session.commit()
    return member


def _member_headers(member: Member) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(member.id), 'member')}"}


async def _admin_headers(client: AsyncClient) -> dict:
    response = await client.post(
        "/api/admin/login", json={"email": "admin@example.com", "password": "adminpass123"}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_constants_endpoint_requires_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/governance/constants")).status_code == 401


async def test_constants_endpoint_open_to_member_token(
    client: AsyncClient, db_session
) -> None:
    member = await _approved_member_with_login(db_session)
    response = await client.get("/api/governance/constants", headers=_member_headers(member))
    assert response.status_code == 200
    assert response.json()["council_size"] == 11


async def test_member_class_assignment_permission_gated_with_audit(
    client: AsyncClient, db_session, admin_user
) -> None:
    member = await _approved_member_with_login(db_session)
    headers = await _admin_headers(client)

    # Anonymous -> 401; member token -> 403 (not an admin).
    assert (await client.get(f"/api/admin/member-governance/{member.id}")).status_code == 401
    member_hit = await client.get(
        f"/api/admin/member-governance/{member.id}", headers=_member_headers(member)
    )
    assert member_hit.status_code == 403

    response = await client.put(
        f"/api/admin/member-governance/{member.id}",
        json={"member_class": MEMBER_CLASS_FOUNDER},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["member_class"] == MEMBER_CLASS_FOUNDER
    assert response.json()["governance_status"] == "active"

    # Suspension records the reason and notice time.
    suspended = await client.put(
        f"/api/admin/member-governance/{member.id}",
        json={"governance_status": "suspended", "suspension_reason": "নির্ধারিত ফি অপরিশোধিত"},
        headers=headers,
    )
    assert suspended.status_code == 200
    body = suspended.json()
    assert body["governance_status"] == "suspended"
    assert body["suspension_reason"] == "নির্ধারিত ফি অপরিশোধিত"
    assert body["suspension_notice_at"] is not None

    await db_session.refresh(member)
    assert member.member_class == MEMBER_CLASS_FOUNDER

    # One audit row per PUT.
    rows = (
        (
            await db_session.execute(
                select(AuditLog)
                .where(AuditLog.entity_type == "member", AuditLog.entity_id == str(member.id))
                .order_by(AuditLog.id)
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 2
    assert rows[0].action == "member_governance.update"

    # Invalid class is rejected.
    bad = await client.put(
        f"/api/admin/member-governance/{member.id}",
        json={"member_class": "platinum"},
        headers=headers,
    )
    assert bad.status_code == 422


async def test_suspension_does_not_block_member_auth(client: AsyncClient, db_session) -> None:
    member = await _approved_member_with_login(db_session)
    member.governance_status = "suspended"
    member.suspension_reason = "test"
    await db_session.commit()

    # /api/member/me must still resolve for a suspended member.
    response = await client.get("/api/member/me", headers=_member_headers(member))
    assert response.status_code == 200


async def test_additional_rate_seed_is_twenty(db_session) -> None:
    """গঠনতন্ত্র: প্রতি অতিরিক্ত ডেসিমেলে ২০ টাকা - the seeded default must be
    20.00, still stored as a versioned FeeSetting row."""
    row = (
        await db_session.execute(
            select(FeeSetting).where(FeeSetting.key == "monthly_subscription_additional_rate")
        )
    ).scalar_one()
    assert float(row.value) == 20.00
    assert row.start_date == date(2000, 1, 1)


async def test_member_class_exposed_in_admin_member_list(
    client: AsyncClient, db_session, admin_user
) -> None:
    await _approved_member_with_login(db_session, member_class=MEMBER_CLASS_GENERAL)
    headers = await _admin_headers(client)
    response = await client.get("/api/admin/members", headers=headers)
    assert response.status_code == 200
    assert all(row["member_class"] == MEMBER_CLASS_GENERAL for row in response.json())
