"""Module 7 — রেজিস্টার: society asset register (auto codes, condition
validation, soft deactivation, register PDF) and welfare activities (CRUD,
member read-only list, list PDF)."""

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.core.security import create_access_token, hash_password
from app.models.admin import AdminRole, AdminUser
from app.models.member import Member, MemberStatus

pytestmark = pytest.mark.asyncio


async def _member(db_session, *, email="member@x.com") -> Member:
    member = Member(
        status=MemberStatus.APPROVED,
        member_id="UKAMKS-61",
        full_name="রফিকুল ইসলাম",
        father_or_husband="Father",
        mother="Mother",
        dob="1988-03-03",
        nationality="Bangladeshi",
        occupation="Business",
        nid="1234567892",
        mobile="01758290413",
        gender="পুরুষ",
        email=email,
        admission_fee="500",
        subscription="100",
        receipt_no="R-3",
        payment_method="Cash",
        submission_date="2026-01-01",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)
    return member


async def _admin(db_session, *, email, role=AdminRole.EXECUTIVE_COMMITTEE) -> AdminUser:
    admin = AdminUser(
        email=email,
        password_hash=hash_password("pass12345"),
        name=f"Admin {email}",
        role=role,
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)
    return admin


def _headers(account_id: int | str, role: str) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(account_id), role)}"}


# ---------------------------------------------------------------------------
# Society assets
# ---------------------------------------------------------------------------


async def test_asset_crud_and_auto_codes(client, db_session, admin_user):
    headers = _headers(admin_user.id, "executive_committee")
    base = {
        "name": "কমিউনিটি সেন্টারের সাউন্ড সিস্টেম",
        "category": "electronics",
        "acquisition_date": "2025-08-15",
        "value": "85000.00",
        "condition": "good",
        "location": "কমিউনিটি সেন্টার",
    }
    first = await client.post("/api/admin/assets", json=base, headers=headers)
    assert first.status_code == 201, first.text
    assert first.json()["asset_code"] == "KRMF-AS-001"

    second = await client.post(
        "/api/admin/assets",
        json={**base, "name": "জেনারেটর", "condition": "fair", "value": "120000.50"},
        headers=headers,
    )
    assert second.json()["asset_code"] == "KRMF-AS-002"

    # Unknown condition is rejected.
    bad = await client.post(
        "/api/admin/assets", json={**base, "name": "x", "condition": "broken"}, headers=headers
    )
    assert bad.status_code == 400

    # Update: condition change and deactivation via PATCH.
    updated = await client.patch(
        f"/api/admin/assets/{first.json()['id']}",
        json={"condition": "poor", "notes": "স্পিকার মেরামত দরকার"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["condition"] == "poor"

    # Soft delete with reason; list hides it, include_inactive shows it.
    deleted = await client.request(
        "DELETE",
        f"/api/admin/assets/{second.json()['id']}",
        json={"reason": "বিক্রি সম্পন্ন"},
        headers=headers,
    )
    assert deleted.status_code == 204
    listed = await client.get("/api/admin/assets", headers=headers)
    assert [row["asset_code"] for row in listed.json()] == ["KRMF-AS-001"]
    listed = await client.get("/api/admin/assets?include_inactive=true", headers=headers)
    assert len(listed.json()) == 2

    # Search by code prefix.
    found = await client.get("/api/admin/assets?search=AS-001", headers=headers)
    assert [row["asset_code"] for row in found.json()] == ["KRMF-AS-001"]

    register = await client.get("/api/admin/assets/register.pdf", headers=headers)
    assert register.status_code == 200
    assert register.content[:5] == b"%PDF-"


async def test_asset_routes_require_permission(client, db_session, admin_user):
    member = await _member(db_session)
    denied = await client.get("/api/admin/assets", headers=_headers(member.id, "member"))
    assert denied.status_code == 403
    unauth = await client.get("/api/admin/assets")
    assert unauth.status_code == 401


# ---------------------------------------------------------------------------
# Welfare activities
# ---------------------------------------------------------------------------


async def test_activity_crud_validation_and_member_read(client, db_session, admin_user):
    member = await _member(db_session)
    headers = _headers(admin_user.id, "executive_committee")
    base = {
        "activity_date": "2026-09-21",
        "title": "শীতবস্ত্র বিতরণ",
        "activity_type": "welfare",
        "participants_count": 45,
        "outcome": "৪৫ পরিবারের মাঝে কম্বল বিতরণ সম্পন্ন",
        "organizer": "ধর্মীয় ও সমাজকল্যাণ সম্পাদক",
    }
    created = await client.post("/api/admin/welfare-activities", json=base, headers=headers)
    assert created.status_code == 201, created.text
    activity = created.json()
    assert activity["activity_type"] == "welfare"
    assert activity["participants_count"] == 45

    bad_type = await client.post(
        "/api/admin/welfare-activities",
        json={**base, "title": "x", "activity_type": "party"},
        headers=headers,
    )
    assert bad_type.status_code == 400

    negative = await client.post(
        "/api/admin/welfare-activities",
        json={**base, "title": "x", "participants_count": -1},
        headers=headers,
    )
    assert negative.status_code == 422

    updated = await client.patch(
        f"/api/admin/welfare-activities/{activity['id']}",
        json={"participants_count": 50},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["participants_count"] == 50

    # Member read-only list sees it.
    member_list = await client.get(
        "/api/member/welfare-activities", headers=_headers(member.id, "member")
    )
    assert member_list.status_code == 200
    assert [row["id"] for row in member_list.json()] == [activity["id"]]
    # The member projection carries no admin-only fields beyond the record.
    assert "outcome" in member_list.json()[0]

    # Hard delete with audit (activity records are events, not money).
    deleted = await client.delete(
        f"/api/admin/welfare-activities/{activity['id']}", headers=headers
    )
    assert deleted.status_code == 204
    member_list = await client.get(
        "/api/member/welfare-activities", headers=_headers(member.id, "member")
    )
    assert member_list.json() == []

    pdf = await client.get("/api/admin/welfare-activities/list.pdf", headers=headers)
    assert pdf.status_code == 200
    assert pdf.content[:5] == b"%PDF-"


async def test_activity_member_read_requires_auth(client, db_session, admin_user):
    response = await client.get("/api/member/welfare-activities")
    assert response.status_code == 401
