"""Reject -> applicant login -> correct same record -> resubmit -> approve."""

import json
import re

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import func, select, update

from app.api.routes import admin as admin_routes
from app.models.admin import AdminUser
from app.models.application_review import ApplicationReview
from app.models.credential import MemberCredential
from app.models.feature_flag import FeatureFlag
from app.models.member import Member, MemberStatus
from app.services.status_transition import claim_status_transition
from app.services.upload_access import can_access_upload
from tests.test_submission_flow import _submission_payload

pytestmark = pytest.mark.asyncio

_TEMP_PASSWORD_RE = re.compile(r"Temporary password: <b>(.+?)</b>")
_NEW_PASSWORD = "Corrected#Pass123"


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    sent: list[dict] = []

    async def fake_send_email(to: str, subject: str, html_body: str) -> bool:
        sent.append({"to": to, "subject": subject, "html_body": html_body})
        return True

    monkeypatch.setattr(admin_routes, "send_email", fake_send_email)
    from app.api.routes import applicant as applicant_routes

    monkeypatch.setattr(applicant_routes, "send_email", fake_send_email)
    return sent


async def _admin_headers(client: AsyncClient) -> dict:
    res = await client.post(
        "/api/admin/login", json={"email": "admin@example.com", "password": "adminpass123"}
    )
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


async def _submit(client: AsyncClient, payload: dict | None = None) -> int:
    res = await client.post(
        "/api/submissions", data={"payload": json.dumps(payload or _submission_payload())}
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


async def _reject(client: AsyncClient, admin: dict, member_pk: int, **extra) -> dict:
    res = await client.post(
        f"/api/admin/submissions/{member_pk}/reject",
        json={"reason": "NID copy unclear", **extra},
        headers=admin,
    )
    assert res.status_code == 200, res.text
    return res.json()


def _temp_password(email: dict) -> str:
    match = _TEMP_PASSWORD_RE.search(email["html_body"])
    assert match is not None, email["html_body"]
    return match.group(1)


async def _applicant_headers(client: AsyncClient, password: str) -> dict:
    res = await client.post(
        "/api/login", json={"identifier": "member@example.com", "password": password}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["role"] == "applicant"
    return {"Authorization": f"Bearer {body['access_token']}"}


async def _rejected_applicant(client: AsyncClient, outbox: list[dict]) -> tuple[int, dict, dict]:
    member_pk = await _submit(client)
    admin = await _admin_headers(client)
    await _reject(client, admin, member_pk, correction_fields=["nid", "documents"])
    headers = await _applicant_headers(client, _temp_password(outbox[-1]))
    return member_pk, admin, headers


async def test_reject_creates_email_login_and_mails_link_reason_and_fields(
    client: AsyncClient, db_session, admin_user: AdminUser, outbox: list[dict]
) -> None:
    member_pk = await _submit(client)
    admin = await _admin_headers(client)

    await _reject(client, admin, member_pk, correction_fields=["documents", "nid"])

    credential = (
        await db_session.execute(
            select(MemberCredential).where(MemberCredential.member_id == member_pk)
        )
    ).scalar_one()
    assert credential.username == "member@example.com"
    assert credential.must_change_password is True
    body = outbox[-1]["html_body"]
    assert "NID copy unclear" in body
    assert "/login" in body
    assert "member@example.com" in body
    assert "Documents" in body and "NID" in body
    review = (await db_session.execute(select(ApplicationReview))).scalar_one()
    assert (review.round, review.decision) == (1, "rejected")
    assert review.correction_fields == ["nid", "documents"]  # canonical order


async def test_reject_rejects_unknown_correction_field(
    client: AsyncClient, admin_user: AdminUser, outbox: list[dict]
) -> None:
    member_pk = await _submit(client)
    admin = await _admin_headers(client)
    res = await client.post(
        f"/api/admin/submissions/{member_pk}/reject",
        json={"reason": "x", "correction_fields": ["salary"]},
        headers=admin,
    )
    assert res.status_code == 422


async def test_rejecting_twice_is_a_conflict(
    client: AsyncClient, admin_user: AdminUser, outbox: list[dict]
) -> None:
    member_pk = await _submit(client)
    admin = await _admin_headers(client)
    await _reject(client, admin, member_pk)
    again = await client.post(
        f"/api/admin/submissions/{member_pk}/reject", json={"reason": "again"}, headers=admin
    )
    assert again.status_code == 409


async def test_applicant_sees_reason_and_cannot_reach_member_area(
    client: AsyncClient, admin_user: AdminUser, outbox: list[dict]
) -> None:
    _pk, _admin, headers = await _rejected_applicant(client, outbox)

    view = await client.get("/api/applicant/application", headers=headers)
    assert view.status_code == 200
    body = view.json()
    assert body["can_edit"] is True
    assert body["rejection_reason"] == "NID copy unclear"
    assert body["correction_fields"] == ["nid", "documents"]
    assert body["application"]["status"] == "rejected"

    assert (await client.get("/api/member/me", headers=headers)).status_code == 403
    assert (await client.get("/api/admin/submissions", headers=headers)).status_code == 403


async def test_applicant_can_change_password_and_keeps_applicant_role(
    client: AsyncClient, admin_user: AdminUser, outbox: list[dict]
) -> None:
    _pk, _admin, headers = await _rejected_applicant(client, outbox)
    temp = _temp_password(outbox[-1])

    res = await client.post(
        "/api/member/change-password",
        json={"current_password": temp, "new_password": _NEW_PASSWORD},
        headers=headers,
    )

    assert res.status_code == 200, res.text
    fresh = {"Authorization": f"Bearer {res.json()['access_token']}"}
    assert (await client.get("/api/applicant/application", headers=fresh)).status_code == 200
    relogin = await client.post(
        "/api/login", json={"identifier": "member@example.com", "password": _NEW_PASSWORD}
    )
    assert relogin.json()["must_change_password"] is False


async def test_edit_updates_same_record_and_resubmit_queues_it(
    client: AsyncClient, db_session, admin_user: AdminUser, outbox: list[dict]
) -> None:
    member_pk, _admin, headers = await _rejected_applicant(client, outbox)
    corrected = _submission_payload() | {"full_name": "Corrected Name", "nid": "9876543210"}

    edit = await client.put(
        "/api/applicant/application",
        data={"payload": json.dumps(corrected)},
        headers=headers,
    )
    assert edit.status_code == 200, edit.text
    assert edit.json()["application"]["id"] == member_pk
    assert edit.json()["application"]["full_name"] == "Corrected Name"

    resubmit = await client.post("/api/applicant/application/resubmit", headers=headers)
    assert resubmit.status_code == 200, resubmit.text
    assert resubmit.json() == {"status": "pending", "resubmission_count": 1}

    total = (await db_session.execute(select(func.count()).select_from(Member))).scalar_one()
    assert total == 1  # no copies

    locked = await client.put(
        "/api/applicant/application",
        data={"payload": json.dumps(corrected)},
        headers=headers,
    )
    assert locked.status_code == 409
    assert locked.json()["detail"]["code"] == "APPLICATION_LOCKED"


async def test_edit_refuses_identifier_of_another_live_application(
    client: AsyncClient, admin_user: AdminUser, outbox: list[dict]
) -> None:
    _pk, _admin, headers = await _rejected_applicant(client, outbox)
    other = _submission_payload() | {
        "nid": "5555555555",
        "mobile": "01755555555",
        "email": "other@example.com",
    }
    await _submit(client, other)

    clash = _submission_payload() | {"nid": "5555555555"}
    res = await client.put(
        "/api/applicant/application", data={"payload": json.dumps(clash)}, headers=headers
    )

    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "APPLICATION_PENDING"


async def test_unlimited_rounds_then_final_approval_issues_member_id(
    client: AsyncClient, db_session, admin_user: AdminUser, outbox: list[dict]
) -> None:
    member_pk, admin, headers = await _rejected_applicant(client, outbox)

    for round_no in (1, 2, 3):
        res = await client.post("/api/applicant/application/resubmit", headers=headers)
        assert res.json()["resubmission_count"] == round_no
        if round_no < 3:
            await _reject(client, admin, member_pk)
            assert "existing password" in outbox[-1]["html_body"]  # password kept

    approve = await client.post(f"/api/admin/submissions/{member_pk}/approve", headers=admin)
    assert approve.status_code == 200, approve.text
    member_code = approve.json()["member_id"]
    assert re.fullmatch(r"UKAMKS-\d+", member_code)

    # Old applicant session revoked; member signs in with the member ID.
    assert (await client.get("/api/applicant/application", headers=headers)).status_code == 401
    temp = _temp_password(outbox[-1])
    login = await client.post(
        "/api/login", json={"identifier": member_code.lower(), "password": temp}
    )
    assert login.status_code == 200
    assert login.json()["role"] == "member"
    rounds = (
        await db_session.execute(
            select(ApplicationReview.round, ApplicationReview.decision).order_by(ApplicationReview.id)
        )
    ).all()
    assert [tuple(r) for r in rounds] == [
        (1, "rejected"),
        (2, "rejected"),
        (3, "rejected"),
        (4, "approved"),
    ]


async def test_rejected_application_cannot_be_approved_before_resubmission(
    client: AsyncClient, admin_user: AdminUser, outbox: list[dict]
) -> None:
    member_pk = await _submit(client)
    admin = await _admin_headers(client)
    await _reject(client, admin, member_pk)
    res = await client.post(f"/api/admin/submissions/{member_pk}/approve", headers=admin)
    assert res.status_code == 409


async def test_resend_credentials_rotates_password(
    client: AsyncClient, admin_user: AdminUser, outbox: list[dict]
) -> None:
    member_pk, admin, _headers = await _rejected_applicant(client, outbox)
    first = _temp_password(outbox[-1])

    res = await client.post(f"/api/admin/submissions/{member_pk}/resend-credentials", headers=admin)

    assert res.status_code == 200
    second = _temp_password(outbox[-1])
    assert second != first
    old = await client.post(
        "/api/login", json={"identifier": "member@example.com", "password": first}
    )
    assert old.status_code == 401
    await _applicant_headers(client, second)


async def test_review_history_endpoint_lists_rounds(
    client: AsyncClient, admin_user: AdminUser, outbox: list[dict]
) -> None:
    member_pk, admin, _headers = await _rejected_applicant(client, outbox)
    res = await client.get(f"/api/admin/submissions/{member_pk}/reviews", headers=admin)
    assert res.status_code == 200
    assert [r["decision"] for r in res.json()["reviews"]] == ["rejected"]


async def test_applicant_upload_access_is_own_files_only() -> None:
    applicant = {"role": "applicant", "sub": "7"}
    assert can_access_upload("documents/member_7/nid/a.pdf", applicant)
    assert can_access_upload("photos/member_7/p.jpg", applicant)
    assert not can_access_upload("photos/member_8/p.jpg", applicant)
    assert not can_access_upload("finance_receipts/x.jpg", applicant)


async def test_brand_new_pending_application_has_no_login(
    client: AsyncClient, db_session, admin_user: AdminUser
) -> None:
    member_pk = await _submit(client)
    member = await db_session.get(Member, member_pk)
    assert member.status == MemberStatus.PENDING
    count = (
        await db_session.execute(select(func.count()).select_from(MemberCredential))
    ).scalar_one()
    assert count == 0


def _payload_with_doc(existing_path: str | None = None) -> dict:
    payload = _submission_payload()
    doc = {"doc_type": "দলিল"}
    if existing_path is not None:
        doc["existing_file_path"] = existing_path
    payload["properties"][0]["applicable_docs"] = [doc]
    return payload


_DOC_FILE = ("doc_files", ("deed.pdf", b"%PDF-1.4 fake", "application/pdf"))


async def test_edit_keeps_own_document_and_ignores_foreign_path(
    client: AsyncClient, admin_user: AdminUser, outbox: list[dict]
) -> None:
    res = await client.post(
        "/api/submissions",
        data={"payload": json.dumps(_payload_with_doc())},
        files=[_DOC_FILE],
    )
    assert res.status_code == 201, res.text
    member_pk = res.json()["id"]
    admin = await _admin_headers(client)
    await _reject(client, admin, member_pk)
    headers = await _applicant_headers(client, _temp_password(outbox[-1]))
    view = await client.get("/api/applicant/application", headers=headers)
    own_path = view.json()["application"]["properties"][0]["applicable_docs"][0]["file_path"]
    assert own_path

    kept = await client.put(
        "/api/applicant/application",
        data={"payload": json.dumps(_payload_with_doc(own_path))},
        headers=headers,
    )
    assert kept.status_code == 200, kept.text
    docs = kept.json()["application"]["properties"][0]["applicable_docs"]
    assert docs[0]["file_path"] == own_path

    forged = await client.put(
        "/api/applicant/application",
        data={"payload": json.dumps(_payload_with_doc("documents/member_999/x/secret.pdf"))},
        headers=headers,
    )
    assert forged.status_code == 200, forged.text
    docs = forged.json()["application"]["properties"][0]["applicable_docs"]
    assert docs[0]["file_path"] is None


async def test_forged_existing_path_does_not_satisfy_required_proof(
    client: AsyncClient, db_session, admin_user: AdminUser, outbox: list[dict]
) -> None:
    # Arrange: proof is mandatory and the applicant owns one stored document.
    db_session.add(FeatureFlag(key="reg_min_one_proof", enabled=True))
    await db_session.commit()
    res = await client.post(
        "/api/submissions",
        data={"payload": json.dumps(_payload_with_doc())},
        files=[_DOC_FILE],
    )
    assert res.status_code == 201, res.text
    admin = await _admin_headers(client)
    await _reject(client, admin, res.json()["id"])
    headers = await _applicant_headers(client, _temp_password(outbox[-1]))

    # Act: point the only slot at a path the applicant does not own, no upload.
    forged = await client.put(
        "/api/applicant/application",
        data={"payload": json.dumps(_payload_with_doc("documents/member_999/x/secret.pdf"))},
        headers=headers,
    )

    # Assert: validation uses the same "own files only" rule as saving.
    assert forged.status_code == 422, forged.text
    assert forged.json()["detail"]["code"] == "PROPERTY_PROOF_REQUIRED"


async def test_status_claim_loses_to_a_concurrent_decision(
    client: AsyncClient, db_session, admin_user: AdminUser, outbox: list[dict]
) -> None:
    # Arrange: a reviewer holds the PENDING row while another request rejects it.
    member_pk = await _submit(client)
    member = await db_session.get(Member, member_pk)
    assert member.status == MemberStatus.PENDING
    await db_session.execute(
        update(Member)
        .where(Member.id == member_pk)
        .values(status=MemberStatus.REJECTED)
        .execution_options(synchronize_session=False)
    )
    conflict = HTTPException(status_code=409, detail="raced")

    # Act / Assert: the stale PENDING claim must not overwrite the rejection.
    with pytest.raises(HTTPException) as caught:
        await claim_status_transition(db_session, member, MemberStatus.APPROVED, conflict=conflict)
    assert caught.value is conflict
    stored = (
        await db_session.execute(select(Member.status).where(Member.id == member_pk))
    ).scalar_one()
    assert stored == MemberStatus.REJECTED


async def test_status_claim_applies_when_status_unchanged(
    client: AsyncClient, db_session, admin_user: AdminUser, outbox: list[dict]
) -> None:
    member_pk = await _submit(client)
    member = await db_session.get(Member, member_pk)

    await claim_status_transition(
        db_session, member, MemberStatus.REJECTED, conflict=HTTPException(status_code=409)
    )

    assert member.status == MemberStatus.REJECTED
    stored = (
        await db_session.execute(select(Member.status).where(Member.id == member_pk))
    ).scalar_one()
    assert stored == MemberStatus.REJECTED


async def test_rejected_existing_member_can_still_be_reapproved(
    client: AsyncClient, db_session, admin_user: AdminUser, outbox: list[dict]
) -> None:
    """A member re-queued by a profile edit and then rejected keeps their ID
    and member login; the committee can approve them again directly."""
    member_pk = await _submit(client)
    admin = await _admin_headers(client)
    first = await client.post(f"/api/admin/submissions/{member_pk}/approve", headers=admin)
    member_code = first.json()["member_id"]
    member = await db_session.get(Member, member_pk)
    member.status = MemberStatus.PENDING
    await db_session.commit()

    await _reject(client, admin, member_pk)
    again = await client.post(f"/api/admin/submissions/{member_pk}/approve", headers=admin)

    assert again.status_code == 200, again.text
    assert again.json()["member_id"] == member_code
    username = (
        await db_session.execute(
            select(MemberCredential.username).where(MemberCredential.member_id == member_pk)
        )
    ).scalar_one()
    assert username == member_code.lower()
