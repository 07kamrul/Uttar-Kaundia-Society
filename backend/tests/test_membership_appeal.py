"""Module 1 tests: membership application review workflow (SLA in working
days, member_class on approval, rejection email/audit), fee waivers,
suspension notice -> suspend flow, appeals (30-day window, reviewer must
differ from the original decision-maker) and data-correction requests."""

import json
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.api.routes.membership_appeal as routes
from app.core.security import create_access_token, hash_password
from app.models.admin import AdminRole, AdminUser
from app.models.audit_log import AuditLog
from app.models.credential import MemberCredential
from app.models.member import (
    GOVERNANCE_STATUS_SUSPENDED,
    MEMBER_CLASS_GENERAL,
    Member,
    MemberStatus,
)
from app.models.membership_appeal import (
    MembershipAction,
    MembershipApplication,
    MembershipAppeal,
)
from app.services.governance import add_working_days

pytestmark = pytest.mark.asyncio


def _member_row(**overrides) -> Member:
    data = dict(
        member_id="KAM-0001",
        status=MemberStatus.APPROVED,
        full_name="Test Member",
        father_or_husband="Father",
        mother="Mother",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="Farmer",
        nid="1234567890",
        mobile="01700000000",
        gender="পুরুষ",
        email="member@example.com",
        admission_fee="1000",
        subscription="500",
        receipt_no="R-1",
        payment_method="cash",
        submission_date="2026-01-01",
    )
    data.update(overrides)
    return Member(**data)


@pytest_asyncio.fixture
async def member_headers(db_session: AsyncSession) -> dict[str, str]:
    member = _member_row()
    db_session.add(member)
    await db_session.flush()
    db_session.add(
        MemberCredential(
            member_id=member.id, username="kam-0001", password_hash=hash_password("x")
        )
    )
    await db_session.commit()
    return {"Authorization": f"Bearer {create_access_token(str(member.id), 'member')}"}


@pytest_asyncio.fixture
async def admin_headers(db_session: AsyncSession) -> dict[str, str]:
    admin = AdminUser(
        email="admin@example.com",
        password_hash=hash_password("adminpass123"),
        name="Decider Admin",
        role=AdminRole.EXECUTIVE_COMMITTEE,
    )
    db_session.add(admin)
    await db_session.commit()
    return {
        "admin": admin,
        "headers": {
            "Authorization": f"Bearer {create_access_token(str(admin.id), 'executive_committee')}"
        },
    }


@pytest_asyncio.fixture(autouse=True)
async def fast_email(monkeypatch):
    """Skip SMTP retries in every test."""
    sent = {"value": True}

    async def _instant_send(**kwargs):
        return True

    monkeypatch.setattr(routes, "send_email", _instant_send)
    return sent


@pytest.fixture
def admin_id(admin_headers) -> int:
    return admin_headers["admin"].id


@pytest.fixture
def headers(admin_headers) -> dict[str, str]:
    return admin_headers["headers"]


async def test_apply_sla_due_is_20_working_days(
    client: AsyncClient, member_headers: dict[str, str]
) -> None:
    response = await client.post(
        "/api/member/membership-applications",
        json={
            "full_name": "New Applicant",
            "father_name": "F",
            "mother_name": "M",
            "mobile": "01700000001",
            "email": "new@example.com",
            "ownership_type": "owner",
            "consent": True,
        },
        headers=member_headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["application_no"].startswith("KRMF-SD-")
    assert body["status"] == "received"
    expected = add_working_days(date.today(), 20)
    assert body["sla_due_at"] == expected.isoformat()
    assert body["sla"]["state"] in ("on_track", "due_soon")


async def test_consent_required(
    client: AsyncClient, member_headers: dict[str, str]
) -> None:
    response = await client.post(
        "/api/member/membership-applications",
        json={
            "full_name": "No Consent",
            "father_name": "F",
            "mother_name": "M",
            "mobile": "01700000002",
            "email": "nc@example.com",
            "ownership_type": "owner",
            "consent": False,
        },
        headers=member_headers,
    )
    assert response.status_code == 422


async def test_start_review_approve_sets_member_class_general(
    client: AsyncClient,
    member_headers: dict[str, str],
    headers: dict[str, str],
    admin_id: int,
    db_session: AsyncSession,
) -> None:
    created = await client.post(
        "/api/member/membership-applications",
        json={
            "full_name": "Approve Me",
            "father_name": "F",
            "mother_name": "M",
            "mobile": "01700000003",
            "email": "approve@example.com",
            "ownership_type": "owner",
            "consent": True,
        },
        headers=member_headers,
    )
    application_id = created.json()["id"]

    started = await client.post(
        f"/api/admin/membership-applications/{application_id}/start-review",
        headers=headers,
    )
    assert started.status_code == 200
    assert started.json()["status"] == "under_review"

    approved = await client.post(
        f"/api/admin/membership-applications/{application_id}/approve",
        json={},
        headers=headers,
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    await db_session.commit()  # end the fixture's read transaction
    # The application was submitted by an existing member, so approval links
    # back to that member and sets their class (no duplicate Member row).
    member = await db_session.scalar(select(Member).where(Member.member_id == "KAM-0001"))
    assert member is not None
    assert member.member_class == MEMBER_CLASS_GENERAL
    approved = (await client.get(
        f"/api/admin/membership-applications/{application_id}", headers=headers
    )).json()
    assert approved["member_id"] == member.id
    assert approved["status"] == "approved"

async def test_approve_without_linked_member_creates_member(
    client: AsyncClient, headers: dict[str, str], db_session: AsyncSession, admin_id: int
) -> None:
    application = MembershipApplication(
        application_no="KRMF-SD-9999-0002",
        full_name="Standalone Applicant",
        father_name="F",
        mother_name="M",
        mobile="01700000009",
        email="standalone@example.com",
        ownership_type="owner",
        consent=True,
        member_id=None,
        status="under_review",
        submitted_at=datetime.now(timezone.utc) - timedelta(days=1),
        sla_due_at=add_working_days(date.today(), 20),
    )
    db_session.add(application)
    await db_session.commit()

    response = await client.post(
        f"/api/admin/membership-applications/{application.id}/approve",
        json={},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    await db_session.commit()
    member = await db_session.scalar(
        select(Member).where(Member.full_name == "Standalone Applicant")
    )
    assert member is not None
    assert member.member_class == MEMBER_CLASS_GENERAL
    assert member.status == MemberStatus.APPROVED

    audit = (
        await db_session.execute(
            select(AuditLog).where(AuditLog.action == "membership_application.approved")
        )
    ).scalar_one()
    assert audit.actor_admin_id == admin_id


async def test_reject_requires_reason_and_sends_email(
    client: AsyncClient,
    member_headers: dict[str, str],
    headers: dict[str, str],
) -> None:
    created = await client.post(
        "/api/member/membership-applications",
        json={
            "full_name": "Reject Me",
            "father_name": "F",
            "mother_name": "M",
            "mobile": "01700000004",
            "email": "reject@example.com",
            "ownership_type": "owner",
            "consent": True,
        },
        headers=member_headers,
    )
    application_id = created.json()["id"]

    no_reason = await client.post(
        f"/api/admin/membership-applications/{application_id}/reject",
        json={"reason": "   "},
        headers=headers,
    )
    assert no_reason.status_code == 422

    rejected = await client.post(
        f"/api/admin/membership-applications/{application_id}/reject",
        json={"reason": "অসম্পূর্ণ কাগজ"},
        headers=headers,
    )
    assert rejected.status_code == 200
    assert rejected.json()["rejection_reason"] == "অসম্পূর্ণ কাগজ"
    assert rejected.json()["notification_status"] == "sent"


async def test_suspension_requires_prior_written_notice(
    client: AsyncClient,
    headers: dict[str, str],
    member_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    member = await db_session.scalar(select(Member).where(Member.member_id == "KAM-0001"))

    blocked = await client.post(
        f"/api/admin/member-governance/{member.id}/suspend",
        json={"reason": "no notice"},
        headers=headers,
    )
    assert blocked.status_code == 409

    noticed = await client.post(
        f"/api/admin/member-governance/{member.id}/suspension-notice",
        json={"reason": "নিয়ম লঙ্ঘন"},
        headers=headers,
    )
    assert noticed.status_code == 200, noticed.text
    body = noticed.json()
    assert body["status"] == "noticed"
    expected_deadline = add_working_days(date.today(), 15)
    assert body["response_deadline"] == expected_deadline.isoformat()
    assert body["notification_email_sent"] is True

    suspended = await client.post(
        f"/api/admin/member-governance/{member.id}/suspend",
        json={"reason": "নিয়ম লঙ্ঘন"},
        headers=headers,
    )
    assert suspended.status_code == 200
    await db_session.refresh(member)
    assert member.governance_status == GOVERNANCE_STATUS_SUSPENDED


async def test_member_can_respond_until_deadline(
    client: AsyncClient, headers: dict[str, str], member_headers: dict[str, str], db_session: AsyncSession
) -> None:
    member = await db_session.scalar(select(Member).where(Member.member_id == "KAM-0001"))
    noticed = await client.post(
        f"/api/admin/member-governance/{member.id}/suspension-notice",
        json={"reason": "notice"},
        headers=headers,
    )
    action_id = noticed.json()["id"]
    responded = await client.post(
        f"/api/member/membership-actions/{action_id}/response",
        json={"response": "আমি দোষী নই"},
        headers=member_headers,
    )
    assert responded.status_code == 200
    assert responded.json()["status"] == "awaiting_response"


def _appealable_application(db_session: AsyncSession, member: Member, admin_id: int) -> MembershipApplication:
    application = MembershipApplication(
        application_no="KRMF-SD-9999-0001",
        full_name=member.full_name,
        father_name="F",
        mother_name="M",
        mobile=member.mobile,
        email=member.email,
        ownership_type="owner",
        consent=True,
        member_id=member.id,
        status="rejected",
        submitted_at=datetime.now(timezone.utc) - timedelta(days=5),
        sla_due_at=add_working_days(date.today(), 20),
        reviewed_at=datetime.now(timezone.utc) - timedelta(days=2),
        reviewed_by_admin_id=admin_id,
        rejection_reason="test",
    )
    db_session.add(application)
    return application


async def test_appeal_window_of_30_days_rejects_late_filing(
    client: AsyncClient, member_headers: dict[str, str], admin_id: int, db_session: AsyncSession
) -> None:
    member = await db_session.scalar(select(Member).where(Member.member_id == "KAM-0001"))
    application = _appealable_application(db_session, member, admin_id)
    application.reviewed_at = datetime.now(timezone.utc) - timedelta(days=31)
    await db_session.commit()

    response = await client.post(
        "/api/member/appeals",
        json={"application_id": application.id, "grounds": "late"},
        headers=member_headers,
    )
    assert response.status_code == 409
    assert "window closed" in response.json()["detail"]


async def test_appeal_within_window_files_and_exposes_window(
    client: AsyncClient, member_headers: dict[str, str], admin_id: int, db_session: AsyncSession
) -> None:
    member = await db_session.scalar(select(Member).where(Member.member_id == "KAM-0001"))
    application = _appealable_application(db_session, member, admin_id)
    await db_session.commit()

    response = await client.post(
        "/api/member/appeals",
        json={"application_id": application.id, "grounds": "ভুল সিদ্ধান্ত"},
        headers=member_headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    decision_date = application.reviewed_at.date()
    assert body["window_expires_at"] == (decision_date + timedelta(days=30)).isoformat()


async def test_reviewer_cannot_be_original_decision_maker(
    client: AsyncClient, member_headers: dict[str, str], admin_id: int, headers: dict[str, str], db_session: AsyncSession
) -> None:
    member = await db_session.scalar(select(Member).where(Member.member_id == "KAM-0001"))
    application = _appealable_application(db_session, member, admin_id)
    await db_session.commit()
    appeal = (
        await client.post(
            "/api/member/appeals",
            json={"application_id": application.id, "grounds": "x"},
            headers=member_headers,
        )
    ).json()

    # The only admin in this DB is the original decision-maker.
    blocked = await client.post(
        f"/api/admin/appeals/{appeal['id']}/assign",
        json={"reviewer_admin_id": admin_id},
        headers=headers,
    )
    assert blocked.status_code == 409
    assert "original decision-maker" in blocked.json()["detail"]

    # Add a second admin; assignment succeeds and decide works.
    reviewer = AdminUser(
        email="reviewer@example.com",
        password_hash=hash_password("reviewerpass123"),
        name="Reviewer",
        role=AdminRole.EXECUTIVE_COMMITTEE,
    )
    db_session.add(reviewer)
    await db_session.commit()
    await db_session.refresh(reviewer)

    assigned = await client.post(
        f"/api/admin/appeals/{appeal['id']}/assign",
        json={"reviewer_admin_id": reviewer.id},
        headers=headers,
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["assigned_reviewer_admin_id"] == reviewer.id

    decided = await client.post(
        f"/api/admin/appeals/{appeal['id']}/decide",
        json={"status": "overturned", "decision": "সিদ্ধান্ত বাতিল"},
        headers={
            "Authorization": f"Bearer {create_access_token(str(reviewer.id), 'executive_committee')}"
        },
    )
    assert decided.status_code == 200, decided.text
    assert decided.json()["status"] == "overturned"


async def test_waiver_requires_reason_and_committee_decision(
    client: AsyncClient, member_headers: dict[str, str], headers: dict[str, str], admin_id: int
) -> None:
    no_reason = await client.post(
        "/api/member/fee-waivers",
        json={"type": "waiver", "reason": "  "},
        headers=member_headers,
    )
    assert no_reason.status_code == 422

    created = await client.post(
        "/api/member/fee-waivers",
        json={"type": "waiver", "reason": "আর্থিক সংকট", "months": 3},
        headers=member_headers,
    )
    assert created.status_code == 200
    waiver_id = created.json()["id"]

    mine = await client.get("/api/member/fee-waivers", headers=member_headers)
    assert [w["id"] for w in mine.json()] == [waiver_id]

    decided = await client.post(
        f"/api/admin/fee-waivers/{waiver_id}/decide",
        json={"status": "approved", "note": "ok"},
        headers=headers,
    )
    assert decided.status_code == 200
    assert decided.json()["status"] == "approved"

    again = await client.post(
        f"/api/admin/fee-waivers/{waiver_id}/decide",
        json={"status": "rejected"},
        headers=headers,
    )
    assert again.status_code == 409


async def test_data_correction_flow(
    client: AsyncClient, member_headers: dict[str, str], headers: dict[str, str]
) -> None:
    created = await client.post(
        "/api/member/data-correction-requests",
        json={"field": "mobile", "requested_value": "01800000000", "reason": "সিম হারিয়েছে"},
        headers=member_headers,
    )
    assert created.status_code == 200, created.text
    request_id = created.json()["id"]

    queue = await client.get(
        "/api/admin/data-correction-requests", headers=headers
    )
    assert any(item["id"] == request_id for item in queue.json())

    decided = await client.post(
        f"/api/admin/data-correction-requests/{request_id}/decide",
        json={"status": "applied", "admin_note": "হালনাগাদ করা হয়েছে"},
        headers=headers,
    )
    assert decided.status_code == 200
    assert decided.json()["status"] == "applied"


async def test_application_letter_pdf(
    client: AsyncClient, member_headers: dict[str, str], headers: dict[str, str]
) -> None:
    created = await client.post(
        "/api/member/membership-applications",
        json={
            "full_name": "PDF Applicant",
            "father_name": "F",
            "mother_name": "M",
            "mobile": "01700000005",
            "email": "pdf@example.com",
            "ownership_type": "owner",
            "consent": True,
        },
        headers=member_headers,
    )
    application_id = created.json()["id"]
    response = await client.get(
        f"/api/admin/membership-applications/{application_id}/letter.pdf", headers=headers
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:5] == b"%PDF-"


async def test_member_cannot_see_others_application(
    client: AsyncClient, member_headers: dict[str, str], admin_id: int, db_session: AsyncSession
) -> None:
    other = _member_row(member_id="KAM-0002", full_name="Other", email="other@example.com")
    db_session.add(other)
    await db_session.flush()
    application = _appealable_application(db_session, other, admin_id)
    await db_session.commit()
    response = await client.get(
        f"/api/member/membership-applications/{application.id}", headers=member_headers
    )
    assert response.status_code == 403
