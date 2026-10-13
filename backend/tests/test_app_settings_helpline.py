"""Batch 3: helpline settings (public GET, admin PUT) and the app_settings table."""

import pytest
from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.rbac import Permission, UserPermissionOverride
from tests.test_installment_payments import _member_headers, _seed_member

pytestmark = pytest.mark.asyncio

PUBLIC = "/api/public/helpline"
ADMIN = "/api/admin/helpline"


async def _headers(client):
    r = await client.post("/api/admin/login", json={"email": "admin@example.com", "password": "adminpass123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def test_empty_get(client) -> None:
    r = await client.get(PUBLIC)
    assert r.status_code == 200
    assert r.json() == {"phone": None, "whatsapp": None, "hours_text": None, "enabled": False}


async def test_put_normalises_audits_and_public_reflects(client, db_session, admin_user) -> None:
    headers = await _headers(client)
    assert (await client.get(PUBLIC)).headers["X-Cache"] == "MISS"
    assert (await client.get(PUBLIC)).headers["X-Cache"] == "HIT"

    r = await client.put(
        ADMIN, json={"phone": "০১৭১২৩৪৫৬৭৮", "whatsapp": "8801812345678", "hours_text": "9-5"}, headers=headers
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"phone": "+8801712345678", "whatsapp": "+8801812345678", "hours_text": "9-5", "enabled": True}

    pub = await client.get(PUBLIC)
    assert pub.headers["X-Cache"] == "MISS"
    assert pub.json()["phone"] == "+8801712345678"

    audit = (
        await db_session.execute(select(AuditLog).where(AuditLog.action == "system.helpline_update"))
    ).scalars().all()
    assert len(audit) == 1
    assert "+8801712345678" in audit[0].detail and "before" in audit[0].detail and "after" in audit[0].detail

    r = await client.put(ADMIN, json={"phone": "+8801912345678", "whatsapp": None, "hours_text": ""}, headers=headers)
    assert r.json() == {"phone": "+8801912345678", "whatsapp": None, "hours_text": None, "enabled": True}


async def test_clearing_values(client, admin_user) -> None:
    headers = await _headers(client)
    await client.put(ADMIN, json={"phone": "01712345678", "whatsapp": "", "hours_text": "x"}, headers=headers)
    r = await client.put(ADMIN, json={"phone": "", "whatsapp": "", "hours_text": ""}, headers=headers)
    assert r.json() == {"phone": None, "whatsapp": None, "hours_text": None, "enabled": False}
    assert (await client.get(PUBLIC)).json()["enabled"] is False


async def test_whatsapp_only_enables(client, admin_user) -> None:
    headers = await _headers(client)
    r = await client.put(ADMIN, json={"phone": "", "whatsapp": "01712345678", "hours_text": ""}, headers=headers)
    assert r.json()["enabled"] is True


@pytest.mark.parametrize("bad", ["12345", "abc", "+441234567890", "0171234"])
async def test_invalid_number_422(client, admin_user, bad) -> None:
    r = await client.put(ADMIN, json={"phone": bad, "whatsapp": "", "hours_text": ""}, headers=await _headers(client))
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "INVALID_BD_MOBILE"


async def test_hours_text_max_200(client, admin_user) -> None:
    headers = await _headers(client)
    r = await client.put(ADMIN, json={"phone": "", "whatsapp": "", "hours_text": "x" * 201}, headers=headers)
    assert r.status_code == 422
    ok = await client.put(ADMIN, json={"phone": "", "whatsapp": "", "hours_text": "x" * 200}, headers=headers)
    assert ok.status_code == 200


async def test_put_permission(client, db_session, admin_user) -> None:
    member = await _seed_member(db_session, "h@example.com")
    body = {"phone": "01712345678", "whatsapp": "", "hours_text": ""}
    assert (await client.put(ADMIN, json=body, headers=_member_headers(member))).status_code in (401, 403)
    assert (await client.put(ADMIN, json=body)).status_code in (401, 403)
    perm = Permission(key="manage_system_config", resource="system", action="manage")
    db_session.add(perm)
    await db_session.commit()
    db_session.add(UserPermissionOverride(user_id=admin_user.id, permission_id=perm.id, granted=False))
    await db_session.commit()
    assert (await client.put(ADMIN, json=body, headers=await _headers(client))).status_code == 403


async def test_service_allow_list(db_session) -> None:
    from app.services.app_settings import get_setting, set_setting

    with pytest.raises(ValueError):
        await set_setting(db_session, "secret", {"a": 1}, admin_id=None)
    with pytest.raises(ValueError):
        await get_setting(db_session, "secret")
    assert await get_setting(db_session, "helpline") is None
