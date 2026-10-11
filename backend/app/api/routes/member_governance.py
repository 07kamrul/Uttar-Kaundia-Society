"""Member-governance foundation endpoints: member class assignment and the
suspension record.

Suspension here is a governance *record* only - it never gates authentication
or the member's land-info access (get_current_member does not consult it).
"""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_admin
from app.core.permissions import can, require_permission
from app.db.session import get_db
from app.models.admin import AdminUser
from app.models.member import (
    GOVERNANCE_STATUSES,
    GOVERNANCE_STATUS_ACTIVE,
    GOVERNANCE_STATUS_SUSPENDED,
    MEMBER_CLASSES,
    Member,
)
from app.services.audit import record_audit

router = APIRouter(prefix="/admin/member-governance", tags=["member-governance"])


def _get_actor_or_admin_by_either_permission(*keys: str):
    """Dependency factory: pass when the admin holds ANY of `keys`."""

    async def _dependency(
        admin: AdminUser = Depends(get_current_admin),
        db: AsyncSession = Depends(get_db),
    ) -> AdminUser:
        for key in keys:
            if await can(db, admin, key):
                return admin
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing required permission (any of): {', '.join(keys)}",
        )

    return _dependency


class MemberGovernanceOut(BaseModel):
    member_id: int
    member_class: str | None = None
    governance_status: str
    suspension_reason: str | None = None
    suspension_notice_at: datetime | None = None


class MemberGovernanceUpdate(BaseModel):
    member_class: str | None = None
    governance_status: str | None = None
    suspension_reason: str | None = None

    @field_validator("member_class")
    @classmethod
    def _valid_class(cls, value: str | None) -> str | None:
        if value is not None and value not in MEMBER_CLASSES:
            raise ValueError(f"member_class must be one of: {', '.join(MEMBER_CLASSES)}")
        return value

    @field_validator("governance_status")
    @classmethod
    def _valid_status(cls, value: str | None) -> str | None:
        if value is not None and value not in GOVERNANCE_STATUSES:
            raise ValueError(f"governance_status must be one of: {', '.join(GOVERNANCE_STATUSES)}")
        return value


async def _get_member_or_404(db: AsyncSession, member_id: int) -> Member:
    result = await db.execute(select(Member).where(Member.id == member_id))
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    return member


def _to_out(member: Member) -> MemberGovernanceOut:
    return MemberGovernanceOut(
        member_id=member.id,
        member_class=member.member_class,
        governance_status=member.governance_status,
        suspension_reason=member.suspension_reason,
        suspension_notice_at=member.suspension_notice_at,
    )


@router.get("/{member_id}", response_model=MemberGovernanceOut)
async def get_member_governance(
    member_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("member.view_all")),
) -> MemberGovernanceOut:
    return _to_out(await _get_member_or_404(db, member_id))


@router.put("/{member_id}", response_model=MemberGovernanceOut)
async def update_member_governance(
    member_id: int,
    payload: MemberGovernanceUpdate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(
        _get_actor_or_admin_by_either_permission("member_class.assign", "member_suspension.manage")
    ),
) -> MemberGovernanceOut:
    if payload.member_class is None and payload.governance_status is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nothing to update: provide member_class and/or governance_status",
        )

    member = await _get_member_or_404(db, member_id)

    if payload.member_class is not None:
        member.member_class = payload.member_class
    if payload.governance_status is not None:
        member.governance_status = payload.governance_status
        if payload.governance_status == GOVERNANCE_STATUS_SUSPENDED:
            member.suspension_reason = payload.suspension_reason
            member.suspension_notice_at = datetime.now(timezone.utc)
        else:
            # Reinstatement clears the suspension record.
            member.suspension_reason = None
            member.suspension_notice_at = None
    elif payload.suspension_reason is not None and member.governance_status == GOVERNANCE_STATUS_SUSPENDED:
        member.suspension_reason = payload.suspension_reason

    record_audit(
        db,
        actor_admin_id=admin.id,
        action="member_governance.update",
        entity_type="member",
        entity_id=str(member.id),
        detail=json.dumps(
            {
                "member_class": member.member_class,
                "governance_status": member.governance_status,
                "suspension_reason": member.suspension_reason,
            },
            ensure_ascii=False,
        ),
    )
    await db.commit()
    await db.refresh(member)
    return _to_out(member)
