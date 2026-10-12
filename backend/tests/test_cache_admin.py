"""Admin cache stats/flush endpoints, and immediate effect of RBAC changes
on the cached effective permissions."""

import pytest
from sqlalchemy import select

from app.models.admin import AdminRole
from app.models.audit_log import AuditLog
from app.models.rbac import Permission
from tests.test_finance import _admin, _approved_member, _headers

pytestmark = pytest.mark.asyncio


async def test_stats_lists_every_cache_for_admins(client, admin_user):
    response = await client.get("/api/admin/cache/stats", headers=_headers(admin_user.id, "executive_committee"))

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert {row["name"] for row in body["caches"]} == {
        "permissions", "public_lists", "fee_rates", "finance_summary"
    }
    assert all(row["maxsize"] > 0 and row["ttl_seconds"] > 0 for row in body["caches"])


async def test_members_and_anonymous_cannot_use_cache_admin(client, db_session):
    member = await _approved_member(db_session)

    for headers in ({}, _headers(member.id, "member")):
        assert (await client.get("/api/admin/cache/stats", headers=headers)).status_code in (401, 403)
        assert (await client.post("/api/admin/cache/clear", headers=headers)).status_code in (401, 403)


async def test_clear_empties_caches_and_is_audited(client, db_session, admin_user):
    await client.get("/api/public/notices")  # populate public_lists
    headers = _headers(admin_user.id, "executive_committee")

    response = await client.post("/api/admin/cache/clear", headers=headers)

    assert response.status_code == 200
    sizes = {row["name"]: row["size"] for row in response.json()["caches"]}
    assert sizes["public_lists"] == 0
    audit = (
        await db_session.execute(select(AuditLog).where(AuditLog.action == "cache.clear_all"))
    ).scalar_one()
    assert audit.actor_admin_id == admin_user.id


async def test_revoked_permission_applies_immediately_despite_cache(client, db_session):
    officer = await _admin(db_session, email="officer@x.com")
    root = await _admin(db_session, email="root@x.com", role=AdminRole.SUPER_ADMIN)
    # Permission rows come from the RBAC seed in prod; create the one we override.
    db_session.add(Permission(key="manage_system_config", resource="system", action="manage"))
    await db_session.commit()
    officer_headers = _headers(officer.id, "executive_committee")
    super_headers = _headers(root.id, "super_admin")
    overrides_url = f"/api/admin/rbac/users/{officer.id}/overrides"
    assert (await client.get("/api/admin/cache/stats", headers=officer_headers)).status_code == 200

    revoke = [{"permission_key": "manage_system_config", "granted": False}]
    assert (await client.put(overrides_url, json=revoke, headers=super_headers)).status_code == 200
    assert (await client.get("/api/admin/cache/stats", headers=officer_headers)).status_code == 403

    assert (await client.put(overrides_url, json=[], headers=super_headers)).status_code == 200
    assert (await client.get("/api/admin/cache/stats", headers=officer_headers)).status_code == 200
