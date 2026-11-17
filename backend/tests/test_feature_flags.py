"""Feature flags: registry defaults, public/admin endpoints, audit, is_enabled helper."""

import pytest
from sqlalchemy import select

from app.core.feature_flags import FEATURE_FLAGS, enabled_flags, is_enabled
from app.models.audit_log import AuditLog
from app.models.feature_flag import FeatureFlag
from app.models.rbac import Permission, UserPermissionOverride
from tests.test_finance import _approved_member, _headers

pytestmark = pytest.mark.asyncio

EXPECTED_KEYS = {
    "reg_occupation_optional",
    "reg_hide_nationality",
    "reg_road_optional",
    "reg_dag_unknown",
    "reg_add_property_button",
    "reg_min_one_proof",
    "reg_abroad_address",
    "reg_simplified_ui",
    "password_policy_v2",
    "nav_merged_entries",
    "nav_advanced_section",
    "pay_merged_page",
    "nav_five_areas",
    "map_wizard",
    "admin_console",
    "admin_bulk_verify",
    "fee_wizard",
    "login_by_phone",
    "ui_a11y_v2",
    "data_saver",
    "net_status_banner",
    "pay_verify_other_fees",
}


# Easy-to-use rollout (stages A-D): everything on except the money-flow change.
DEFAULT_ON = EXPECTED_KEYS - {"pay_verify_other_fees"}


def _exec_headers(admin_user) -> dict:
    return _headers(admin_user.id, "executive_committee")


async def test_registry_has_expected_keys_and_rollout_defaults():
    assert set(FEATURE_FLAGS) == EXPECTED_KEYS
    for key, flag in FEATURE_FLAGS.items():
        assert flag.key == key
        assert flag.default is (key in DEFAULT_ON)
        assert flag.description


async def test_public_endpoint_returns_defaults_without_auth(client):
    response = await client.get("/api/public/feature-flags")

    assert response.status_code == 200
    assert response.json() == {"flags": {key: key in DEFAULT_ON for key in EXPECTED_KEYS}}


async def test_admin_update_is_reflected_in_public_endpoint(client, admin_user):
    headers = _exec_headers(admin_user)
    assert (await client.get("/api/public/feature-flags")).json()["flags"]["pay_verify_other_fees"] is False

    response = await client.put(
        "/api/admin/feature-flags/pay_verify_other_fees", json={"enabled": True}, headers=headers
    )

    assert response.status_code == 200
    body = response.json()
    assert body["key"] == "pay_verify_other_fees"
    assert body["enabled"] is True
    assert body["default"] is False
    assert body["updated_at"] is not None
    public = (await client.get("/api/public/feature-flags")).json()["flags"]
    assert public["pay_verify_other_fees"] is True
    assert sum(public.values()) == 1 + len(DEFAULT_ON)


async def test_admin_can_turn_flag_back_off(client, admin_user):
    headers = _exec_headers(admin_user)
    url = "/api/admin/feature-flags/password_policy_v2"
    await client.put(url, json={"enabled": True}, headers=headers)

    response = await client.put(url, json={"enabled": False}, headers=headers)

    assert response.status_code == 200
    assert response.json()["enabled"] is False
    assert (await client.get("/api/public/feature-flags")).json()["flags"]["password_policy_v2"] is False


async def test_admin_list_returns_every_flag_with_metadata(client, admin_user):
    headers = _exec_headers(admin_user)
    await client.put("/api/admin/feature-flags/admin_bulk_verify", json={"enabled": True}, headers=headers)

    response = await client.get("/api/admin/feature-flags", headers=headers)

    assert response.status_code == 200
    rows = {row["key"]: row for row in response.json()}
    assert set(rows) == EXPECTED_KEYS
    assert rows["admin_bulk_verify"]["enabled"] is True
    assert rows["admin_bulk_verify"]["updated_at"] is not None
    assert rows["pay_verify_other_fees"]["enabled"] is False
    assert rows["pay_verify_other_fees"]["updated_at"] is None
    assert rows["pay_verify_other_fees"]["default"] is False
    assert rows["pay_verify_other_fees"]["description"] == FEATURE_FLAGS["pay_verify_other_fees"].description


async def test_update_unknown_key_returns_404(client, admin_user):
    response = await client.put(
        "/api/admin/feature-flags/does_not_exist", json={"enabled": True}, headers=_exec_headers(admin_user)
    )

    assert response.status_code == 404


async def test_update_rejects_non_boolean_body(client, admin_user):
    response = await client.put(
        "/api/admin/feature-flags/pay_verify_other_fees", json={"enabled": "maybe"}, headers=_exec_headers(admin_user)
    )

    assert response.status_code == 422


async def test_anonymous_and_members_cannot_use_admin_endpoints(client, db_session):
    member = await _approved_member(db_session)

    for headers in ({}, _headers(member.id, "member")):
        assert (await client.get("/api/admin/feature-flags", headers=headers)).status_code in (401, 403)
        response = await client.put(
            "/api/admin/feature-flags/pay_verify_other_fees", json={"enabled": True}, headers=headers
        )
        assert response.status_code in (401, 403)


async def test_admin_without_permission_gets_403(client, db_session, admin_user):
    permission = Permission(key="manage_system_config", resource="system", action="manage")
    db_session.add(permission)
    await db_session.commit()
    db_session.add(UserPermissionOverride(user_id=admin_user.id, permission_id=permission.id, granted=False))
    await db_session.commit()
    headers = _exec_headers(admin_user)

    assert (await client.get("/api/admin/feature-flags", headers=headers)).status_code == 403
    response = await client.put(
        "/api/admin/feature-flags/pay_verify_other_fees", json={"enabled": True}, headers=headers
    )
    assert response.status_code == 403
    assert (await db_session.execute(select(FeatureFlag))).scalars().all() == []


async def test_update_writes_audit_row_with_old_and_new(client, db_session, admin_user):
    headers = _exec_headers(admin_user)

    await client.put("/api/admin/feature-flags/pay_verify_other_fees", json={"enabled": True}, headers=headers)

    audit = (
        await db_session.execute(select(AuditLog).where(AuditLog.action == "feature_flag.update"))
    ).scalar_one()
    assert audit.actor_admin_id == admin_user.id
    assert audit.entity_type == "feature_flag"
    assert audit.entity_id == "pay_verify_other_fees"
    assert "false" in audit.detail.lower() and "true" in audit.detail.lower()


async def test_is_enabled_returns_default_then_db_override(db_session):
    assert await is_enabled(db_session, "pay_verify_other_fees") is False

    db_session.add(FeatureFlag(key="pay_verify_other_fees", enabled=True))
    await db_session.commit()

    assert await is_enabled(db_session, "pay_verify_other_fees") is True
    assert await is_enabled(db_session, "admin_console") is True


async def test_enabled_flags_resolves_defaults_and_overrides_in_one_call(db_session):
    db_session.add(FeatureFlag(key="pay_verify_other_fees", enabled=True))
    await db_session.commit()

    flags = await enabled_flags(db_session, ("pay_verify_other_fees", "admin_console"))

    assert flags == {"pay_verify_other_fees": True, "admin_console": True}


async def test_enabled_flags_unknown_key_raises_key_error(db_session):
    with pytest.raises(KeyError):
        await enabled_flags(db_session, ("pay_verify_other_fees", "nope"))


async def test_is_enabled_unknown_key_raises_key_error(db_session):
    with pytest.raises(KeyError):
        await is_enabled(db_session, "nope")
