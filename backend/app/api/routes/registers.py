"""Module 7 — রেজিস্টার (registers): society assets and welfare activities.

- SocietyAsset: the asset register (auto "KRMF-AS-###" codes) with a
  letterhead register PDF; delete is a soft deactivation because physical
  assets are never silently forgotten.
- WelfareActivity: the committee's activity record with a member-visible
  read-only list.
"""

from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_member
from app.core.permissions import require_permission
from app.db.session import get_db
from app.models.member import Member
from app.models.registers import SocietyAsset, WelfareActivity
from app.services.audit import record_audit
from app.services.governance import (
    ASSET_CONDITION_KEYS,
    WELFARE_ACTIVITY_TYPE_KEYS,
)
from app.services.letters_pdf import render_letter

router = APIRouter(tags=["registers"])

ASSET_CODE_PREFIX = "KRMF-AS"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class AssetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    category: str = Field(min_length=1, max_length=64)
    acquisition_date: date
    value: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    condition: str = Field(default="good")
    location: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=5000)


class AssetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    category: str | None = Field(default=None, min_length=1, max_length=64)
    acquisition_date: date | None = None
    value: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    condition: str | None = None
    location: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=5000)
    is_active: bool | None = None


class AssetOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    asset_code: str
    name: str
    description: str | None = None
    category: str
    acquisition_date: date
    value: Decimal
    condition: str
    location: str | None = None
    notes: str | None = None
    is_active: bool
    created_at: datetime

    @field_validator("value", mode="before")
    @classmethod
    def _stringify_money(cls, value):
        return None if value is None else f"{Decimal(str(value)):.2f}"


class AssetDeleteIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class ActivityCreate(BaseModel):
    activity_date: date
    title: str = Field(min_length=1, max_length=255)
    activity_type: str = Field(default="welfare")
    participants_count: int = Field(default=0, ge=0)
    participant_notes: str | None = Field(default=None, max_length=5000)
    outcome: str | None = Field(default=None, max_length=10000)
    organizer: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=5000)


class ActivityUpdate(BaseModel):
    activity_date: date | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    activity_type: str | None = None
    participants_count: int | None = Field(default=None, ge=0)
    participant_notes: str | None = Field(default=None, max_length=5000)
    outcome: str | None = Field(default=None, max_length=10000)
    organizer: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=5000)


class ActivityOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    activity_date: date
    title: str
    activity_type: str
    participants_count: int
    participant_notes: str | None = None
    outcome: str | None = None
    organizer: str | None = None
    notes: str | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _check_condition(condition: str) -> str:
    if condition not in ASSET_CONDITION_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown condition '{condition}'. Allowed: {', '.join(sorted(ASSET_CONDITION_KEYS))}.",
        )
    return condition


def _check_activity_type(activity_type: str) -> str:
    if activity_type not in WELFARE_ACTIVITY_TYPE_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown activity type '{activity_type}'. "
            f"Allowed: {', '.join(sorted(WELFARE_ACTIVITY_TYPE_KEYS))}.",
        )
    return activity_type


async def _next_asset_code(db: AsyncSession) -> str:
    max_seq = (
        await db.execute(
            select(func.max(SocietyAsset.id))
        )
    ).scalar_one() or 0
    return f"{ASSET_CODE_PREFIX}-{max_seq + 1:03d}"


async def _load_asset(db: AsyncSession, asset_id: int) -> SocietyAsset:
    row = (
        await db.execute(select(SocietyAsset).where(SocietyAsset.id == asset_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return row


async def _load_activity(db: AsyncSession, activity_id: int) -> WelfareActivity:
    row = (
        await db.execute(select(WelfareActivity).where(WelfareActivity.id == activity_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    return row


def _condition_bn(condition: str) -> str:
    return {
        "good": "ভালো",
        "fair": "মোটামুটি",
        "poor": "নষ্টপ্রায়",
        "lost": "হারানো",
    }.get(condition, condition)


def _type_bn(activity_type: str) -> str:
    return {"training": "প্রশিক্ষণ", "welfare": "কল্যাণমূলক", "other": "অন্যান্য"}.get(
        activity_type, activity_type
    )


# ---------------------------------------------------------------------------
# Society assets: /api/admin/assets (asset_register.manage)
# ---------------------------------------------------------------------------

_asset_manage = require_permission("asset_register.manage")


@router.get("/admin/assets", response_model=list[AssetOut])
async def list_assets(
    include_inactive: bool = False,
    search: str | None = Query(default=None, max_length=255),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(_asset_manage),
) -> list[AssetOut]:
    query = select(SocietyAsset).order_by(SocietyAsset.asset_code)
    if not include_inactive:
        query = query.where(SocietyAsset.is_active == True)  # noqa: E712
    if search:
        like = f"%{search}%"
        query = query.where(
            SocietyAsset.name.ilike(like)
            | SocietyAsset.category.ilike(like)
            | SocietyAsset.asset_code.ilike(like)
        )
    rows = await db.execute(query)
    return [AssetOut.model_validate(row) for row in rows.scalars()]


@router.post("/admin/assets", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
async def create_asset(
    payload: AssetCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(_asset_manage),
) -> AssetOut:
    row = SocietyAsset(
        asset_code=await _next_asset_code(db),
        name=payload.name.strip(),
        description=payload.description,
        category=payload.category.strip(),
        acquisition_date=payload.acquisition_date,
        value=payload.value,
        condition=_check_condition(payload.condition),
        location=payload.location,
        notes=payload.notes,
        created_by=admin.id,
    )
    db.add(row)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="asset_register.create",
        entity_type="society_asset",
        entity_id=str(row.id),
        detail=f"{row.asset_code} {row.name} ({_money(row.value)})",
    )
    await db.commit()
    await db.refresh(row)
    return AssetOut.model_validate(row)


def _money(value: Decimal) -> str:
    return f"{Decimal(str(value)):.2f}"


@router.patch("/admin/assets/{asset_id}", response_model=AssetOut)
async def update_asset(
    asset_id: int,
    payload: AssetUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(_asset_manage),
) -> AssetOut:
    row = await _load_asset(db, asset_id)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    if "condition" in changes and changes["condition"] is not None:
        changes["condition"] = _check_condition(changes["condition"])
    before = {field: getattr(row, field) for field in changes}
    for field, value in changes.items():
        setattr(row, field, value)
    diff = "; ".join(f"{field}: {before[field]} → {getattr(row, field)}" for field in sorted(changes))
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="asset_register.update",
        entity_type="society_asset",
        entity_id=str(row.id),
        detail=diff,
    )
    await db.commit()
    await db.refresh(row)
    return AssetOut.model_validate(row)


@router.delete("/admin/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_asset(
    asset_id: int,
    payload: AssetDeleteIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(_asset_manage),
) -> None:
    """Soft deactivation (the asset leaves the active register; history is
    kept for the audit pack)."""
    row = await _load_asset(db, asset_id)
    row.is_active = False
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="asset_register.deactivate",
        entity_type="society_asset",
        entity_id=str(row.id),
        detail=f"{row.asset_code}: {payload.reason}",
    )
    await db.commit()


@router.get("/admin/assets/register.pdf")
async def asset_register_pdf(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(_asset_manage),
) -> Response:
    rows = (
        (
            await db.execute(
                select(SocietyAsset)
                .order_by(SocietyAsset.is_active.desc(), SocietyAsset.asset_code)
            )
        )
        .scalars()
        .all()
    )
    active = [row for row in rows if row.is_active]
    paragraphs = [
        f"মোট সক্রিয় সম্পদ: {len(active)} টি; সর্বমোট মূল্য: "
        f"{_money(sum((row.value for row in active), Decimal('0')))} টাকা।"
    ]
    if not rows:
        paragraphs.append("সম্পদ রেজিস্টার এখনো খালি।")
    for row in rows:
        status_bn = "সক্রিয়" if row.is_active else "বাতিল"
        paragraphs.append(
            f"{row.asset_code} — {row.name} ({row.category}); "
            f"অর্জন: {row.acquisition_date.isoformat()}; মূল্য: {_money(row.value)} টাকা; "
            f"অবস্থা: {_condition_bn(row.condition)}; "
            f"অবস্থান: {row.location or '—'}; অবস্থা: {status_bn}।"
        )
    pdf_bytes = render_letter(
        title="সোসাইটি সম্পদ রেজিস্টার",
        ref_no=f"KRMF-AS-REG-{date.today():%Y%m%d}",
        body_sections=[("সম্পদের তালিকা", paragraphs)],
        meta_line=f"তারিখ: {date.today().isoformat()}",
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="asset-register-{date.today():%Y%m%d}.pdf"'
        },
    )


# ---------------------------------------------------------------------------
# Welfare activities: /api/admin/welfare-activities + member read
# ---------------------------------------------------------------------------

_activity_manage = require_permission("welfare_activity.manage")


@router.get("/admin/welfare-activities", response_model=list[ActivityOut])
async def list_activities(
    activity_type: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(_activity_manage),
) -> list[ActivityOut]:
    query = select(WelfareActivity).order_by(
        WelfareActivity.activity_date.desc(), WelfareActivity.id.desc()
    )
    if activity_type:
        query = query.where(WelfareActivity.activity_type == activity_type)
    if date_from is not None:
        query = query.where(WelfareActivity.activity_date >= date_from)
    if date_to is not None:
        query = query.where(WelfareActivity.activity_date <= date_to)
    rows = await db.execute(query)
    return [ActivityOut.model_validate(row) for row in rows.scalars()]


@router.post(
    "/admin/welfare-activities", response_model=ActivityOut, status_code=status.HTTP_201_CREATED
)
async def create_activity(
    payload: ActivityCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(_activity_manage),
) -> ActivityOut:
    row = WelfareActivity(
        activity_date=payload.activity_date,
        title=payload.title.strip(),
        activity_type=_check_activity_type(payload.activity_type),
        participants_count=payload.participants_count,
        participant_notes=payload.participant_notes,
        outcome=payload.outcome,
        organizer=payload.organizer,
        notes=payload.notes,
        created_by=admin.id,
    )
    db.add(row)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="welfare_activity.create",
        entity_type="welfare_activity",
        entity_id=str(row.id),
        detail=f"{row.title} ({row.activity_date}, {row.participants_count} জন)",
    )
    await db.commit()
    await db.refresh(row)
    return ActivityOut.model_validate(row)


@router.patch("/admin/welfare-activities/{activity_id}", response_model=ActivityOut)
async def update_activity(
    activity_id: int,
    payload: ActivityUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(_activity_manage),
) -> ActivityOut:
    row = await _load_activity(db, activity_id)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    if "activity_type" in changes and changes["activity_type"] is not None:
        changes["activity_type"] = _check_activity_type(changes["activity_type"])
    before = {field: getattr(row, field) for field in changes}
    for field, value in changes.items():
        setattr(row, field, value)
    diff = "; ".join(f"{field}: {before[field]} → {getattr(row, field)}" for field in sorted(changes))
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="welfare_activity.update",
        entity_type="welfare_activity",
        entity_id=str(row.id),
        detail=diff,
    )
    await db.commit()
    await db.refresh(row)
    return ActivityOut.model_validate(row)


@router.delete("/admin/welfare-activities/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: int,
    db: AsyncSession = Depends(get_db),
    admin=Depends(_activity_manage),
) -> None:
    """Activities are event records (not money): a hard delete with audit is
    the honest correction path."""
    row = await _load_activity(db, activity_id)
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="welfare_activity.delete",
        entity_type="welfare_activity",
        entity_id=str(row.id),
        detail=f"{row.title} ({row.activity_date}) deleted",
    )
    await db.delete(row)
    await db.commit()


@router.get("/admin/welfare-activities/list.pdf")
async def welfare_activities_pdf(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(_activity_manage),
) -> Response:
    rows = (
        await db.execute(
            select(WelfareActivity).order_by(WelfareActivity.activity_date.desc())
        )
    ).scalars()
    items = list(rows)
    paragraphs = [f"মোট কার্যক্রম: {len(items)} টি।"] if items else ["কোনো কার্যক্রম নিবন্ধিত হয়নি।"]
    for row in items:
        paragraphs.append(
            f"{row.activity_date.isoformat()} — {row.title} "
            f"({_type_bn(row.activity_type)}); অংশগ্রহণকারী: {row.participants_count} জন"
            + (f"; আয়োজক: {row.organizer}" if row.organizer else "")
            + (f"; ফলাফল: {row.outcome}" if row.outcome else "")
            + "।"
        )
    pdf_bytes = render_letter(
        title="কল্যাণমূলক কার্যক্রমের তালিকা",
        ref_no=f"KRMF-WA-{date.today():%Y%m%d}",
        body_sections=[("কার্যক্রমসমূহ", paragraphs)],
        meta_line=f"তারিখ: {date.today().isoformat()}",
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="welfare-activities-{date.today():%Y%m%d}.pdf"'
        },
    )


@router.get("/member/welfare-activities", response_model=list[ActivityOut])
async def member_activities(
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _member: Member = Depends(get_current_member),
) -> list[ActivityOut]:
    """Member-visible read-only list (most recent first)."""
    rows = await db.execute(
        select(WelfareActivity)
        .order_by(WelfareActivity.activity_date.desc(), WelfareActivity.id.desc())
        .limit(limit)
    )
    return [ActivityOut.model_validate(row) for row in rows.scalars()]
