"""Module 2 — কমিটি/পরিষদ রেজিস্ট্রি (committee registry).

The 11 constitutional council posts (app.services.governance.COUNCIL_POSTS)
each hold a CommitteeTerm in the registry. Reads are open to every logged-in
account (current holders + vacancies + expired-term warnings); every write is
gated by `committee_registry.manage` and audited. Resignations need
acknowledgement by the standing council side (an admin holding
committee_registry.manage); removals require a documented investigation and a
15-working-day right-to-respond before the final decision.
"""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import AccountActor, get_account_actor, get_current_member
from app.core.permissions import require_permission
from app.db.session import get_db
from app.models.admin import AdminUser
from app.models.committee_election import (
    TERM_STATUS_ACTIVE,
    TERM_STATUS_CARETAKER,
    TERM_STATUS_EXPIRED,
    TERM_STATUS_VACANT,
    TERM_YEARS,
    default_term_end,
    VACANCY_STATUS_ACKNOWLEDGED,
    VACANCY_STATUS_DECIDED,
    VACANCY_STATUS_INVESTIGATION,
    VACANCY_STATUS_PENDING_ACK,
    VACANCY_TYPE_REMOVAL,
    VACANCY_TYPE_RESIGNATION,
    VACANCY_TYPES,
    CommitteeTerm,
    PostVacancy,
)
from app.models.member import Member
from app.services.audit import record_audit
from app.services.email import send_email, send_with_retries
from app.services.governance import (
    COUNCIL_POSTS,
    POST_KEYS,
    add_working_days,
)
from app.services.resolution_book import publish_resolution_book_notice

router = APIRouter(tags=["committee-registry"])

REMOVAL_RESPONSE_WORKING_DAYS = 15


def _today() -> date:
    return datetime.now(timezone.utc).date()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class TermCreate(BaseModel):
    post_key: str
    member_id: int
    term_start: date
    term_end: date | None = None
    is_caretaker: bool = False
    notes: str | None = Field(default=None, max_length=2000)


class TermUpdate(BaseModel):
    term_start: date | None = None
    term_end: date | None = None
    is_caretaker: bool | None = None
    notes: str | None = Field(default=None, max_length=2000)


class ResignationIn(BaseModel):
    note: str | None = Field(default=None, max_length=2000)
    # Admin-submitted resignations must name the holder; members omit this.
    member_id: int | None = None


class RemovalNoticeIn(BaseModel):
    investigation_note: str = Field(min_length=1, max_length=5000)


class MemberResponseIn(BaseModel):
    response: str = Field(min_length=1, max_length=5000)


class VacancyDecisionIn(BaseModel):
    decision: str = Field(pattern="^(removed|retained)$")
    note: str | None = Field(default=None, max_length=5000)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _member_brief(db: AsyncSession, member_id: int | None) -> dict | None:
    if member_id is None:
        return None
    row = (
        await db.execute(
            select(Member.id, Member.full_name, Member.member_id).where(Member.id == member_id)
        )
    ).first()
    if row is None:
        return None
    return {"id": row[0], "full_name": row[1], "member_id": row[2]}


async def _member_briefs(db: AsyncSession, member_ids) -> dict[int, dict]:
    """Batch variant of _member_brief: one IN query for many members."""
    ids = {m for m in member_ids if m is not None}
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(Member.id, Member.full_name, Member.member_id).where(Member.id.in_(ids))
        )
    ).all()
    return {r[0]: {"id": r[0], "full_name": r[1], "member_id": r[2]} for r in rows}


async def supersede_current_term(
    db: AsyncSession,
    post_key: str,
    new_term: CommitteeTerm,
    *,
    exclude_ids: tuple[int, ...] = (),
) -> CommitteeTerm | None:
    """Mark the post's latest not-yet-replaced term as replaced by `new_term`
    (which must already be flushed). `exclude_ids` keeps sibling terms created
    in the same batch (multi-seat posts) from superseding each other.
    Shared by create_term and election confirmation. Returns the superseded
    term, if any."""
    current = (
        (
            await db.execute(
                select(CommitteeTerm)
                .where(
                    CommitteeTerm.post_key == post_key,
                    CommitteeTerm.replaced_by_term_id.is_(None),
                    CommitteeTerm.id.not_in((new_term.id, *exclude_ids)),
                )
                .order_by(CommitteeTerm.term_start.desc(), CommitteeTerm.id.desc())
            )
        )
        .scalars()
        .first()
    )
    if current is not None:
        current.replaced_by_term_id = new_term.id
    return current


def term_to_dict(term: CommitteeTerm, today: date | None = None) -> dict:
    today = today or _today()
    return {
        "id": term.id,
        "post_key": term.post_key,
        "member_id": term.member_id,
        "term_start": term.term_start,
        "term_end": term.term_end,
        "is_caretaker": term.is_caretaker,
        "status": term.computed_status(today),
        "replaced_by_term_id": term.replaced_by_term_id,
        "notes": term.notes,
        "created_at": term.created_at,
    }


def vacancy_to_dict(vacancy: PostVacancy, member: dict | None) -> dict:
    return {
        "id": vacancy.id,
        "post_key": vacancy.post_key,
        "term_id": vacancy.term_id,
        "member": member,
        "member_id": vacancy.member_id,
        "vacancy_type": vacancy.vacancy_type,
        "status": vacancy.status,
        "note": vacancy.note,
        "investigation_note": vacancy.investigation_note,
        "response_deadline": vacancy.response_deadline,
        "member_response": vacancy.member_response,
        "member_responded_at": vacancy.member_responded_at,
        "decision": vacancy.decision,
        "decision_note": vacancy.decision_note,
        "decided_at": vacancy.decided_at,
        "acknowledged_at": vacancy.acknowledged_at,
        "created_at": vacancy.created_at,
    }


async def _load_term(db: AsyncSession, term_id: int) -> CommitteeTerm:
    term = (
        await db.execute(select(CommitteeTerm).where(CommitteeTerm.id == term_id))
    ).scalar_one_or_none()
    if term is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Term not found.")
    return term


async def _load_vacancy(db: AsyncSession, vacancy_id: int) -> PostVacancy:
    vacancy = (
        await db.execute(select(PostVacancy).where(PostVacancy.id == vacancy_id))
    ).scalar_one_or_none()
    if vacancy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacancy not found.")
    return vacancy


def _validate_post_key(post_key: str) -> None:
    if post_key not in POST_KEYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"অজানা পদ: {post_key}. Unknown post key.",
        )


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


@router.get("/committee-registry")
async def registry_overview(
    db: AsyncSession = Depends(get_db),
    _actor: AccountActor = Depends(get_account_actor),
) -> dict:
    """Current holder per post + vacancies + expired-term warning. `Expired
    terms can only handle routine work` - surfaced via the
    routine_work_only / warning flags; শূন্যপদ (vacant) when no holder."""
    today = _today()
    terms = (
        (
            await db.execute(
                select(CommitteeTerm)
                .options()
                .order_by(CommitteeTerm.term_start.desc(), CommitteeTerm.id.desc())
            )
        )
        .scalars()
        .unique()
        .all()
    )
    latest_by_post: dict[str, CommitteeTerm] = {}
    history: dict[str, list[dict]] = {key: [] for key in POST_KEYS}
    for term in terms:
        history.setdefault(term.post_key, []).append(term_to_dict(term, today))
        if term.post_key not in latest_by_post:
            latest_by_post[term.post_key] = term

    vacancies = (
        (
            await db.execute(
                select(PostVacancy)
                .where(PostVacancy.status.in_(
                    (VACANCY_STATUS_PENDING_ACK, VACANCY_STATUS_INVESTIGATION)
                ))
                .order_by(PostVacancy.created_at.desc())
            )
        )
        .scalars()
        .all()
    )

    briefs = await _member_briefs(
        db,
        [t.member_id for t in latest_by_post.values()] + [v.member_id for v in vacancies],
    )
    posts = []
    for post in COUNCIL_POSTS:
        term = latest_by_post.get(post["key"])
        holder = None
        post_status = TERM_STATUS_VACANT
        if term is not None and term.member_id is not None:
            holder = briefs.get(term.member_id)
            post_status = term.computed_status(today)
        expired = post_status == TERM_STATUS_EXPIRED
        posts.append(
            {
                **post,
                "holder": holder,
                "term": term_to_dict(term, today) if term else None,
                "status": post_status,
                # Expired/caretaker terms may only handle routine work.
                "routine_work_only": expired or post_status == TERM_STATUS_CARETAKER,
                "warning": (
                    "expired terms can only handle routine work" if expired else None
                ),
                "open_vacancy": any(v.post_key == post["key"] for v in vacancies),
            }
        )

    vacancy_items = [vacancy_to_dict(v, briefs.get(v.member_id)) for v in vacancies]
    return {"posts": posts, "open_vacancies": vacancy_items, "today": today}


@router.get("/committee-registry/posts/{post_key}/history")
async def post_history(
    post_key: str,
    db: AsyncSession = Depends(get_db),
    _actor: AccountActor = Depends(get_account_actor),
) -> dict:
    _validate_post_key(post_key)
    terms = (
        (
            await db.execute(
                select(CommitteeTerm)
                .where(CommitteeTerm.post_key == post_key)
                .order_by(CommitteeTerm.term_start.desc(), CommitteeTerm.id.desc())
            )
        )
        .scalars()
        .all()
    )
    today = _today()
    items = []
    for term in terms:
        items.append(
            {
                **term_to_dict(term, today),
                "holder": await _member_brief(db, term.member_id),
            }
        )
    return {"post_key": post_key, "items": items}


@router.get("/committee-registry/vacancies")
async def list_vacancies(
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("committee_registry.manage")),
) -> dict:
    vacancies = (
        (await db.execute(select(PostVacancy).order_by(PostVacancy.created_at.desc())))
        .scalars()
        .all()
    )
    today = _today()
    items = []
    for v in vacancies:
        item = vacancy_to_dict(v, await _member_brief(db, v.member_id))
        if v.response_deadline:
            from app.services.governance import sla_status

            item["response_sla"] = sla_status(
                due=v.response_deadline,
                acknowledged=v.member_responded_at,
                now=datetime.now(timezone.utc),
            )
        items.append(item)
    return {"total": len(items), "items": items, "today": today}


# ---------------------------------------------------------------------------
# Term CRUD (admin)
# ---------------------------------------------------------------------------


@router.post("/committee-registry/terms", status_code=status.HTTP_201_CREATED)
async def create_term(
    payload: TermCreate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("committee_registry.manage")),
) -> dict:
    _validate_post_key(payload.post_key)
    member = (
        await db.execute(select(Member).where(Member.id == payload.member_id))
    ).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found.")
    term_end = payload.term_end or default_term_end(payload.term_start)

    term = CommitteeTerm(
        post_key=payload.post_key,
        member_id=payload.member_id,
        term_start=payload.term_start,
        term_end=term_end,
        is_caretaker=payload.is_caretaker,
        notes=payload.notes,
        created_by=admin.id,
    )
    db.add(term)
    await db.flush()
    # If the post currently has an active holder, that term is superseded.
    current = await supersede_current_term(db, payload.post_key, term)
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="committee_registry.term_created",
        entity_type="committee_term",
        entity_id=str(term.id),
        detail=f"{payload.post_key}: member {payload.member_id} term {payload.term_start}..{term_end}"
        + (" (caretaker)" if payload.is_caretaker else "")
        + (f", replaces term {current.id}" if current is not None else ""),
    )
    await db.commit()
    await db.refresh(term)
    return term_to_dict(term)


@router.put("/committee-registry/terms/{term_id}")
async def update_term(
    term_id: int,
    payload: TermUpdate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("committee_registry.manage")),
) -> dict:
    term = await _load_term(db, term_id)
    old = {
        "term_start": term.term_start,
        "term_end": term.term_end,
        "is_caretaker": term.is_caretaker,
        "notes": term.notes,
    }
    sent = payload.model_fields_set
    for field in ("term_start", "term_end", "is_caretaker", "notes"):
        if field in sent:
            setattr(term, field, getattr(payload, field))
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="committee_registry.term_updated",
        entity_type="committee_term",
        entity_id=str(term.id),
        detail=f"{term.post_key}: "
        + ", ".join(f"{k}: {old[k]} -> {getattr(term, k)}" for k in old if old[k] != getattr(term, k)),
    )
    await db.commit()
    await db.refresh(term)
    return term_to_dict(term)


# ---------------------------------------------------------------------------
# Vacancy workflow
# ---------------------------------------------------------------------------


@router.post("/committee-registry/posts/{post_key}/resignation", status_code=status.HTTP_201_CREATED)
async def submit_resignation(
    post_key: str,
    payload: ResignationIn,
    db: AsyncSession = Depends(get_db),
    actor: AccountActor = Depends(get_account_actor),
) -> dict:
    """The holder resigns (member self-service) or an admin records it on
    their behalf. Lands as pending_acknowledgement until the standing-council
    side (committee_registry.manage) acknowledges."""
    _validate_post_key(post_key)
    if actor.member is not None:
        member_id = actor.member.id
    elif actor.admin is not None:
        member_id = payload.member_id
        if member_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Admin submissions must identify the resigning member_id.",
            )
    else:  # pragma: no cover - actor is always one of the two
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    latest = (
        (
            await db.execute(
                select(CommitteeTerm)
                .where(CommitteeTerm.post_key == post_key, CommitteeTerm.member_id == member_id)
                .order_by(CommitteeTerm.term_start.desc(), CommitteeTerm.id.desc())
            )
        )
        .scalars()
        .first()
    )
    if latest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="এই সদস্য এই পদে দায়িত্বে নেই। That member does not hold this post.",
        )
    vacancy = PostVacancy(
        post_key=post_key,
        term_id=latest.id,
        member_id=member_id,
        vacancy_type=VACANCY_TYPE_RESIGNATION,
        status=VACANCY_STATUS_PENDING_ACK,
        note=payload.note,
        created_by=actor.admin.id if actor.admin else None,
    )
    db.add(vacancy)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=actor.admin.id if actor.admin else None,
        action="committee_registry.resignation_filed",
        entity_type="post_vacancy",
        entity_id=str(vacancy.id),
        detail=f"{post_key}: resignation filed by member {member_id}, pending acknowledgement",
    )
    await db.commit()
    await db.refresh(vacancy)
    return vacancy_to_dict(vacancy, await _member_brief(db, member_id))


@router.post("/committee-registry/vacancies/{vacancy_id}/acknowledge")
async def acknowledge_vacancy(
    vacancy_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("committee_registry.manage")),
) -> dict:
    """স্থায়ী পরিষদ (standing council) acknowledges the resignation."""
    vacancy = await _load_vacancy(db, vacancy_id)
    if vacancy.status != VACANCY_STATUS_PENDING_ACK:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only a pending resignation can be acknowledged (current: {vacancy.status}).",
        )
    vacancy.status = VACANCY_STATUS_ACKNOWLEDGED
    vacancy.acknowledged_at = datetime.now(timezone.utc)
    vacancy.acknowledged_by = admin.id
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="committee_registry.resignation_acknowledged",
        entity_type="post_vacancy",
        entity_id=str(vacancy.id),
        detail=f"{vacancy.post_key}: resignation of member {vacancy.member_id} acknowledged",
    )
    await db.commit()
    await db.refresh(vacancy)
    return vacancy_to_dict(vacancy, await _member_brief(db, vacancy.member_id))


@router.post("/committee-registry/vacancies/{vacancy_id}/removal-notice")
async def issue_removal_notice(
    vacancy_id: int,
    payload: RemovalNoticeIn,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("committee_registry.manage")),
) -> dict:
    """Start a removal: requires a documented investigation note and opens a
    15-working-day window for the member to respond in writing."""
    vacancy = await _load_vacancy(db, vacancy_id)
    if vacancy.status != VACANCY_STATUS_PENDING_ACK:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Removal notice already issued (current: {vacancy.status}).",
        )
    # A pending resignation case may be escalated to a removal case; the
    # documented investigation note is what makes it a removal.
    vacancy.vacancy_type = VACANCY_TYPE_REMOVAL
    vacancy.status = VACANCY_STATUS_INVESTIGATION
    vacancy.investigation_note = payload.investigation_note.strip()
    vacancy.response_deadline = add_working_days(_today(), REMOVAL_RESPONSE_WORKING_DAYS)
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="committee_registry.removal_notice_issued",
        entity_type="post_vacancy",
        entity_id=str(vacancy.id),
        detail=f"{vacancy.post_key}: removal notice for member {vacancy.member_id}, "
        f"response due {vacancy.response_deadline}; investigation documented",
    )
    member = (
        await db.execute(select(Member).where(Member.id == vacancy.member_id))
    ).scalar_one_or_none()
    if member is not None and member.email:
        deadline = vacancy.response_deadline.strftime("%d-%m-%Y")
        await send_with_retries(
            lambda: send_email(
                member.email,
                "পদ থেকে অপসারণ প্রক্রিয়া — আপনার জবাব দেওয়ার সুযোগ",
                f"<p>আপনার বিরুদ্ধে {vacancy.post_key} পদ থেকে অপসারণের প্রক্রিয়া শুরু হয়েছে। "
                f"তদন্তের নোট অনুযায়ী <b>{deadline}</b> এর মধ্যে লিখিত জবাব দিন।</p>",
            )
        )
    await db.commit()
    await db.refresh(vacancy)
    return vacancy_to_dict(vacancy, await _member_brief(db, vacancy.member_id))


@router.post("/committee-registry/vacancies/{vacancy_id}/member-response")
async def submit_member_response(
    vacancy_id: int,
    payload: MemberResponseIn,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> dict:
    """The accused member's written response inside the right-to-respond
    window (the holder themselves, or an admin on their behalf)."""
    vacancy = await _load_vacancy(db, vacancy_id)
    if vacancy.member_id != member.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="শুধু অভিযুক্ত সদস্য জবাব দিতে পারেন। Only the accused member may respond.",
        )
    if vacancy.status != VACANCY_STATUS_INVESTIGATION:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No open right-to-respond window (current: {vacancy.status}).",
        )
    vacancy.member_response = payload.response.strip()
    vacancy.member_responded_at = datetime.now(timezone.utc)
    record_audit(
        db,
        actor_admin_id=None,
        action="committee_registry.member_response",
        entity_type="post_vacancy",
        entity_id=str(vacancy.id),
        detail=f"{vacancy.post_key}: member {member.id} submitted written response",
    )
    await db.commit()
    await db.refresh(vacancy)
    return vacancy_to_dict(vacancy, await _member_brief(db, vacancy.member_id))


@router.post("/committee-registry/vacancies/{vacancy_id}/decide")
async def decide_vacancy(
    vacancy_id: int,
    payload: VacancyDecisionIn,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("committee_registry.manage")),
) -> dict:
    """Final decision (removed / retained). Audited; the member is emailed."""
    vacancy = await _load_vacancy(db, vacancy_id)
    if vacancy.status not in (VACANCY_STATUS_INVESTIGATION, VACANCY_STATUS_ACKNOWLEDGED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only an open removal/acknowledged case can be decided (current: {vacancy.status}).",
        )
    vacancy.status = VACANCY_STATUS_DECIDED
    vacancy.decision = payload.decision
    vacancy.decision_note = payload.note
    vacancy.decided_at = datetime.now(timezone.utc)
    detail = f"{vacancy.post_key}: member {vacancy.member_id} {payload.decision}"
    if payload.decision == "removed":
        # Vacate the term: mark it replaced-by-none but ended today.
        if vacancy.term_id:
            term = await _load_term(db, vacancy.term_id)
            term.term_end = _today()
            detail += f"; term {term.id} ended"
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="committee_registry.vacancy_decided",
        entity_type="post_vacancy",
        entity_id=str(vacancy.id),
        detail=detail + (f"; note: {payload.note}" if payload.note else ""),
    )
    member = (
        await db.execute(select(Member).where(Member.id == vacancy.member_id))
    ).scalar_one_or_none()
    if member is not None and member.email:
        outcome = "অপসারণ" if payload.decision == "removed" else "বহাল"
        await send_with_retries(
            lambda: send_email(
                member.email,
                "পদ সংক্রান্ত চূড়ান্ত সিদ্ধান্ত",
                f"<p>আপনার বিরুদ্ধে প্রক্রিয়ার চূড়ান্ত সিদ্ধান্ত: <b>{outcome}</b>।</p>",
            )
        )
    await db.commit()
    await db.refresh(vacancy)
    return vacancy_to_dict(vacancy, await _member_brief(db, vacancy.member_id))
