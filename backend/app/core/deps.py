from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import ADMIN_ROLES, decode_token, normalize_token_role, token_version_matches
from app.db.session import get_db
from app.models.admin import AdminUser
from app.models.credential import MemberCredential
from app.models.member import GOVERNANCE_STATUS_SUSPENDED, Member, MemberStatus
from app.models.property import Property

bearer_scheme = HTTPBearer(auto_error=False)


async def _get_token_payload(
    credentials: HTTPAuthorizationCredentials | None,
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return payload


def _subject_id(payload: dict) -> int:
    """Parse the token subject defensively - a well-signed token carrying a
    non-numeric sub must be treated as unauthenticated, not crash as a 500."""
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


_REVOKED = "Session has been revoked. Please sign in again."


def _ensure_admin_version(payload: dict, admin: AdminUser) -> None:
    if not token_version_matches(payload, admin.token_version):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_REVOKED)


async def _member_token_is_current(db: AsyncSession, payload: dict, member_id: int) -> bool:
    """A member's revocation counter lives on their credential. Members without
    a credential (never issued a login) can only hold the implicit version 0."""
    version = (
        await db.execute(
            select(MemberCredential.token_version).where(MemberCredential.member_id == member_id)
        )
    ).scalar_one_or_none()
    return token_version_matches(payload, version or 0)


async def _ensure_member_version(db: AsyncSession, payload: dict, member_id: int) -> None:
    if not await _member_token_is_current(db, payload, member_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_REVOKED)


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> AdminUser:
    payload = await _get_token_payload(credentials)
    if normalize_token_role(payload.get("role")) not in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    result = await db.execute(select(AdminUser).where(AdminUser.id == _subject_id(payload)))
    admin = result.scalar_one_or_none()
    if admin is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin not found")
    _ensure_admin_version(payload, admin)
    return admin


async def _resolve_member(
    credentials: HTTPAuthorizationCredentials | None,
    db: AsyncSession,
    *,
    eager: bool,
) -> Member:
    payload = await _get_token_payload(credentials)
    if normalize_token_role(payload.get("role")) != "member":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Member access required")

    query = select(Member).where(Member.id == _subject_id(payload))
    if eager:
        # One round-trip set instead of the auth lookup + a second full-row
        # re-select of the same member (the profile route used to do both).
        query = query.options(
            selectinload(Member.properties).selectinload(Property.co_owners),
            selectinload(Member.properties).selectinload(Property.applicable_docs),
            selectinload(Member.nominees),
        )
    result = await db.execute(query)
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Member not found")
    await _ensure_member_version(db, payload, member.id)
    return member


async def get_current_member(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> Member:
    return await _resolve_member(credentials, db, eager=False)


async def get_current_member_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> Member | None:
    """Authenticated member, or None for anonymous callers — used by endpoints
    that are optionally public behind a config flag (e.g. the plot map)."""
    if credentials is None:
        return None
    payload = decode_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        return None
    if normalize_token_role(payload.get("role")) != "member":
        return None
    try:
        subject = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        return None
    result = await db.execute(select(Member).where(Member.id == subject))
    member = result.scalar_one_or_none()
    if member is None or not await _member_token_is_current(db, payload, member.id):
        return None
    return member


async def get_current_member_detail(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> Member:
    """Authenticates and returns the member with properties/nominees loaded,
    for endpoints whose response is the full detail graph."""
    return await _resolve_member(credentials, db, eager=True)


async def get_current_member_in_good_standing(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> Member:
    """Opt-in stricter gate: approved and not governance-suspended.

    Deliberately NOT applied by get_current_member: profile self-edits requeue
    approved members to PENDING, rejected members must still see their
    rejection reason, and suspended members need their session to respond to
    notices and file appeals. Use this only on privileges (e.g. voting,
    petitions) that a suspended or unapproved member must not exercise."""
    member = await _resolve_member(credentials, db, eager=False)
    if member.status != MemberStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Membership is not approved")
    if member.governance_status == GOVERNANCE_STATUS_SUSPENDED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Membership is suspended")
    return member


@dataclass(frozen=True)
class AccountActor:
    """The authenticated account whichever side it lives on: a Member for
    role=member tokens, or an AdminUser for the admin-tier roles. Used by
    endpoints that members and admins both call (e.g. picnic payments)."""

    role: str
    member: Member | None
    admin: AdminUser | None


UNLINKED_MEMBER_MESSAGE = (
    "Your account is not linked to a member profile. Contact the committee."
)


async def get_account_actor(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> AccountActor:
    payload = await _get_token_payload(credentials)
    role = normalize_token_role(payload.get("role"))

    if role == "member":
        result = await db.execute(select(Member).where(Member.id == _subject_id(payload)))
        member = result.scalar_one_or_none()
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=UNLINKED_MEMBER_MESSAGE,
            )
        await _ensure_member_version(db, payload, member.id)
        return AccountActor(role=role, member=member, admin=None)

    if role in ADMIN_ROLES:
        result = await db.execute(select(AdminUser).where(AdminUser.id == _subject_id(payload)))
        admin = result.scalar_one_or_none()
        if admin is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin not found")
        _ensure_admin_version(payload, admin)
        return AccountActor(role=role, member=None, admin=admin)

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access not allowed for this account type")
