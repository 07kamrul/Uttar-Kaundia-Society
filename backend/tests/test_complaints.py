"""Module 5 tests: complaints (auto number, ack SLA in working days, first
update SLA, assignment rules), land-protection form validation, service
standard endpoint and evidence download."""

import json
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.admin import AdminRole, AdminUser
from app.models.complaint import Complaint
from app.models.credential import MemberCredential
from app.models.member import Member, MemberStatus
from app.services.governance import add_working_days

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def member_headers(db_session: AsyncSession) -> dict[str, str]:
    member = Member(
        member_id="KAM-0001",
        status=MemberStatus.APPROVED,
        full_name="Complaining Member",
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
    db_session.add(member)
    await db_session.flush()
    db_session.add(
        MemberCredential(member_id=member.id, username="kam-0001", password_hash=hash_password("x"))
    )
    await db_session.commit()
    return {"Authorization": f"Bearer {create_access_token(str(member.id), 'member')}"}


@pytest_asyncio.fixture
async def admin_setup(db_session: AsyncSession):
    admin = AdminUser(
        email="admin@example.com",
        password_hash=hash_password("adminpass123"),
        name="Complaint Admin",
        role=AdminRole.EXECUTIVE_COMMITTEE,
    )
    accused = AdminUser(
        email="accused@example.com",
        password_hash=hash_password("accusedpass123"),
        name="Accused Admin",
        role=AdminRole.ADMINISTRATOR,
    )
    db_session.add_all([admin, accused])
    await db_session.commit()
    return {
        "admin": admin,
        "accused": accused,
        "headers": {
            "Authorization": f"Bearer {create_access_token(str(admin.id), 'executive_committee')}"
        },
    }


async def test_auto_number_and_ack_sla(
    client: AsyncClient, member_headers: dict[str, str]
) -> None:
    year = date.today().year
    first = await client.post(
        "/api/member/complaints",
        json={"category": "service", "subject": "প্রথম", "details": "বিবরণ"},
        headers=member_headers,
    )
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["complaint_no"] == f"KRMF-AB-{year}-0001"
    assert body["sla_ack_due"] == add_working_days(date.today(), 3).isoformat()
    assert body["sla_update_due"] == add_working_days(date.today(), 15).isoformat()
    assert body["status"] == "submitted"
    assert body["sla_ack"]["state"] in ("on_track", "due_soon")

    second = await client.post(
        "/api/member/complaints",
        json={"category": "other", "subject": "দ্বিতীয়", "details": "বিবরণ"},
        headers=member_headers,
    )
    assert second.json()["complaint_no"] == f"KRMF-AB-{year}-0002"


async def test_acknowledge_within_sla_marks_met(
    client: AsyncClient, member_headers: dict[str, str], admin_setup: dict
) -> None:
    headers = admin_setup["headers"]
    created = await client.post(
        "/api/member/complaints",
        json={"category": "service", "subject": "s", "details": "d"},
        headers=member_headers,
    )
    complaint_id = created.json()["id"]

    acked = await client.post(
        f"/api/admin/complaints/{complaint_id}/acknowledge",
        json={},
        headers=headers,
    )
    assert acked.status_code == 200
    assert acked.json()["status"] == "acknowledged"
    assert acked.json()["sla_ack"]["state"] == "met"
    assert acked.json()["sla_update"]["state"] in ("on_track", "due_soon")

    again = await client.post(
        f"/api/admin/complaints/{complaint_id}/acknowledge", json={}, headers=headers
    )
    assert again.status_code == 409


async def test_first_update_sla_recorded_once(
    client: AsyncClient, member_headers: dict[str, str], admin_setup: dict
) -> None:
    headers = admin_setup["headers"]
    created = await client.post(
        "/api/member/complaints",
        json={"category": "other", "subject": "s", "details": "d"},
        headers=member_headers,
    )
    complaint_id = created.json()["id"]

    await client.post(
        f"/api/admin/complaints/{complaint_id}/acknowledge", json={}, headers=headers
    )
    first = await client.post(
        f"/api/admin/complaints/{complaint_id}/update",
        json={"note": "তদন্ত শুরু"},
        headers=headers,
    )
    assert first.status_code == 200
    assert first.json()["sla_update"]["state"] == "met"

    second = await client.post(
        f"/api/admin/complaints/{complaint_id}/update",
        json={"note": "আরও আপডেট"},
        headers=headers,
    )
    assert second.status_code == 200
    assert second.json()["first_update_at"] == first.json()["first_update_at"]


async def test_resolve_then_close(
    client: AsyncClient, member_headers: dict[str, str], admin_setup: dict
) -> None:
    headers = admin_setup["headers"]
    created = await client.post(
        "/api/member/complaints",
        json={"category": "other", "subject": "s", "details": "d"},
        headers=member_headers,
    )
    complaint_id = created.json()["id"]
    resolved = await client.post(
        f"/api/admin/complaints/{complaint_id}/resolve",
        json={"resolution_note": "সমাধান হয়েছে"},
        headers=headers,
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"

    closed = await client.post(
        f"/api/admin/complaints/{complaint_id}/close", headers=headers
    )
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"


async def test_cannot_assign_the_accused(
    client: AsyncClient, member_headers: dict[str, str], admin_setup: dict
) -> None:
    headers = admin_setup["headers"]
    accused_id = admin_setup["accused"].id
    created = await client.post(
        "/api/member/complaints",
        json={"category": "behaviour", "subject": "s", "details": "d", "accused_admin_id": accused_id},
        headers=member_headers,
    )
    complaint_id = created.json()["id"]

    blocked = await client.post(
        f"/api/admin/complaints/{complaint_id}/assign",
        json={"admin_id": accused_id},
        headers=headers,
    )
    assert blocked.status_code == 409
    assert "accused" in blocked.json()["detail"]

    ok = await client.post(
        f"/api/admin/complaints/{complaint_id}/assign",
        json={"admin_id": admin_setup["admin"].id},
        headers=headers,
    )
    assert ok.status_code == 200
    assert ok.json()["status"] == "investigating"


async def test_close_relative_assignment_block_ladder(
    client: AsyncClient, member_headers: dict[str, str], admin_setup: dict
) -> None:
    """Flagged close-relative assignment: 409 without override, 403 with
    override by a non-super-admin (the override path itself is covered in
    test_close_relative_override_by_super_admin)."""
    headers = admin_setup["headers"]
    created = await client.post(
        "/api/member/complaints",
        json={"category": "other", "subject": "s", "details": "d"},
        headers=member_headers,
    )
    complaint_id = created.json()["id"]

    flagged = await client.post(
        f"/api/admin/complaints/{complaint_id}/assign",
        json={"admin_id": admin_setup["admin"].id, "close_relative_of_accused": True},
        headers=headers,
    )
    assert flagged.status_code == 409
    assert "close relative" in flagged.json()["detail"]

    forbidden = await client.post(
        f"/api/admin/complaints/{complaint_id}/assign",
        json={
            "admin_id": admin_setup["admin"].id,
            "close_relative_of_accused": True,
            "override_confirmation": True,
        },
        headers=headers,
    )
    assert forbidden.status_code == 403


async def test_close_relative_override_by_super_admin(
    client: AsyncClient, member_headers: dict[str, str], admin_setup: dict, db_session: AsyncSession
) -> None:
    super_admin = AdminUser(
        email="super@example.com",
        password_hash=hash_password("superpass123"),
        name="Super",
        role=AdminRole.SUPER_ADMIN,
    )
    db_session.add(super_admin)
    await db_session.commit()
    super_headers = {
        "Authorization": f"Bearer {create_access_token(str(super_admin.id), 'super_admin')}"
    }

    created = await client.post(
        "/api/member/complaints",
        json={"category": "other", "subject": "s", "details": "d"},
        headers=member_headers,
    )
    complaint_id = created.json()["id"]

    assigned = await client.post(
        f"/api/admin/complaints/{complaint_id}/assign",
        json={
            "admin_id": admin_setup["admin"].id,
            "close_relative_of_accused": True,
            "override_confirmation": True,
        },
        headers=super_headers,
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["assigned_admin_id"] == admin_setup["admin"].id


async def test_land_protection_requires_fields_and_disclaimer(
    client: AsyncClient, member_headers: dict[str, str]
) -> None:
    missing = await client.post(
        "/api/member/complaints/land-protection",
        data={"form_data": json.dumps({"complainant_name": "x"})},
        headers=member_headers,
    )
    assert missing.status_code == 422
    assert "Missing required" in missing.json()["detail"]

    no_disclaimer = await client.post(
        "/api/member/complaints/land-protection",
        data={
            "form_data": json.dumps(
                {
                    "complainant_name": "আবেদনকারী",
                    "land_location": "কাউন্দিয়া",
                    "dag_no": "১২৩",
                    "khatian_no": "৪৫",
                    "accused_party": "প্রতিবেশী",
                    "incident_description": "বর্জ্য ফেলা হচ্ছে",
                    "incident_date": "2026-10-01",
                    "consent": True,
                }
            )
        },
        headers=member_headers,
    )
    assert no_disclaimer.status_code == 422
    assert "disclaimer" in no_disclaimer.json()["detail"]

    ok = await client.post(
        "/api/member/complaints/land-protection",
        data={
            "form_data": json.dumps(
                {
                    "complainant_name": "আবেদনকারী",
                    "land_location": "কাউন্দিয়া",
                    "dag_no": "১২৩",
                    "khatian_no": "৪৫",
                    "accused_party": "প্রতিবেশী",
                    "incident_description": "বর্জ্য ফেলা হচ্ছে",
                    "incident_date": "2026-10-01",
                    "emergency_danger": True,
                    "evidence_checklist": ["দাগ নম্বর ও খতিয়ান সংক্রান্ত কাগজ"],
                    "disclaimer_acknowledged": True,
                    "consent": True,
                    "signature_name": "আবেদনকারী",
                    "signature_date": "2026-10-11",
                }
            )
        },
        headers=member_headers,
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["is_land_protection"] is True
    assert body["form_data"]["disclaimer_acknowledged"] is True


async def test_member_sees_own_complaints_with_timeline(
    client: AsyncClient, member_headers: dict[str, str], admin_setup: dict
) -> None:
    headers = admin_setup["headers"]
    created = await client.post(
        "/api/member/complaints",
        json={"category": "other", "subject": "s", "details": "d"},
        headers=member_headers,
    )
    complaint_id = created.json()["id"]
    await client.post(f"/api/admin/complaints/{complaint_id}/acknowledge", json={}, headers=headers)

    detail = await client.get(f"/api/member/complaints/{complaint_id}", headers=member_headers)
    assert detail.status_code == 200
    timeline_events = [event["event"] for event in detail.json()["timeline"]]
    assert "submitted" in timeline_events
    assert "acknowledged" in timeline_events

    listing = await client.get("/api/member/complaints", headers=member_headers)
    assert len(listing.json()) == 1


async def test_service_standard_endpoint_has_live_complaint_figures(
    client: AsyncClient, member_headers: dict[str, str], admin_setup: dict
) -> None:
    headers = admin_setup["headers"]
    created = await client.post(
        "/api/member/complaints",
        json={"category": "other", "subject": "s", "details": "d"},
        headers=member_headers,
    )
    complaint_id = created.json()["id"]
    await client.post(f"/api/admin/complaints/{complaint_id}/acknowledge", json={}, headers=headers)

    response = await client.get("/api/governance/service-standard", headers=member_headers)
    assert response.status_code == 200, response.text
    standards = {item["key"]: item for item in response.json()["standards"]}
    ack = standards["complaint_acknowledgement"]["live"]
    assert ack is not None and ack["total"] == 1 and ack["met"] == 1
    assert standards["membership_review"]["target"]
    assert "anti_retaliation_notice" in response.json()


async def test_land_form_pdf_copy(
    client: AsyncClient, member_headers: dict[str, str]
) -> None:
    created = await client.post(
        "/api/member/complaints/land-protection",
        data={
            "form_data": json.dumps(
                {
                    "complainant_name": "আবেদনকারী",
                    "land_location": "কাউন্দিয়া",
                    "dag_no": "১২৩",
                    "khatian_no": "৪৫",
                    "accused_party": "প্রতিবেশী",
                    "incident_description": "বর্জ্য ফেলা হচ্ছে",
                    "incident_date": "2026-10-01",
                    "disclaimer_acknowledged": True,
                    "consent": True,
                }
            )
        },
        headers=member_headers,
    )
    complaint_id = created.json()["id"]
    response = await client.get(
        f"/api/member/complaints/{complaint_id}/land-form.pdf", headers=member_headers
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
