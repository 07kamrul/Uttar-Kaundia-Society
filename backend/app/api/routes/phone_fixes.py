"""Admin worklist of stored phone numbers the E.164 migration could not convert.

`GET /api/admin/phone-fixes` lists the unresolved items with the owning member;
`PUT /api/admin/phone-fixes/{id}` validates a corrected number, writes it (E.164)
into the offending column - the original stays in the matching `*_raw` column -
and marks the item resolved.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_db
from app.models.admin import AdminUser
from app.models.member import Member, MemberStatus
from app.models.membership_appeal import MembershipApplication
from app.models.nominee import Nominee
from app.models.phone_fix import PhoneFixQueue
from app.models.property import CoOwner, Property
from app.services.audit import record_audit
from app.services.normalization import normalize_mobile

router = APIRouter(prefix="/admin", tags=["admin"])

# entity_type -> model holding the number. Columns come from the queue row's
# `field`, which is only ever honoured when listed in _FIELDS (never trusted
# as an arbitrary attribute name).
_MODELS = {
    "member": Member,
    "nominee": Nominee,
    "co_owner": CoOwner,
    "membership_application": MembershipApplication,
}
_FIELDS = {
    "member": {"mobile": "mobile_raw", "urgent_contact_mobile": "urgent_contact_mobile_raw"},
    "nominee": {"mobile": "mobile_raw"},
    "co_owner": {"owner_phone": "owner_phone_raw"},
    "membership_application": {"mobile": "mobile_raw"},
}


class PhoneFixOut(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    field: str
    raw_value: str
    created_at: datetime
    member_pk: int | None = None
    member_code: str | None = None
    member_name: str | None = None
    resolved_at: datetime | None = None
    mobile: str | None = None


class PhoneFixResolve(BaseModel):
    mobile: str

    @field_validator("mobile")
    @classmethod
    def _valid_mobile(cls, value: str) -> str:
        return normalize_mobile(value)  # raises ValueError("PHONE_INVALID")


async def _owners_by_item(
    db: AsyncSession, items: list[PhoneFixQueue]
) -> dict[int, tuple[int | None, str | None, str | None]]:
    """item id -> (member pk, member code, display name) in a few batched queries."""
    ids_by_type: dict[str, set[int]] = {}
    for item in items:
        ids_by_type.setdefault(item.entity_type, set()).add(item.entity_id)

    member_of: dict[tuple[str, int], int | None] = {}
    applicant_name: dict[int, str] = {}
    if ids := ids_by_type.get("member"):
        member_of.update({("member", i): i for i in ids})
    if ids := ids_by_type.get("nominee"):
        rows = await db.execute(select(Nominee.id, Nominee.member_id).where(Nominee.id.in_(ids)))
        member_of.update({("nominee", r.id): r.member_id for r in rows})
    if ids := ids_by_type.get("co_owner"):
        rows = await db.execute(
            select(CoOwner.id, Property.member_id)
            .join(Property, Property.id == CoOwner.property_id)
            .where(CoOwner.id.in_(ids))
        )
        member_of.update({("co_owner", r.id): r.member_id for r in rows})
    if ids := ids_by_type.get("membership_application"):
        rows = await db.execute(
            select(
                MembershipApplication.id,
                MembershipApplication.member_id,
                MembershipApplication.full_name,
            ).where(MembershipApplication.id.in_(ids))
        )
        for r in rows:
            member_of[("membership_application", r.id)] = r.member_id
            applicant_name[r.id] = r.full_name

    member_pks = {pk for pk in member_of.values() if pk is not None}
    members: dict[int, tuple[str | None, str]] = {}
    if member_pks:
        rows = await db.execute(
            select(Member.id, Member.member_id, Member.full_name).where(Member.id.in_(member_pks))
        )
        members = {r.id: (r.member_id, r.full_name) for r in rows}

    result: dict[int, tuple[int | None, str | None, str | None]] = {}
    for item in items:
        pk = member_of.get((item.entity_type, item.entity_id))
        code, name = members.get(pk, (None, None)) if pk is not None else (None, None)
        if name is None and item.entity_type == "membership_application":
            name = applicant_name.get(item.entity_id)
        result[item.id] = (pk, code, name)
    return result


def _to_out(
    item: PhoneFixQueue,
    owner: tuple[int | None, str | None, str | None],
    mobile: str | None = None,
) -> PhoneFixOut:
    pk, code, name = owner
    return PhoneFixOut(
        id=item.id,
        entity_type=item.entity_type,
        entity_id=item.entity_id,
        field=item.field,
        raw_value=item.raw_value,
        created_at=item.created_at,
        member_pk=pk,
        member_code=code,
        member_name=name,
        resolved_at=item.resolved_at,
        mobile=mobile,
    )


@router.get("/phone-fixes", response_model=list[PhoneFixOut])
async def list_phone_fixes(
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("member.manage")),
) -> list[PhoneFixOut]:
    result = await db.execute(
        select(PhoneFixQueue)
        .where(PhoneFixQueue.resolved_at.is_(None))
        .order_by(PhoneFixQueue.created_at, PhoneFixQueue.id)
    )
    items = list(result.scalars().all())
    owners = await _owners_by_item(db, items)
    return [_to_out(item, owners[item.id]) for item in items]


def _http_error(code: int, key: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=code, detail={"success": False, "code": key, "message": message}
    )


async def _member_mobile_taken(db: AsyncSession, member: Member, e164: str) -> bool:
    """Would `e164` clash with another non-rejected member (unique index scope)?"""
    result = await db.execute(
        select(Member.id).where(
            Member.id != member.id,
            Member.status != MemberStatus.REJECTED,
            Member.mobile == e164,
        )
    )
    return result.first() is not None


@router.put("/phone-fixes/{fix_id}", response_model=PhoneFixOut)
async def resolve_phone_fix(
    fix_id: int,
    payload: PhoneFixResolve,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("member.manage")),
) -> PhoneFixOut:
    item = await db.get(PhoneFixQueue, fix_id)
    if item is None:
        raise _http_error(status.HTTP_404_NOT_FOUND, "PHONE_FIX_NOT_FOUND", "Phone fix not found")
    if item.resolved_at is not None:
        raise _http_error(
            status.HTTP_409_CONFLICT, "PHONE_FIX_ALREADY_RESOLVED", "Phone fix already resolved"
        )
    model = _MODELS.get(item.entity_type)
    raw_attr = _FIELDS.get(item.entity_type, {}).get(item.field)
    target = await db.get(model, item.entity_id) if model is not None else None
    if target is None or raw_attr is None:
        raise _http_error(
            status.HTTP_404_NOT_FOUND, "PHONE_FIX_TARGET_NOT_FOUND", "The record no longer exists"
        )

    if (
        item.entity_type == "member"
        and item.field == "mobile"
        and await _member_mobile_taken(db, target, payload.mobile)
    ):
        raise _http_error(
            status.HTTP_409_CONFLICT,
            "PHONE_DUPLICATE",
            "Another member already uses this number",
        )

    if getattr(target, raw_attr) is None:
        setattr(target, raw_attr, getattr(target, item.field) or item.raw_value)
    setattr(target, item.field, payload.mobile)
    item.resolved_at = datetime.now(timezone.utc)
    item.resolved_by_admin_id = admin.id
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="phone_fix.resolve",
        entity_type=item.entity_type,
        entity_id=str(item.entity_id),
        detail=f"{item.field}: {item.raw_value!r} -> {payload.mobile}",
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise _http_error(
            status.HTTP_409_CONFLICT, "PHONE_DUPLICATE", "Another member already uses this number"
        ) from exc
    await db.refresh(item)
    owners = await _owners_by_item(db, [item])
    return _to_out(item, owners[item.id], mobile=payload.mobile)
