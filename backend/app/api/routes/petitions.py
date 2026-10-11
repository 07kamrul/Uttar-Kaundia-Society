"""Module 3 — বিশেষ সভার পিটিশন (special-session petitions).

Eligible members force a special session: >= ceil(20% of eligible members)
must sign. The committee must respond within 30 days (working-day anchored);
SLA badges are computed live from governance.sla_status. Every write is
audited; members see their own petitions' progress, admins see all.
"""

import math
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_member
from app.core.permissions import require_permission
from app.db.session import get_db
from app.models.admin import AdminUser
from app.models.member import (
    GOVERNANCE_STATUS_SUSPENDED,
    MEMBER_CLASS_FOUNDER,
    MEMBER_CLASS_GENERAL,
    Member,
    MemberStatus,
)
from app.models.resolution_book import (
    PETITION_STATUS_REJECTED,
    PETITION_STATUS_RESPONDED,
    PETITION_STATUS_SCHEDULED,
    PETITION_STATUS_SUBMITTED,
    PETITION_STATUS_UNDER_REVIEW,
    PETITION_STATUSES,
    SpecialSessionPetition,
    required_signature_count,
)
from app.services.audit import record_audit
from app.services.governance import PETITION_RESPONSE_DAYS, add_working_days, sla_status

router = APIRouter(tags=["petitions"])

PETITION_NO_RETRIES = 3
LIST_DEFAULT_LIMIT = 100
LIST_MAX_LIMIT = 500


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> date:
    return _now().date()


class PetitionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    justification: str = Field(min_length=1, max_length=5000)


class PetitionRespond(BaseModel):
    committee_response: str = Field(min_length=1, max_length=5000)
    meeting_id: int | None = None
    scheduled: bool = False


class PetitionReject(BaseModel):
    reason: str = Field(min_length=1, max_length=5000)


def petition_to_dict(petition: SpecialSessionPetition, signer_names: dict[int, str] | None = None) -> dict:
    signer_names = signer_names or {}
    sla = None
    if pet := petition.response_due:
        sla = sla_status(
            due=pet,
            acknowledged=petition.responded_at,
            now=_now(),
        )
    return {
        "id": petition.id,
        "petition_no": petition.petition_no,
        "title": petition.title,
        "justification": petition.justification,
        "submitted_by_member_id": petition.submitted_by_member_id,
        "signature_count": petition.signature_count,
        "required_count": petition.required_count,
        "signers": [
            {"member_id": s["member_id"], "signed_at": s["signed_at"], "name": signer_names.get(s["member_id"])}
            for s in petition.signatures or []
        ],
        "status": petition.status,
        "response_due": petition.response_due,
        "sla": sla,
        "committee_response": petition.committee_response,
        "responded_at": petition.responded_at,
        "meeting_id": petition.meeting_id,
        "created_at": petition.created_at,
    }


async def _signer_names_for(db: AsyncSession, petitions) -> dict[int, str]:
    """One query for the signer names of every given petition (avoids N+1)."""
    ids = {s["member_id"] for p in petitions for s in (p.signatures or [])}
    if not ids:
        return {}
    rows = await db.execute(select(Member.id, Member.full_name).where(Member.id.in_(ids)))
    return dict(rows.all())


async def _signer_names(db: AsyncSession, petition: SpecialSessionPetition) -> dict[int, str]:
    return await _signer_names_for(db, [petition])


async def _load_petition(
    db: AsyncSession, petition_id: int, *, for_update: bool = False
) -> SpecialSessionPetition:
    stmt = select(SpecialSessionPetition).where(SpecialSessionPetition.id == petition_id)
    if for_update:
        # Signatures are a read-modify-write JSON list: lock the row so two
        # concurrent signers cannot both append to the same stale copy.
        stmt = stmt.with_for_update()
    petition = (await db.execute(stmt)).scalar_one_or_none()
    if petition is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Petition not found.")
    return petition


async def _next_petition_no(db: AsyncSession) -> str:
    """Max existing numeric suffix for this year + 1 (count+1 collides after deletions)."""
    year = _today().year
    prefix = f"PET-{year}-"
    numbers = (
        await db.execute(
            select(SpecialSessionPetition.petition_no).where(
                SpecialSessionPetition.petition_no.like(f"{prefix}%")
            )
        )
    ).scalars()
    highest = max(
        (int(n[len(prefix):]) for n in numbers if n[len(prefix):].isdigit()), default=0
    )
    return f"{prefix}{highest + 1:03d}"


@router.post("/petitions", status_code=status.HTTP_201_CREATED)
async def create_petition(
    payload: PetitionCreate,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> dict:
    from app.services.governance import is_election_eligible

    if not is_election_eligible(member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="শুধু যোগ্য সদস্য পিটিশন করতে পারেন। Only eligible members may file a petition.",
        )
    eligible_total = (
        await db.execute(
            select(func.count())
            .select_from(Member)
            .where(
                Member.status == MemberStatus.APPROVED,
                Member.governance_status != GOVERNANCE_STATUS_SUSPENDED,
                Member.member_class.in_((MEMBER_CLASS_FOUNDER, MEMBER_CLASS_GENERAL)),
            )
        )
    ).scalar_one()
    required = required_signature_count(eligible_total)
    member_id = member.id
    # Two concurrent filers can compute the same number; the unique constraint
    # rejects the loser, which simply retries with a fresh number.
    for attempt in range(PETITION_NO_RETRIES):
        try:
            petition = await _insert_petition(db, payload, member_id, required)
            break
        except IntegrityError:
            await db.rollback()
            if attempt == PETITION_NO_RETRIES - 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Could not allocate a petition number; please retry.",
                ) from None
    await db.refresh(petition)
    return petition_to_dict(petition, await _signer_names(db, petition))


async def _insert_petition(
    db: AsyncSession, payload: PetitionCreate, member_id: int, required: int
) -> SpecialSessionPetition:
    now_iso = _now().isoformat()
    petition = SpecialSessionPetition(
        petition_no=await _next_petition_no(db),
        title=payload.title.strip(),
        justification=payload.justification.strip(),
        submitted_by_member_id=member_id,
        signatures=[{"member_id": member_id, "signed_at": now_iso}],
        signature_count=1,
        required_count=required,
        status=PETITION_STATUS_SUBMITTED,
        # 30-day response SLA anchored on submission (working-day arithmetic).
        response_due=add_working_days(_today(), PETITION_RESPONSE_DAYS),
    )
    db.add(petition)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=None,
        action="petition.created",
        entity_type="special_session_petition",
        entity_id=str(petition.id),
        detail=f"{petition.petition_no}: {petition.title} (needs {required} signatures)",
    )
    await db.commit()
    return petition


@router.post("/petitions/{petition_id}/sign")
async def sign_petition(
    petition_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> dict:
    from app.services.governance import is_election_eligible

    petition = await _load_petition(db, petition_id, for_update=True)
    if petition.status not in (PETITION_STATUS_SUBMITTED, PETITION_STATUS_UNDER_REVIEW):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"এই পিটিশনে স্বাক্ষর বন্ধ ({petition.status})।",
        )
    if not is_election_eligible(member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="শুধু যোগ্য সদস্য স্বাক্ষর করতে পারেন। Only eligible members may sign.",
        )
    if any(s["member_id"] == member.id for s in (petition.signatures or [])):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="আপনি ইতিমধ্যে স্বাক্ষর করেছেন। You have already signed.",
        )
    petition.signatures = list(petition.signatures or []) + [
        {"member_id": member.id, "signed_at": _now().isoformat()}
    ]
    petition.signature_count = len(petition.signatures)
    record_audit(
        db,
        actor_admin_id=None,
        action="petition.signed",
        entity_type="special_session_petition",
        entity_id=str(petition.id),
        detail=f"{petition.petition_no}: member {member.id} signed "
        f"({petition.signature_count}/{petition.required_count})",
    )
    await db.commit()
    await db.refresh(petition)
    return petition_to_dict(petition, await _signer_names(db, petition))


@router.get("/petitions/mine")
async def my_petitions(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> dict:
    petitions = (
        (
            await db.execute(
                select(SpecialSessionPetition)
                .where(SpecialSessionPetition.submitted_by_member_id == member.id)
                .order_by(SpecialSessionPetition.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    names = await _signer_names_for(db, petitions)
    return {"items": [petition_to_dict(p, names) for p in petitions], "today": _today()}


@router.get("/petitions/{petition_id}")
async def petition_progress(
    petition_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> dict:
    petition = await _load_petition(db, petition_id)
    if petition.submitted_by_member_id != member.id:
        signer_ids = {s["member_id"] for s in (petition.signatures or [])}
        if member.id not in signer_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="শুধু দাখিলকারী/স্বাক্ষরকারী অগ্রগতি দেখতে পারেন।",
            )
    return petition_to_dict(petition, await _signer_names(db, petition))


@router.get("/petitions")
async def list_petitions(
    petition_status: str | None = None,
    limit: int = Query(LIST_DEFAULT_LIMIT, ge=1, le=LIST_MAX_LIMIT),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("petition.manage")),
) -> dict:
    query = select(SpecialSessionPetition).order_by(
        SpecialSessionPetition.created_at.desc(), SpecialSessionPetition.id.desc()
    )
    if petition_status:
        query = query.where(SpecialSessionPetition.status == petition_status)
    petitions = (await db.execute(query.limit(limit).offset(offset))).scalars().all()
    names = await _signer_names_for(db, petitions)
    return {"items": [petition_to_dict(p, names) for p in petitions], "today": _today()}


@router.post("/petitions/{petition_id}/respond")
async def respond_petition(
    petition_id: int,
    payload: PetitionRespond,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("petition.manage")),
) -> dict:
    petition = await _load_petition(db, petition_id)
    if petition.status in (PETITION_STATUS_RESPONDED, PETITION_STATUS_REJECTED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"ইতিমধ্যে চূড়ান্ত হয়েছে ({petition.status})।",
        )
    petition.status = PETITION_STATUS_SCHEDULED if payload.scheduled else PETITION_STATUS_RESPONDED
    petition.committee_response = payload.committee_response.strip()
    petition.responded_at = _now()
    petition.meeting_id = payload.meeting_id
    petition.created_by_admin = admin.id
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="petition.responded",
        entity_type="special_session_petition",
        entity_id=str(petition.id),
        detail=f"{petition.petition_no}: status {petition.status}"
        + (f", linked meeting {payload.meeting_id}" if payload.meeting_id else ""),
    )
    await db.commit()
    await db.refresh(petition)
    return petition_to_dict(petition, await _signer_names(db, petition))


@router.post("/petitions/{petition_id}/reject")
async def reject_petition(
    petition_id: int,
    payload: PetitionReject,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("petition.manage")),
) -> dict:
    petition = await _load_petition(db, petition_id)
    if petition.status not in (PETITION_STATUS_SUBMITTED, PETITION_STATUS_UNDER_REVIEW):
        # An answered/scheduled petition must not have its response overwritten.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Petition is already {petition.status}; it can no longer be rejected.",
        )
    petition.status = PETITION_STATUS_REJECTED
    petition.committee_response = payload.reason.strip()
    petition.responded_at = _now()
    petition.created_by_admin = admin.id
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="petition.rejected",
        entity_type="special_session_petition",
        entity_id=str(petition.id),
        detail=f"{petition.petition_no}: {_short(payload.reason)}",
    )
    await db.commit()
    await db.refresh(petition)
    return petition_to_dict(petition, await _signer_names(db, petition))


def _short(text: str, limit: int = 80) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"
