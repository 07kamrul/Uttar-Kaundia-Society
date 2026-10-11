"""Module 6 — গঠনতন্ত্র সংশোধনী ট্র্যাকার (constitution amendment tracker).

Rules enforced here (and nowhere else):
- ConstitutionVersion rows are APPEND-ONLY. Adoption INSERTs version_no+1;
  there is deliberately no PUT/PATCH for full_text anywhere.
- A proposal can only be decided inside a PROPERLY-NOTICED meeting: attaching
  a meeting without notice_published_at is a 409, and so is deciding without
  an attached meeting.
- Vote validity: simple majority needs votes_for > votes_against AND
  votes_for >= floor(total/2)+1; dissolution proposals are forced to
  four-fifths (votes_for >= ceil(0.8 x (for+against))).
- Dissolution adoption records the vote and prints the manual-process notice;
  the system NEVER executes a dissolution.
"""

import math
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import AccountActor, get_account_actor, get_current_member
from app.core.permissions import require_member_permission, require_permission
from app.db.session import get_db
from app.models.admin import AdminUser
from app.models.amendment import (
    AmendmentProposal,
    ConstitutionVersion,
    AMENDMENT_PROPOSAL_ADOPTED,
    AMENDMENT_PROPOSAL_REJECTED,
    AMENDMENT_PROPOSAL_SCHEDULED,
    AMENDMENT_PROPOSAL_SUBMITTED,
    AMENDMENT_PROPOSAL_WITHDRAWN,
)
from app.models.member import Member
from app.models.resolution_book import Meeting
from app.services.audit import record_audit
from app.services.governance import (
    DISSOLUTION_NOTICE_BN,
    MAJORITY_FOUR_FIFTHS,
    MAJORITY_SIMPLE,
    MAJORITY_TYPES,
    majority_met,
)
from app.services.letters_pdf import render_letter
from app.services.resolution_book import publish_resolution_book_notice

router = APIRouter(tags=["amendments"])

AMENDMENT_PROPOSAL_PREFIX = "KRMF-SC"

_NOTnoticed_MEETING_MESSAGE = (
    "সংশোধনীর সিদ্ধান্ত শুধুমাত্র যথাযথভাবে নোটিশপ্রাপ্ত সভায় নেওয়া যায়; "
    "এই সভার নোটিশ প্রকাশিত হয়নি।"
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ProposalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    rationale: str = Field(min_length=1, max_length=10000)
    proposed_text: str = Field(min_length=1, max_length=100000)
    is_dissolution: bool = False


class MeetingAttachIn(BaseModel):
    meeting_id: int


class DecisionIn(BaseModel):
    votes_for: int = Field(ge=0)
    votes_against: int = Field(ge=0)
    votes_abstain: int = Field(ge=0)


class ProposalRejectIn(BaseModel):
    reason: str = Field(min_length=1, max_length=5000)


class VersionSeedIn(BaseModel):
    full_text: str = Field(min_length=1, max_length=500000)
    changes_summary: str | None = Field(default=None, max_length=10000)


class ProposalOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    proposal_no: str
    title: str
    rationale: str
    proposed_text: str
    current_version_id: int | None = None
    proposed_by_member_id: int | None = None
    proposed_by_member_name: str | None = None
    proposed_by_admin_id: int | None = None
    status: str
    is_dissolution: bool
    meeting_id: int | None = None
    meeting_no: str | None = None
    meeting_date: date | None = None
    meeting_notice_published_at: datetime | None = None
    votes_for: int | None = None
    votes_against: int | None = None
    votes_abstain: int | None = None
    required_majority: str
    decided_at: datetime | None = None
    decision_note: str | None = None
    adopted_version_no: int | None = None
    created_at: datetime


class VersionOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    version_no: int
    full_text: str
    changes_summary: str | None = None
    adopted_at: datetime | None = None
    source_amendment_id: int | None = None
    is_current: bool = False
    created_at: datetime


class AmendmentConstantsOut(BaseModel):
    dissolution_notice_bn: str
    majority_types: list[str]
    proposal_no_prefix: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _current_version(db: AsyncSession) -> ConstitutionVersion | None:
    return (
        await db.execute(
            select(ConstitutionVersion).order_by(ConstitutionVersion.version_no.desc()).limit(1)
        )
    ).scalar_one_or_none()


async def _next_proposal_no(db: AsyncSession, today: date) -> str:
    prefix = f"{AMENDMENT_PROPOSAL_PREFIX}-{today.year}-"
    rows = await db.execute(
        select(AmendmentProposal.proposal_no).where(AmendmentProposal.proposal_no.like(f"{prefix}%"))
    )
    max_seq = 0
    for (no,) in rows.all():
        suffix = (no or "")[len(prefix):]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))
    return f"{prefix}{max_seq + 1:02d}"


def _proposal_out(row: AmendmentProposal) -> ProposalOut:
    out = ProposalOut.model_validate(row)
    if row.proposed_by_member is not None:
        out.proposed_by_member_name = row.proposed_by_member.full_name
    if row.meeting is not None:
        out.meeting_no = row.meeting.meeting_no
        out.meeting_notice_published_at = row.meeting.notice_published_at
    if row.adopted_version is not None:
        out.adopted_version_no = row.adopted_version.version_no
    return out


async def _load_proposal(db: AsyncSession, proposal_id: int) -> AmendmentProposal:
    row = (
        await db.execute(
            select(AmendmentProposal)
            .options(
                selectinload(AmendmentProposal.meeting),
                selectinload(AmendmentProposal.adopted_version),
                selectinload(AmendmentProposal.current_version),
                selectinload(AmendmentProposal.proposed_by_member),
            )
            .where(AmendmentProposal.id == proposal_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found")
    return row


async def _assert_meeting_properly_noticed(db: AsyncSession, meeting_id: int) -> Meeting:
    meeting = (
        await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    ).scalar_one_or_none()
    if meeting is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Meeting {meeting_id} not found"
        )
    if meeting.notice_published_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=_NOTnoticed_MEETING_MESSAGE
        )
    return meeting


# ---------------------------------------------------------------------------
# Shared reads (members and admins)
# ---------------------------------------------------------------------------


@router.get("/amendments/constants", response_model=AmendmentConstantsOut)
async def amendments_constants(
    _actor: AccountActor = Depends(get_account_actor),
) -> AmendmentConstantsOut:
    return AmendmentConstantsOut(
        dissolution_notice_bn=DISSOLUTION_NOTICE_BN,
        majority_types=list(MAJORITY_TYPES),
        proposal_no_prefix=AMENDMENT_PROPOSAL_PREFIX,
    )


@router.get("/amendments/versions", response_model=list[VersionOut])
async def list_constitution_versions(
    db: AsyncSession = Depends(get_db),
    _actor: AccountActor = Depends(get_account_actor),
) -> list[VersionOut]:
    """The full version history, oldest last. `is_current` marks the highest
    version_no; rows are never rewritten."""
    rows = (
        await db.execute(select(ConstitutionVersion).order_by(ConstitutionVersion.version_no.asc()))
    ).scalars()
    versions = list(rows)
    current = versions[-1] if versions else None
    return [
        VersionOut(
            id=v.id,
            version_no=v.version_no,
            full_text=v.full_text,
            changes_summary=v.changes_summary,
            adopted_at=v.adopted_at,
            source_amendment_id=v.source_amendment_id,
            is_current=(current is not None and v.id == current.id),
            created_at=v.created_at,
        )
        for v in versions
    ]


# ---------------------------------------------------------------------------
# Member: propose / track / withdraw (amendment.propose)
# ---------------------------------------------------------------------------

_member_propose = require_member_permission("amendment.propose")


@router.get("/member/amendments/proposals", response_model=list[ProposalOut])
async def my_proposals(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(_member_propose),
) -> list[ProposalOut]:
    rows = await db.execute(
        select(AmendmentProposal)
        .where(AmendmentProposal.proposed_by_member_id == member.id)
        .order_by(AmendmentProposal.created_at.desc(), AmendmentProposal.id.desc())
    )
    return [_proposal_out(row) for row in rows.scalars().unique()]


@router.post(
    "/member/amendments/proposals",
    response_model=ProposalOut,
    status_code=status.HTTP_201_CREATED,
)
async def member_create_proposal(
    payload: ProposalCreate,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(_member_propose),
) -> ProposalOut:
    current = await _current_version(db)
    row = AmendmentProposal(
        proposal_no=await _next_proposal_no(db, date.today()),
        title=payload.title.strip(),
        rationale=payload.rationale.strip(),
        proposed_text=payload.proposed_text,
        current_version_id=current.id if current else None,
        proposed_by_member_id=member.id,
        status=AMENDMENT_PROPOSAL_SUBMITTED,
        is_dissolution=payload.is_dissolution,
        # Dissolution votes are ALWAYS four-fifths, forced server-side.
        required_majority=MAJORITY_FOUR_FIFTHS if payload.is_dissolution else MAJORITY_SIMPLE,
    )
    db.add(row)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=None,
        action="amendment.proposal_create",
        entity_type="amendment_proposal",
        entity_id=str(row.id),
        detail=f"{row.proposal_no} by member#{member.id}"
        + (" (dissolution)" if row.is_dissolution else ""),
    )
    await db.commit()
    await db.refresh(row)
    return _proposal_out(row)


@router.get("/member/amendments/proposals/{proposal_id}", response_model=ProposalOut)
async def my_proposal_detail(
    proposal_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(_member_propose),
) -> ProposalOut:
    row = await _load_proposal(db, proposal_id)
    if row.proposed_by_member_id != member.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your proposal")
    return _proposal_out(row)


@router.post("/member/amendments/proposals/{proposal_id}/withdraw", response_model=ProposalOut)
async def withdraw_proposal(
    proposal_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(_member_propose),
) -> ProposalOut:
    row = await _load_proposal(db, proposal_id)
    if row.proposed_by_member_id != member.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your proposal")
    if row.status not in (AMENDMENT_PROPOSAL_SUBMITTED, AMENDMENT_PROPOSAL_SCHEDULED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A proposal in status '{row.status}' cannot be withdrawn.",
        )
    row.status = AMENDMENT_PROPOSAL_WITHDRAWN
    row.decided_at = datetime.now(timezone.utc)
    record_audit(
        db,
        actor_admin_id=None,
        action="amendment.proposal_withdrawn",
        entity_type="amendment_proposal",
        entity_id=str(row.id),
        detail=f"{row.proposal_no} withdrawn by proposer",
    )
    await db.commit()
    await db.refresh(row)
    return _proposal_out(row)


# ---------------------------------------------------------------------------
# Admin workflow (amendment.manage)
# ---------------------------------------------------------------------------


@router.get("/admin/amendments/proposals", response_model=list[ProposalOut])
async def list_proposals(
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission("amendment.manage")),
) -> list[ProposalOut]:
    query = select(AmendmentProposal).order_by(
        AmendmentProposal.created_at.desc(), AmendmentProposal.id.desc()
    )
    if status_filter:
        query = query.where(AmendmentProposal.status == status_filter)
    rows = await db.execute(query)
    return [_proposal_out(row) for row in rows.scalars().unique()]


@router.post(
    "/admin/amendments/proposals",
    response_model=ProposalOut,
    status_code=status.HTTP_201_CREATED,
)
async def admin_create_proposal(
    payload: ProposalCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("amendment.manage")),
) -> ProposalOut:
    current = await _current_version(db)
    row = AmendmentProposal(
        proposal_no=await _next_proposal_no(db, date.today()),
        title=payload.title.strip(),
        rationale=payload.rationale.strip(),
        proposed_text=payload.proposed_text,
        current_version_id=current.id if current else None,
        proposed_by_admin_id=admin.id,
        status=AMENDMENT_PROPOSAL_SUBMITTED,
        is_dissolution=payload.is_dissolution,
        required_majority=MAJORITY_FOUR_FIFTHS if payload.is_dissolution else MAJORITY_SIMPLE,
    )
    db.add(row)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="amendment.proposal_create",
        entity_type="amendment_proposal",
        entity_id=str(row.id),
        detail=f"{row.proposal_no} by admin#{admin.id}"
        + (" (dissolution)" if row.is_dissolution else ""),
    )
    await db.commit()
    await db.refresh(row)
    return _proposal_out(row)


@router.post("/admin/amendments/proposals/{proposal_id}/attach-meeting", response_model=ProposalOut)
async def attach_meeting(
    proposal_id: int,
    payload: MeetingAttachIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("amendment.manage")),
) -> ProposalOut:
    """Schedule the proposal for a sitting. The meeting MUST have its notice
    published (notice_published_at set) - otherwise 409."""
    row = await _load_proposal(db, proposal_id)
    if row.status not in (AMENDMENT_PROPOSAL_SUBMITTED, AMENDMENT_PROPOSAL_SCHEDULED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot attach a meeting to a proposal in status '{row.status}'.",
        )
    meeting = await _assert_meeting_properly_noticed(db, payload.meeting_id)
    row.meeting_id = meeting.id
    row.meeting_date = meeting.date
    row.status = AMENDMENT_PROPOSAL_SCHEDULED
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="amendment.proposal_scheduled",
        entity_type="amendment_proposal",
        entity_id=str(row.id),
        detail=f"{row.proposal_no} scheduled in {meeting.meeting_no} "
        f"(notice published {meeting.notice_published_at:%Y-%m-%d})",
    )
    await db.commit()
    await db.refresh(row)
    return _proposal_out(row)


@router.post("/admin/amendments/proposals/{proposal_id}/decide", response_model=ProposalOut)
async def decide_proposal(
    proposal_id: int,
    payload: DecisionIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("amendment.manage")),
) -> ProposalOut:
    """Record the vote. Validity is checked BEFORE anything is written:
    invalid tallies are a 409 and leave the proposal untouched. A passing
    tally ADOPTS the proposal (new constitution version + notice)."""
    row = await _load_proposal(db, proposal_id)
    if row.status not in (AMENDMENT_PROPOSAL_SUBMITTED, AMENDMENT_PROPOSAL_SCHEDULED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot decide a proposal in status '{row.status}'.",
        )
    if row.meeting_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="সিদ্ধান্তের আগে একটি সভা সংযুক্ত করা আবশ্যক।",
        )
    meeting = await _assert_meeting_properly_noticed(db, row.meeting_id)

    total = payload.votes_for + payload.votes_against + payload.votes_abstain
    if total <= 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="কমপক্ষে একটি ভোট রেকর্ড করা আবশ্যক।",
        )
    if not majority_met(
        row.required_majority, payload.votes_for, payload.votes_against, payload.votes_abstain
    ):
        if row.required_majority == MAJORITY_FOUR_FIFTHS:
            need = math.ceil(0.8 * (payload.votes_for + payload.votes_against))
            detail = (
                f"চার-পঞ্চমাংশ সংখ্যাগরিষ্ঠতা প্রয়োজন: পক্ষে কমপক্ষে {need} ভোট "
                f"(মোট পক্ষে-বিপক্ষে {payload.votes_for + payload.votes_against}); "
                f"বর্তমান: পক্ষে {payload.votes_for}, বিপক্ষে {payload.votes_against}।"
            )
        else:
            need = total // 2 + 1
            detail = (
                f"সাধারণ সংখ্যাগরিষ্ঠতা প্রয়োজন: পক্ষে > বিপক্ষে এবং পক্ষে কমপক্ষে {need} "
                f"(মোট ভোট {total}); বর্তমান: পক্ষে {payload.votes_for}, "
                f"বিপক্ষে {payload.votes_against}, সংযত {payload.votes_abstain}।"
            )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    # --- Adopted: append a NEW version row (never overwrite) -----------------
    max_no = (
        await db.execute(select(func.max(ConstitutionVersion.version_no)))
    ).scalar_one()
    version = ConstitutionVersion(
        version_no=(max_no or 0) + 1,
        full_text=row.proposed_text,
        changes_summary=f"{row.title} — {row.proposal_no} অনুযায়ী গৃহীত",
        adopted_at=datetime.now(timezone.utc),
        source_amendment_id=row.id,
        created_by=admin.id,
    )
    db.add(version)
    await db.flush()

    row.votes_for = payload.votes_for
    row.votes_against = payload.votes_against
    row.votes_abstain = payload.votes_abstain
    row.status = AMENDMENT_PROPOSAL_ADOPTED
    row.decided_at = datetime.now(timezone.utc)
    row.decided_by = admin.id
    row.adopted_version_id = version.id

    notice_body = (
        f"গঠনতন্ত্রের সংশোধনী ({row.proposal_no}: {row.title}) "
        f"{meeting.meeting_no} সভায় গৃহীত হয়েছে। "
        f"নতুন সংস্করণ: সংস্করণ-{version.version_no}। "
        f"ভোট: পক্ষে {payload.votes_for}, বিপক্ষে {payload.votes_against}, "
        f"সংযত {payload.votes_abstain}।"
    )
    if row.is_dissolution:
        notice_body += f" {DISSOLUTION_NOTICE_BN}।"
    notice = await publish_resolution_book_notice(
        db, admin, title=f"গঠনতন্ত্র সংশোধনী গৃহীত — সংস্করণ {version.version_no}", body=notice_body
    )
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="amendment.proposal_adopted",
        entity_type="amendment_proposal",
        entity_id=str(row.id),
        detail=f"{row.proposal_no} adopted as version {version.version_no} "
        f"(votes {payload.votes_for}/{payload.votes_against}/{payload.votes_abstain}, "
        f"{row.required_majority}; notice #{notice.id})",
    )
    await db.commit()
    await db.refresh(row)
    return _proposal_out(row)


@router.post("/admin/amendments/proposals/{proposal_id}/reject", response_model=ProposalOut)
async def reject_proposal(
    proposal_id: int,
    payload: ProposalRejectIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("amendment.manage")),
) -> ProposalOut:
    row = await _load_proposal(db, proposal_id)
    if row.status not in (AMENDMENT_PROPOSAL_SUBMITTED, AMENDMENT_PROPOSAL_SCHEDULED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot reject a proposal in status '{row.status}'.",
        )
    row.status = AMENDMENT_PROPOSAL_REJECTED
    row.decided_at = datetime.now(timezone.utc)
    row.decided_by = admin.id
    row.decision_note = payload.reason.strip()
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="amendment.proposal_rejected",
        entity_type="amendment_proposal",
        entity_id=str(row.id),
        detail=f"{row.proposal_no} rejected: {row.decision_note[:150]}",
    )
    await db.commit()
    await db.refresh(row)
    return _proposal_out(row)


@router.post("/admin/amendments/versions/seed", response_model=VersionOut, status_code=201)
async def seed_initial_version(
    payload: VersionSeedIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("amendment.manage")),
) -> VersionOut:
    """Seed v1 of the constitution on first use. Only allowed while the
    register is empty; later changes go through amendment proposals."""
    if await _current_version(db) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A constitution version already exists; new versions are "
            "created only through adopted amendment proposals.",
        )
    row = ConstitutionVersion(
        version_no=1,
        full_text=payload.full_text,
        changes_summary=payload.changes_summary or "প্রাথমিক সংস্করণ (v1)",
        adopted_at=datetime.now(timezone.utc),
        created_by=admin.id,
    )
    db.add(row)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="amendment.version_seeded",
        entity_type="constitution_version",
        entity_id=str(row.id),
        detail="v1 seeded",
    )
    await db.commit()
    await db.refresh(row)
    out = VersionOut.model_validate(row)
    out.is_current = True
    return out


@router.get("/admin/amendments/proposals/{proposal_id}/certificate.pdf")
async def adoption_certificate(
    proposal_id: int,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission("amendment.manage")),
) -> Response:
    """Certificate for an ADOPTED amendment (letterhead)."""
    row = await _load_proposal(db, proposal_id)
    if row.status != AMENDMENT_PROPOSAL_ADOPTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="শুধুমাত্র গৃহীত সংশোধনীর সনদপত্র তৈরি হয়।",
        )
    majority_bn = (
        "চার-পঞ্চমাংশ সংখ্যাগরিষ্ঠতা"
        if row.required_majority == MAJORITY_FOUR_FIFTHS
        else "সাধারণ সংখ্যাগরিষ্ঠতা"
    )
    meeting_ref = "—"
    if row.meeting is not None:
        meeting_date = row.meeting_date or row.meeting.date
        meeting_ref = f"{row.meeting.meeting_no} ({meeting_date.isoformat() if meeting_date else '—'})"
    version_no = row.adopted_version.version_no if row.adopted_version else None
    body = [
        f"প্রস্তাব নম্বর: {row.proposal_no}",
        f"শিরোনাম: {row.title}",
        f"সংখ্যাগরিষ্ঠতার ধরন: {majority_bn}",
        f"ভোট: পক্ষে {row.votes_for or 0}, বিপক্ষে {row.votes_against or 0}, "
        f"সংযত {row.votes_abstain or 0}",
        f"সভা: {meeting_ref}",
        f"সংস্করণ: {f'সংস্করণ-{version_no}' if version_no else '—'}",
    ]
    if row.is_dissolution:
        body.append(f"দ্রষ্টব্য: {DISSOLUTION_NOTICE_BN}।")
    pdf_bytes = render_letter(
        title="গঠনতন্ত্র সংশোধনী গৃহীত হওয়ার সনদপত্র",
        ref_no=row.proposal_no,
        body_sections=[("গৃহীত সংশোধনীর বিবরণ", body)],
        meta_line=f"তারিখ: {date.today().isoformat()}",
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{row.proposal_no}-certificate.pdf"'
        },
    )
