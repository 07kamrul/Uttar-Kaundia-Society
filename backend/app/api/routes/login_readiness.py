"""`GET /api/admin/login-readiness`: read-only go/no-go report before turning on
the `login_by_phone` flag (duplicate numbers/emails, unparseable mobiles, open
phone fixes). Issues only SELECTs."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.feature_flags import is_enabled
from app.core.permissions import require_permission
from app.db.session import get_db
from app.models.admin import AdminUser
from app.models.phone_fix import PhoneFixQueue
from app.services.login_identity import DuplicateGroup, GroupMember, duplicate_groups

router = APIRouter(prefix="/admin", tags=["admin"])


class GroupMemberOut(BaseModel):
    id: int
    member_id: str | None
    full_name: str
    status: str
    has_login: bool


class MobileGroupOut(BaseModel):
    mobile: str
    members: list[GroupMemberOut]
    # True when two or more of the members have a login: only then can login break.
    blocking: bool


class EmailGroupOut(BaseModel):
    email: str
    members: list[GroupMemberOut]
    blocking: bool


class UnparseableMobileOut(BaseModel):
    id: int
    member_id: str | None
    raw: str


class LoginReadinessOut(BaseModel):
    login_by_phone_enabled: bool
    members_with_login: int
    duplicate_mobile_groups: list[MobileGroupOut]
    duplicate_group_count: int
    blocking_group_count: int
    unparseable_mobiles: list[UnparseableMobileOut]
    open_phone_fixes: int
    duplicate_email_groups: list[EmailGroupOut]


def _members(group: DuplicateGroup) -> list[GroupMemberOut]:
    return [_member_out(m) for m in group.members]


def _member_out(member: GroupMember) -> GroupMemberOut:
    return GroupMemberOut(
        id=member.id,
        member_id=member.member_id,
        full_name=member.full_name,
        status=member.status,
        has_login=member.has_login,
    )


@router.get("/login-readiness", response_model=LoginReadinessOut)
async def login_readiness(
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("manage_system_config")),
) -> LoginReadinessOut:
    report = await duplicate_groups(db)
    open_fixes = (
        await db.execute(
            select(func.count(PhoneFixQueue.id)).where(PhoneFixQueue.resolved_at.is_(None))
        )
    ).scalar_one()
    return LoginReadinessOut(
        login_by_phone_enabled=await is_enabled(db, "login_by_phone"),
        members_with_login=report.members_with_login,
        duplicate_mobile_groups=[
            MobileGroupOut(mobile=g.key, members=_members(g), blocking=g.blocking)
            for g in report.mobile_groups
        ],
        duplicate_group_count=len(report.mobile_groups),
        blocking_group_count=len(report.blocking_mobile_groups),
        unparseable_mobiles=[
            UnparseableMobileOut(id=u.id, member_id=u.member_id, raw=u.raw)
            for u in report.unparseable_mobiles
        ],
        open_phone_fixes=int(open_fixes),
        duplicate_email_groups=[
            EmailGroupOut(email=g.key, members=_members(g), blocking=g.blocking)
            for g in report.email_groups
        ],
    )
