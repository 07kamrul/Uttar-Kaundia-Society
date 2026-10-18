"""Admin-managed payment accounts: CRUD, permissions, validation, active-only
member list, audit masking and reorder."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.admin import AdminRole, AdminUser
from app.models.audit_log import AuditLog
from app.models.member import Member

pytestmark = pytest.mark.asyncio

BANK_PAYLOAD = {
    "type": "bank",
    "label": "Test bank",
    "bank_name": "ABC Bank",
    "branch_name": "Main branch",
    "account_name": "Society",
    "account_number": "123456789",
    "routing_number": "060276537",
}
MFS_PAYLOAD = {
    "type": "mfs",
    "label": "Test bkash",
    "provider": "bkash",
    "mfs_number": "01712345678",
    "account_kind": "personal",
}


async def _seed_admin(db_session: AsyncSession, role: AdminRole = AdminRole.SUPER_ADMIN) -> tuple[AdminUser, dict[str, str]]:
    admin = AdminUser(
        email=f"{role.value}@example.com",
        password_hash=hash_password("pass12345"),
        name="Admin",
        role=role,
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)
    return admin, {"Authorization": f"Bearer {create_access_token(str(admin.id), role.value)}"}


async def _seed_member(db_session: AsyncSession, email: str = "member@example.com") -> dict[str, str]:
    member = Member(
        status="approved",
        full_name="Member",
        father_or_husband="father",
        mother="mother",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="job",
        nid="1234567890",
        mobile="01700000000",
        gender="male",
        email=email,
        admission_fee="500",
        subscription="100",
        receipt_no="r",
        payment_method="cash",
        submission_date="2026-01-01",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)
    return {"Authorization": f"Bearer {create_access_token(str(member.id), 'member')}"}


async def test_admin_can_create_and_list_accounts(client: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await _seed_admin(db_session)
    created = await client.post("/api/admin/payment-accounts", headers=headers, json=BANK_PAYLOAD)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["status"] == "active"
    assert body["account_number"] == "123456789"

    listed = await client.get("/api/admin/payment-accounts", headers=headers)
    assert listed.status_code == 200
    assert [a["id"] for a in listed.json()] == [body["id"]]


async def test_create_rejects_bad_routing_and_mfs_numbers(client: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await _seed_admin(db_session)
    bad_routing = await client.post(
        "/api/admin/payment-accounts", headers=headers, json={**BANK_PAYLOAD, "routing_number": "123"}
    )
    assert bad_routing.status_code == 422
    assert "ROUTING_NUMBER_INVALID" in str(bad_routing.json())

    bad_mfs = await client.post(
        "/api/admin/payment-accounts", headers=headers, json={**MFS_PAYLOAD, "mfs_number": "12345"}
    )
    assert bad_mfs.status_code == 422
    assert "MFS_NUMBER_INVALID" in str(bad_mfs.json())

    # Bangla digits are normalized to Latin for storage.
    bangla_digits = await client.post(
        "/api/admin/payment-accounts",
        headers=headers,
        json={**MFS_PAYLOAD, "mfs_number": "০১৭১২৩৪৫৬৭৮"},
    )
    assert bangla_digits.status_code == 201, bangla_digits.text
    assert bangla_digits.json()["mfs_number"] == "01712345678"


async def test_duplicate_account_rejected(client: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await _seed_admin(db_session)
    first = await client.post("/api/admin/payment-accounts", headers=headers, json=MFS_PAYLOAD)
    assert first.status_code == 201
    dup = await client.post("/api/admin/payment-accounts", headers=headers, json=MFS_PAYLOAD)
    assert dup.status_code == 409
    assert dup.json()["detail"] == "DUPLICATE_ACCOUNT"


async def test_deactivate_reactivate_and_member_active_only(client: AsyncClient, db_session: AsyncSession) -> None:
    _, admin_headers = await _seed_admin(db_session)
    member_headers = await _seed_member(db_session)
    created = await client.post("/api/admin/payment-accounts", headers=admin_headers, json=BANK_PAYLOAD)
    account_id = created.json()["id"]

    # Member sees it while active...
    visible = await client.get("/api/payment-accounts", headers=member_headers)
    assert [a["id"] for a in visible.json()] == [account_id]
    # ...and gets the numbers it needs to actually pay, but no audit fields.
    entry = visible.json()[0]
    assert entry["account_number"] == "123456789"
    assert "created_at" not in entry and "status" not in entry

    deactivated = await client.patch(
        f"/api/admin/payment-accounts/{account_id}/status",
        headers=admin_headers,
        json={"status": "inactive"},
    )
    assert deactivated.json()["status"] == "inactive"

    # The inactive account must never be returned - the member list is
    # filtered server-side.
    hidden = await client.get("/api/payment-accounts", headers=member_headers)
    assert hidden.json() == []

    reactivated = await client.patch(
        f"/api/admin/payment-accounts/{account_id}/status",
        headers=admin_headers,
        json={"status": "active"},
    )
    assert reactivated.json()["status"] == "active"
    again = await client.get("/api/payment-accounts", headers=member_headers)
    assert [a["id"] for a in again.json()] == [account_id]


async def test_member_endpoint_requires_authentication(client: AsyncClient, db_session: AsyncSession) -> None:
    await client.post(
        "/api/admin/payment-accounts",
        headers=(await _seed_admin(db_session))[1],
        json=BANK_PAYLOAD,
    )
    anonymous = await client.get("/api/payment-accounts")
    assert anonymous.status_code in (401, 403)


async def test_members_cannot_call_admin_endpoints(client: AsyncClient, db_session: AsyncSession) -> None:
    member_headers = await _seed_member(db_session)
    for method, url in (
        ("get", "/api/admin/payment-accounts"),
        ("post", "/api/admin/payment-accounts"),
        ("patch", "/api/admin/payment-accounts/reorder"),
    ):
        if method == "get":
            response = await client.get(url, headers=member_headers)
        else:
            response = await getattr(client, method)(url, headers=member_headers, json={})
        assert response.status_code in (401, 403), (method, url, response.status_code)


async def test_audit_entries_mask_account_numbers(client: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await _seed_admin(db_session)
    created = await client.post("/api/admin/payment-accounts", headers=headers, json=BANK_PAYLOAD)
    account_id = created.json()["id"]
    await client.patch(
        f"/api/admin/payment-accounts/{account_id}/status",
        headers=headers,
        json={"status": "inactive"},
    )
    rows = (
        await db_session.execute(
            select(AuditLog).where(AuditLog.entity_type == "payment_account").order_by(AuditLog.id)
        )
    ).scalars().all()
    assert rows, "expected audit entries for create + status change"
    for row in rows:
        assert "123456789" not in (row.detail or "")
        assert "••••6789" in (row.detail or "")


async def test_reorder_persists_display_order(client: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await _seed_admin(db_session)
    first = (await client.post("/api/admin/payment-accounts", headers=headers, json=BANK_PAYLOAD)).json()
    second = (await client.post("/api/admin/payment-accounts", headers=headers, json=MFS_PAYLOAD)).json()
    moved = await client.patch(
        "/api/admin/payment-accounts/reorder",
        headers=headers,
        json={"ids": [second["id"], first["id"]]},
    )
    assert moved.status_code == 200
    order = {a["id"]: a["display_order"] for a in moved.json()}
    assert order[second["id"]] == 0 and order[first["id"]] == 1
