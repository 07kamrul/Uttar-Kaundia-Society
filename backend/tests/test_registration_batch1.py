"""Batch 1 registration contract: flags, photo/proof rules, abroad address,
dag-unknown workflow, registration-config, admin photo upload."""

import json
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.constants import CONSENT_VERSION
from app.core.feature_flags import FEATURE_FLAGS
from app.models.audit_log import AuditLog
from app.models.config_list_item import ConfigListItem
from app.models.feature_flag import FeatureFlag
from app.models.member import Member
from app.models.property import Property
from tests.conftest import NO_PHOTO_HEADER
from tests.test_finance import _headers
from tests.test_submission_flow import _submission_payload

pytestmark = pytest.mark.asyncio

_SEQ = {"n": 100}


async def _flags(db_session, *keys: str) -> None:
    for key in keys:
        db_session.add(FeatureFlag(key=key, enabled=True))
    await db_session.commit()


def _payload(**overrides) -> dict:
    _SEQ["n"] += 1
    n = _SEQ["n"]
    payload = _submission_payload()
    payload.update(nid=f"55{n:08d}", mobile=f"0171100{n:04d}", email=f"b1-{n}@example.com")
    payload.update(overrides)
    return payload


async def _post(client, payload, files=None, headers=None):
    return await client.post(
        "/api/submissions", data={"payload": json.dumps(payload)}, files=files, headers=headers
    )


def _admin(admin_user) -> dict:
    return _headers(admin_user.id, "executive_committee")


def _code(response) -> str:
    return response.json()["detail"]["code"]


async def test_new_flags_registered_default_off():
    for key in ("reg_abroad_address", "reg_simplified_ui"):
        assert FEATURE_FLAGS[key].default is False
        assert FEATURE_FLAGS[key].description


# --- photo (always) -----------------------------------------------------


async def test_photo_required_always(client: AsyncClient):
    response = await _post(client, _payload(), headers={NO_PHOTO_HEADER: "1"})
    assert response.status_code == 422
    assert _code(response) == "PHOTO_REQUIRED"


async def test_photo_alias_member_photo_camel_case_accepted(client: AsyncClient, tmp_path, monkeypatch):
    from app.services import storage

    monkeypatch.setattr(storage.settings, "upload_dir", str(tmp_path))
    files = [("memberPhoto", ("p.jpg", b"\xff\xd8\xff\xe0x", "image/jpeg"))]
    response = await _post(client, _payload(), files=files, headers={NO_PHOTO_HEADER: "1"})
    assert response.status_code == 201, response.text


# --- optional fields, flags off vs on ----------------------------------------


async def test_occupation_missing_rejected_when_flag_off(client: AsyncClient):
    payload = _payload()
    del payload["occupation"]
    response = await _post(client, payload)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "VALIDATION_ERROR"
    assert detail["errors"][0]["field"] == "occupation"


async def test_occupation_blank_still_accepted_when_flag_off(client: AsyncClient):
    payload = _payload()
    payload["occupation"] = ""
    assert (await _post(client, payload)).status_code == 201


async def test_occupation_missing_allowed_when_flag_on(client: AsyncClient, db_session):
    await _flags(db_session, "reg_occupation_optional")
    payload = _payload()
    del payload["occupation"]
    response = await _post(client, payload)
    assert response.status_code == 201, response.text
    member = await db_session.get(Member, response.json()["id"])
    assert member.occupation == ""


async def test_nationality_defaults_when_hidden_flag_on(client: AsyncClient, db_session):
    await _flags(db_session, "reg_hide_nationality")
    payload = _payload()
    payload["nationality"] = " "
    response = await _post(client, payload)
    assert response.status_code == 201
    member = await db_session.get(Member, response.json()["id"])
    assert member.nationality == "বাংলাদেশী"


async def test_nationality_missing_rejected_when_flag_off(client: AsyncClient):
    payload = _payload()
    del payload["nationality"]
    response = await _post(client, payload)
    assert response.status_code == 422
    assert response.json()["detail"]["errors"][0]["field"] == "nationality"


async def test_road_not_enforced_server_side(client: AsyncClient, db_session):
    payload = _payload()
    payload["current_address"]["road"] = ""
    assert (await _post(client, payload)).status_code == 201


async def test_dag_unknown_ignored_when_flag_off(client: AsyncClient, db_session):
    payload = _payload()
    payload["properties"][0].update(dag_no_cs="", dag_no_rs="", dag_unknown=True)
    response = await _post(client, payload)
    assert response.status_code == 201
    prop = (await db_session.scalars(select(Property))).one()
    assert prop.dag_unknown is False


async def test_dag_required_when_flag_on_and_not_unknown(client: AsyncClient, db_session):
    await _flags(db_session, "reg_dag_unknown")
    payload = _payload()
    payload["properties"][0].update(dag_no_cs="", dag_no_rs=None)
    response = await _post(client, payload)
    assert response.status_code == 422
    assert _code(response) == "DAG_REQUIRED_FIELD"


async def test_dag_unknown_allowed_when_flag_on(client: AsyncClient, db_session):
    await _flags(db_session, "reg_dag_unknown")
    payload = _payload()
    payload["properties"][0].update(dag_no_cs="", dag_no_rs="", dag_unknown=True)
    response = await _post(client, payload)
    assert response.status_code == 201, response.text
    prop = (await db_session.scalars(select(Property))).one()
    assert prop.dag_unknown is True


# --- proof --------------------------------------------------------------


def _with_doc(payload: dict) -> dict:
    payload["properties"][0]["applicable_docs"] = [{"doc_type": "খাজনা/কর রশিদ"}]
    return payload


async def test_proof_not_required_when_flag_off(client: AsyncClient):
    response = await _post(client, _payload())
    assert response.status_code == 201


async def test_proof_required_when_flag_on(client: AsyncClient, db_session):
    await _flags(db_session, "reg_min_one_proof")
    response = await _post(client, _payload())
    assert response.status_code == 422
    assert _code(response) == "PROPERTY_PROOF_REQUIRED"


async def test_proof_satisfied_by_one_file(client: AsyncClient, db_session, tmp_path, monkeypatch):
    from app.services import storage

    monkeypatch.setattr(storage.settings, "upload_dir", str(tmp_path))
    await _flags(db_session, "reg_min_one_proof")
    files = [("doc_files", ("d.pdf", b"%PDF-1.4 x", "application/pdf"))]
    response = await _post(client, _with_doc(_payload()), files=files)
    assert response.status_code == 201, response.text


# --- abroad address --------------------------------------------------------


def _abroad(**extra) -> dict:
    payload = _payload(
        current_address_abroad=True,
        current_country="JP",
        current_city="Tokyo",
        current_address_text="1-2-3 Shibuya",
        has_whatsapp=True,
        **extra,
    )
    payload["current_address"] = None
    return payload


async def test_abroad_stored_when_flag_on(client: AsyncClient, db_session):
    await _flags(db_session, "reg_abroad_address")
    response = await _post(client, _abroad())
    assert response.status_code == 201, response.text
    member = await db_session.get(Member, response.json()["id"])
    assert member.current_address_abroad is True
    assert (member.current_country, member.current_city) == ("JP", "Tokyo")
    assert member.current_address_text == "1-2-3 Shibuya"
    assert member.has_whatsapp is True


async def test_abroad_flag_off_keeps_today_behaviour(client: AsyncClient, db_session):
    response = await _post(client, _abroad())
    assert response.status_code == 201
    member = await db_session.get(Member, response.json()["id"])
    assert member.current_address_abroad is False


@pytest.mark.parametrize("missing", ["current_country", "current_city", "current_address_text"])
async def test_abroad_requires_fields_when_flag_on(client: AsyncClient, db_session, missing):
    await _flags(db_session, "reg_abroad_address")
    payload = _abroad()
    payload[missing] = ""
    response = await _post(client, payload)
    assert response.status_code == 422
    assert _code(response) == "ABROAD_ADDRESS_REQUIRED"


async def test_abroad_country_cannot_be_bd(client: AsyncClient, db_session):
    await _flags(db_session, "reg_abroad_address")
    payload = _abroad()
    payload["current_country"] = "bd"
    response = await _post(client, payload)
    assert response.status_code == 422
    assert _code(response) == "ABROAD_ADDRESS_REQUIRED"


async def test_consent_version_defaults_and_is_stored(client: AsyncClient, db_session):
    first = await _post(client, _payload())
    second = await _post(client, _payload(consent_version="2026-01"))
    assert (await db_session.get(Member, first.json()["id"])).consent_version == CONSENT_VERSION
    assert (await db_session.get(Member, second.json()["id"])).consent_version == "2026-01"


async def test_canonical_payment_methods_accepted(client: AsyncClient):
    for method in ("cash", "bkash", "nagad", "rocket", "bank", "other", "Cash"):
        response = await _post(client, _payload(payment_method=method))
        assert response.status_code == 201, method


# --- registration config ------------------------------------------------


async def test_registration_config(client: AsyncClient, db_session):
    db_session.add(
        ConfigListItem(category="payment_account", value="bkash", label="01711-000000 (Society)", is_active=1)
    )
    await db_session.commit()
    response = await client.get("/api/public/registration-config")
    assert response.status_code == 200
    body = response.json()
    assert body["consent_version"] == "2026-10" == CONSENT_VERSION
    account = body["payment_accounts"][0]
    assert account["method"] == "bkash"
    assert account["label"] == "01711-000000 (Society)"
    assert {"number", "account_name"} <= set(account)


async def test_registration_config_empty(client: AsyncClient):
    response = await client.get("/api/public/registration-config")
    assert response.json()["payment_accounts"] == []


# --- admin: needs_dag, dag fill, approve guard, photo upload ------------------


async def _dag_unknown_member(client, db_session) -> int:
    await _flags(db_session, "reg_dag_unknown")
    payload = _payload()
    payload["properties"][0].update(dag_no_cs="", dag_no_rs="", dag_unknown=True)
    response = await _post(client, payload)
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def test_needs_dag_in_detail_and_list(client, db_session, admin_user):
    member_id = await _dag_unknown_member(client, db_session)
    headers = _admin(admin_user)
    detail = (await client.get(f"/api/admin/submissions/{member_id}", headers=headers)).json()
    assert detail["needs_dag"] is True
    assert detail["properties"][0]["dag_unknown"] is True
    rows = (await client.get("/api/admin/submissions", headers=headers)).json()
    assert rows[0]["needs_dag"] is True


async def test_needs_dag_false_for_normal_member(client, db_session, admin_user):
    member_id = (await _post(client, _payload())).json()["id"]
    headers = _admin(admin_user)
    detail = (await client.get(f"/api/admin/submissions/{member_id}", headers=headers)).json()
    assert detail["needs_dag"] is False
    assert detail["current_address_abroad"] is False
    rows = (await client.get("/api/admin/submissions", headers=headers)).json()
    assert rows[0]["needs_dag"] is False


async def test_approve_blocked_with_dag_required(client, db_session, admin_user):
    member_id = await _dag_unknown_member(client, db_session)
    response = await client.post(
        f"/api/admin/submissions/{member_id}/approve", headers=_admin(admin_user)
    )
    assert response.status_code == 409
    assert _code(response) == "DAG_REQUIRED"


async def test_application_approve_blocked_with_dag_required(client, db_session, admin_user):
    from app.models.membership_appeal import MembershipApplication

    member_id = await _dag_unknown_member(client, db_session)
    application = MembershipApplication(
        application_no="APP-1", full_name="X", father_name="F", mother_name="M",
        mobile="01700000099", email="x@example.com", member_id=member_id,
        ownership_type="single", sla_due_at=datetime.now(timezone.utc),
    )
    db_session.add(application)
    await db_session.commit()
    response = await client.post(
        f"/api/admin/membership-applications/{application.id}/approve",
        json={"member_class": "general"},
        headers=_admin(admin_user),
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "DAG_REQUIRED"


async def test_dag_fill_then_approve(client, db_session, admin_user, monkeypatch):
    from app.api.routes import admin as admin_routes

    async def fake_send(**_kw):
        return True

    monkeypatch.setattr(admin_routes, "send_email", fake_send)
    member_id = await _dag_unknown_member(client, db_session)
    prop_id = (await db_session.scalars(select(Property.id))).one()
    headers = _admin(admin_user)
    url = f"/api/admin/submissions/{member_id}/properties/{prop_id}/dag"

    empty = await client.patch(url, json={"dag_no_cs": " ", "dag_no_rs": None}, headers=headers)
    assert empty.status_code == 422

    ok = await client.patch(url, json={"dag_no_cs": "123", "dag_no_rs": None}, headers=headers)
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["needs_dag"] is False
    assert body["properties"][0]["dag_unknown"] is False
    assert body["properties"][0]["dag_no_cs"] == "123"

    actions = (await db_session.scalars(select(AuditLog.action))).all()
    assert "property.dag_fill" in actions

    approve = await client.post(f"/api/admin/submissions/{member_id}/approve", headers=headers)
    assert approve.status_code == 200, approve.text


async def test_dag_fill_unknown_property_404(client, db_session, admin_user):
    member_id = await _dag_unknown_member(client, db_session)
    response = await client.patch(
        f"/api/admin/submissions/{member_id}/properties/99999/dag",
        json={"dag_no_cs": "1"},
        headers=_admin(admin_user),
    )
    assert response.status_code == 404


async def test_dag_fill_requires_auth(client, db_session):
    response = await client.patch(
        "/api/admin/submissions/1/properties/1/dag", json={"dag_no_cs": "1"}
    )
    assert response.status_code in (401, 403)


async def test_admin_photo_upload(client, db_session, admin_user, tmp_path, monkeypatch):
    from app.services import storage

    monkeypatch.setattr(storage.settings, "upload_dir", str(tmp_path))
    member_id = (await _post(client, _payload())).json()["id"]
    headers = _admin(admin_user)
    files = {"memberPhoto": ("new.jpg", b"\xff\xd8\xff\xe0new", "image/jpeg")}
    response = await client.put(
        f"/api/admin/submissions/{member_id}/photo", files=files, headers=headers
    )
    assert response.status_code == 200, response.text
    assert "member_" in response.json()["member_photo_path"]
    actions = (await db_session.scalars(select(AuditLog.action))).all()
    assert "member.photo_upload" in actions

    missing = await client.put(f"/api/admin/submissions/{member_id}/photo", headers=headers)
    assert missing.status_code == 422
    nf = await client.put("/api/admin/submissions/99999/photo", files=files, headers=headers)
    assert nf.status_code == 404
