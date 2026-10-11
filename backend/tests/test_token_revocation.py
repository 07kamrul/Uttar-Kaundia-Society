"""Token revocation: access/refresh tokens carry a `ver` claim that must match
the account's token_version; password reset/change bumps it."""

import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_member_in_good_standing
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
)
from app.models.admin import AdminUser
from app.models.credential import MemberCredential
from app.models.member import GOVERNANCE_STATUS_SUSPENDED, Member, MemberStatus
from app.models.password_reset import PasswordResetToken

pytestmark = pytest.mark.asyncio

MEMBER_ME = "/api/member/me"
ADMIN_ME = "/api/admin/rbac/me/permissions"


async def _member(db_session: AsyncSession, *, status=MemberStatus.APPROVED) -> Member:
    member = Member(
        status=status,
        full_name="Token Tester",
        father_or_husband="F",
        mother="M",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="Job",
        nid="1234567890",
        mobile="01758290421",
        gender="পুরুষ",
        email="tv@example.com",
        admission_fee="500",
        subscription="100",
        receipt_no="R-1",
        payment_method="Cash",
        submission_date="2026-01-01",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)
    db_session.add(MemberCredential(
        member_id=member.id,
        username="tv-0001",
        password_hash=hash_password("currentpass123"),
        must_change_password=False,
    ))
    await db_session.commit()
    return member


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _reset_via_link(client: AsyncClient, db_session: AsyncSession, **owner) -> None:
    raw = "raw-reset-token-" + owner["user_type"]
    db_session.add(PasswordResetToken(
        token_hash=hashlib.sha256(raw.encode()).hexdigest(),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        **owner,
    ))
    await db_session.commit()
    response = await client.post("/api/reset-password", json={"token": raw, "new_password": "brandnew99"})
    assert response.status_code == 200


async def test_tokens_carry_version_claim() -> None:
    assert decode_token(create_access_token("1", "member", 3))["ver"] == 3
    assert decode_token(create_refresh_token("1", "member", 3))["ver"] == 3
    assert decode_token(create_access_token("1", "member"))["ver"] == 0


async def test_login_issues_current_version(client: AsyncClient, db_session: AsyncSession) -> None:
    member = await _member(db_session)
    cred = (await db_session.execute(
        select(MemberCredential).where(MemberCredential.member_id == member.id)
    )).scalar_one()
    cred.token_version = 4
    await db_session.commit()
    response = await client.post("/api/member/login", json={"username": "tv-0001", "password": "currentpass123"})
    assert response.status_code == 200
    body = response.json()
    assert decode_token(body["access_token"])["ver"] == 4
    assert decode_token(body["refresh_token"])["ver"] == 4
    assert (await client.get(MEMBER_ME, headers=_bearer(body["access_token"]))).status_code == 200


async def test_legacy_token_without_ver_still_accepted(client: AsyncClient, db_session: AsyncSession) -> None:
    from jose import jwt

    from app.core.config import get_settings

    member = await _member(db_session)
    settings = get_settings()
    legacy = jwt.encode(
        {"sub": str(member.id), "role": "member", "type": "access",
         "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        settings.jwt_secret_key, algorithm=settings.jwt_algorithm,
    )
    assert (await client.get(MEMBER_ME, headers=_bearer(legacy))).status_code == 200


async def test_member_reset_password_revokes_old_tokens(client: AsyncClient, db_session: AsyncSession) -> None:
    member = await _member(db_session)
    old = create_access_token(str(member.id), "member", 0)
    assert (await client.get(MEMBER_ME, headers=_bearer(old))).status_code == 200

    await _reset_via_link(client, db_session, user_type="member", member_id=member.id)

    assert (await client.get(MEMBER_ME, headers=_bearer(old))).status_code == 401
    fresh = await client.post("/api/member/login", json={"username": "tv-0001", "password": "brandnew99"})
    assert (await client.get(MEMBER_ME, headers=_bearer(fresh.json()["access_token"]))).status_code == 200


async def test_member_change_password_revokes_old_tokens(client: AsyncClient, db_session: AsyncSession) -> None:
    member = await _member(db_session)
    old = create_access_token(str(member.id), "member", 0)
    response = await client.post(
        "/api/member/change-password",
        headers=_bearer(old),
        json={"current_password": "currentpass123", "new_password": "brandnew99"},
    )
    assert response.status_code == 200
    assert (await client.get(MEMBER_ME, headers=_bearer(old))).status_code == 401
    # The caller stays signed in with the fresh token returned by the call.
    fresh = response.json()["access_token"]
    assert (await client.get(MEMBER_ME, headers=_bearer(fresh))).status_code == 200


async def test_admin_reset_password_revokes_old_tokens(
    client: AsyncClient, db_session: AsyncSession, admin_user: AdminUser
) -> None:
    old = create_access_token(str(admin_user.id), admin_user.role.value, 0)
    assert (await client.get(ADMIN_ME, headers=_bearer(old))).status_code == 200

    await _reset_via_link(client, db_session, user_type="admin", admin_id=admin_user.id)

    assert (await client.get(ADMIN_ME, headers=_bearer(old))).status_code == 401
    fresh = await client.post("/api/admin/login", json={"email": "admin@example.com", "password": "brandnew99"})
    assert fresh.status_code == 200
    assert (await client.get(ADMIN_ME, headers=_bearer(fresh.json()["access_token"]))).status_code == 200


async def test_stale_version_rejected_for_account_actor(client: AsyncClient, db_session: AsyncSession) -> None:
    member = await _member(db_session)
    stale = create_access_token(str(member.id), "member", 7)
    assert (await client.get("/api/media-token", headers=_bearer(stale))).status_code == 401


async def test_pending_and_suspended_members_keep_default_access(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    # Self-edits requeue approved members to PENDING, and suspension is a
    # governance record (appeals need the session) - not an auth gate.
    member = await _member(db_session, status=MemberStatus.PENDING)
    member.governance_status = GOVERNANCE_STATUS_SUSPENDED
    await db_session.commit()
    token = create_access_token(str(member.id), "member")
    assert (await client.get(MEMBER_ME, headers=_bearer(token))).status_code == 200


@pytest.mark.parametrize(
    "status_value,governance,expected",
    [
        (MemberStatus.APPROVED, "active", None),
        (MemberStatus.PENDING, "active", 403),
        (MemberStatus.REJECTED, "active", 403),
        (MemberStatus.APPROVED, GOVERNANCE_STATUS_SUSPENDED, 403),
    ],
)
async def test_good_standing_dependency(
    db_session: AsyncSession, status_value, governance, expected
) -> None:
    member = await _member(db_session, status=status_value)
    member.governance_status = governance
    await db_session.commit()
    creds = HTTPAuthorizationCredentials(
        scheme="Bearer", credentials=create_access_token(str(member.id), "member")
    )
    if expected is None:
        resolved = await get_current_member_in_good_standing(creds, db_session)
        assert resolved.id == member.id
        return
    with pytest.raises(HTTPException) as exc:
        await get_current_member_in_good_standing(creds, db_session)
    assert exc.value.status_code == expected


async def _reset_by_admin(client, db_session, monkeypatch, *, email_ok: bool):
    member = await _member(db_session)
    member.member_id = "UK-0001"
    db_session.add(AdminUser(
        email="root-reset@example.com", password_hash=hash_password("adminpass123"),
        name="Root", role="super_admin",
    ))
    await db_session.commit()

    async def fake_send(*args, **kwargs):
        return email_ok

    monkeypatch.setattr("app.api.routes.admin.send_email", fake_send)
    login = await client.post(
        "/api/admin/login", json={"email": "root-reset@example.com", "password": "adminpass123"}
    )
    old = create_access_token(str(member.id), "member")
    response = await client.post(
        f"/api/admin/members/{member.id}/reset-password",
        headers=_bearer(login.json()["access_token"]),
    )
    return member, old, response


async def test_admin_reset_uses_random_password_and_revokes_sessions(
    client: AsyncClient, db_session: AsyncSession, monkeypatch
) -> None:
    member, old, response = await _reset_by_admin(client, db_session, monkeypatch, email_ok=True)

    assert response.status_code == 200
    # Emailed: the password is not echoed back to the admin.
    assert response.json()["temporary_password"] is None
    assert (await client.get(MEMBER_ME, headers=_bearer(old))).status_code == 401
    shared = await client.post("/api/login", json={"identifier": "tv-0001", "password": "UKAMKS123"})
    assert shared.status_code == 401


async def test_admin_reset_returns_password_only_when_email_fails(
    client: AsyncClient, db_session: AsyncSession, monkeypatch
) -> None:
    _, _, response = await _reset_by_admin(client, db_session, monkeypatch, email_ok=False)

    temp = response.json()["temporary_password"]
    assert temp and temp != "UKAMKS123"
    login = await client.post("/api/login", json={"identifier": "tv-0001", "password": temp})
    assert login.status_code == 200
