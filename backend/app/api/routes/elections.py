"""Module 2 — নির্বাচন (elections).

Lifecycle: draft → nominations_open → nominations_closed (voter snapshot
FROZEN) → voting → tabulated → confirmed (winners written into the committee
registry + public notice). One secret ballot per snapshot-eligible member per
post (DB-unique); ballot content is never exposed through any read endpoint -
only per-post counts after tabulation.
"""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import AccountActor, get_account_actor, get_current_member
from app.core.permissions import require_permission
from app.db.session import get_db
from app.models.admin import AdminUser
from app.models.committee_election import (
    COMPLAINT_STATUS_REJECTED,
    COMPLAINT_STATUS_RESOLVED,
    COMPLAINT_STATUSES,
    COMPLAINT_STATUS_SUBMITTED,
    ELECTION_STATUS_CANCELLED,
    ELECTION_STATUS_CONFIRMED,
    ELECTION_STATUS_DRAFT,
    ELECTION_STATUS_NOMINATIONS_CLOSED,
    ELECTION_STATUS_NOMINATIONS_OPEN,
    ELECTION_STATUS_TABULATED,
    ELECTION_STATUS_VOTING,
    ELECTION_STATUSES,
    NOMINATION_STATUS_APPROVED,
    NOMINATION_STATUS_PENDING,
    NOMINATION_STATUS_REJECTED,
    NOMINATION_STATUSES,
    TERM_YEARS,
    default_term_end,
    post_seats,
    CommitteeTerm,
    Election,
    ElectionComplaint,
    Nomination,
    VoterSnapshot,
    Vote,
)
from app.models.member import (
    GOVERNANCE_STATUS_SUSPENDED,
    MEMBER_CLASS_FOUNDER,
    MEMBER_CLASS_GENERAL,
    Member,
    MemberStatus,
)
from app.api.routes.committee_registry import supersede_current_term
from app.services.audit import record_audit
from app.services.election_pdf import ResultRow, ResultSheetData, bn_date, bn_digits, build_result_sheet_pdf
from app.services.governance import COUNCIL_POSTS, POST_KEYS, is_election_eligible
from app.services.resolution_book import publish_resolution_book_notice

router = APIRouter(tags=["elections"])
settings = get_settings()

_DHAKA = timezone(timedelta(hours=6), name="Asia/Dhaka")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> date:
    return _now().date()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ElectionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    nomination_start: date
    nomination_end: date
    voting_start: date
    voting_end: date


class NominationCreate(BaseModel):
    post_key: str
    statement: str | None = Field(default=None, max_length=2000)


class NominationDecision(BaseModel):
    approved: bool


class VoteCast(BaseModel):
    post_key: str
    nomination_id: int


class ComplaintCreate(BaseModel):
    against: str | None = Field(default=None, max_length=255)
    subject: str = Field(min_length=1, max_length=255)
    details: str = Field(min_length=1, max_length=5000)


class ComplaintDecision(BaseModel):
    status: str = Field(pattern=f"^({'|'.join((COMPLAINT_STATUS_RESOLVED, COMPLAINT_STATUS_REJECTED))})$")
    resolution: str = Field(min_length=1, max_length=5000)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def post_label(post_key: str) -> str:
    for post in COUNCIL_POSTS:
        if post["key"] == post_key:
            return post["bn"]
    return post_key


def snapshot_eligible(snapshot: dict) -> bool:
    """Eligibility re-evaluated on the FROZEN snapshot, not the live member."""
    return (
        snapshot.get("status") == MemberStatus.APPROVED.value
        and snapshot.get("governance_status") != GOVERNANCE_STATUS_SUSPENDED
        and snapshot.get("member_class") in (MEMBER_CLASS_FOUNDER, MEMBER_CLASS_GENERAL)
    )


def member_snapshot(member: Member) -> dict:
    return {
        "member_class": member.member_class,
        "status": getattr(member.status, "value", str(member.status)),
        "governance_status": member.governance_status,
        "full_name": member.full_name,
    }


async def load_election(db: AsyncSession, election_id: int, *, for_update: bool = False) -> Election:
    """Load an election; `for_update` row-locks it (SELECT ... FOR UPDATE) so a
    status check + transition cannot race a concurrent request."""
    query = select(Election).where(Election.id == election_id)
    if for_update:
        query = query.with_for_update()
    election = (await db.execute(query)).scalar_one_or_none()
    if election is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Election not found.")
    return election


async def _validate_post(post_key: str) -> None:
    if post_key not in POST_KEYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"অজানা পদ: {post_key}. Unknown post key.",
        )


async def _validate_windows(payload: ElectionCreate) -> None:
    if not (payload.nomination_start <= payload.nomination_end <= payload.voting_start <= payload.voting_end):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="সময়সীমার ক্রম ভুল: মনোনয়ন শেষ <= ভোট শুরু <= ভোট শেষ হতে হবে। "
            "Windows must be ordered: nomination_end <= voting_start <= voting_end.",
        )


def election_to_dict(election: Election, *, eligible_voters: int | None = None) -> dict:
    data = {
        "id": election.id,
        "title": election.title,
        "nomination_start": election.nomination_start,
        "nomination_end": election.nomination_end,
        "voting_start": election.voting_start,
        "voting_end": election.voting_end,
        "status": election.status,
        "confirmed_at": election.confirmed_at,
        "created_at": election.created_at,
    }
    if eligible_voters is not None:
        data["eligible_voters"] = eligible_voters
    return data


async def _counts(db: AsyncSession, election_id: int) -> dict[str, dict]:
    """Per-post vote counts per approved candidate. COUNTS ONLY - no voter or
    ballot attribution survives this aggregation."""
    rows = (
        await db.execute(
            select(Vote.post_key, Vote.candidate_nomination_id, func.count())
            .where(Vote.election_id == election_id)
            .group_by(Vote.post_key, Vote.candidate_nomination_id)
        )
    ).all()
    counts: dict[int, int] = {}
    for _, nomination_id, total in rows:
        counts[nomination_id] = total
    nominations = (
        (
            await db.execute(
                select(Nomination)
                .where(Nomination.election_id == election_id, Nomination.status == NOMINATION_STATUS_APPROVED)
                .options()
            )
        )
        .scalars()
        .all()
    )
    result: dict[str, dict] = {}
    for nomination in nominations:
        bucket = result.setdefault(
            nomination.post_key, {"candidates": [], "votes_total": 0}
        )
        votes = counts.get(nomination.id, 0)
        bucket["candidates"].append(
            {
                "nomination_id": nomination.id,
                "member_id": nomination.member_id,
                "votes": votes,
            }
        )
        bucket["votes_total"] += votes
    return result


async def _eligible_snapshot_count(db: AsyncSession, election_id: int) -> int:
    snapshots = (
        await db.execute(select(VoterSnapshot).where(VoterSnapshot.election_id == election_id))
    ).scalars().all()
    return sum(1 for s in snapshots if snapshot_eligible(s.snapshot))


def _ensure_transition(election: Election, expected: str) -> None:
    if election.status != expected:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"নির্বাচনের অবস্থা {election.status}; প্রয়োজন {expected}। "
            f"Election status is {election.status}, expected {expected}.",
        )


def select_winners(post_key: str, candidates: list[dict]) -> tuple[list[dict], int]:
    """Top-N plurality winners for a post with N seats (see post_seats).

    A candidate needs at least one vote (an unopposed candidate with zero
    votes is not elected). A tie straddling a seat cutoff leaves that seat -
    and any seat after it - unfilled (resolve via re-election), consistent
    with the single-seat tie rule. Returns (winners, skipped_seats)."""
    seats = post_seats(post_key)
    ranked = sorted((c for c in candidates if c["votes"] > 0), key=lambda c: c["votes"], reverse=True)
    winners: list[dict] = []
    for seat in range(min(seats, len(ranked))):
        votes = ranked[seat]["votes"]
        last_tied = max(i for i, c in enumerate(ranked) if c["votes"] == votes)
        if last_tied >= seats:
            break  # tie crosses the seat cutoff
        winners.append(ranked[seat])
    return winners, seats - len(winners)


async def _member_names(db: AsyncSession, member_ids) -> dict[int, str]:
    """One IN query for many member names (avoids N+1)."""
    ids = set(member_ids)
    if not ids:
        return {}
    rows = await db.execute(select(Member.id, Member.full_name).where(Member.id.in_(ids)))
    return dict(rows.all())


def _confirmation_notice_body(filled_posts: int, skipped_posts: int) -> str:
    """Notice text worded from the actual outcome, not assumed winners."""
    if filled_posts:
        body = (
            f"আনুষ্ঠানিকভাবে ফলাফল নিশ্চিত করা হয়েছে; {bn_digits(filled_posts)}টি পদের বিজয়ী "
            "কমিটি রেজিস্ট্রিতে যুক্ত হয়েছেন।"
        )
    else:
        body = "আনুষ্ঠানিকভাবে ফলাফল নিশ্চিত করা হয়েছে; কোনো পদে বিজয়ী নির্ধারিত হয়নি (০টি পদ পূরণ)।"
    if skipped_posts:
        body += (
            f" {bn_digits(skipped_posts)}টি পদ সমতা বা ভোটশূন্যতার কারণে অপূরিত; পুনর্নির্বাচন প্রয়োজন।"
        )
    return body


def _window_open(start: date, end: date, today: date) -> bool:
    return start <= today <= end


# ---------------------------------------------------------------------------
# Admin lifecycle
# ---------------------------------------------------------------------------


@router.post("/elections", status_code=status.HTTP_201_CREATED)
async def create_election(
    payload: ElectionCreate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("election.manage")),
) -> dict:
    await _validate_windows(payload)
    election = Election(
        title=payload.title.strip(),
        nomination_start=payload.nomination_start,
        nomination_end=payload.nomination_end,
        voting_start=payload.voting_start,
        voting_end=payload.voting_end,
        status=ELECTION_STATUS_DRAFT,
        created_by=admin.id,
    )
    db.add(election)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="election.created",
        entity_type="election",
        entity_id=str(election.id),
        detail=f"{election.title}: nominations {payload.nomination_start}..{payload.nomination_end}, "
        f"voting {payload.voting_start}..{payload.voting_end}",
    )
    await db.commit()
    await db.refresh(election)
    return election_to_dict(election)


@router.get("/elections")
async def list_elections(
    db: AsyncSession = Depends(get_db),
    _actor: AccountActor = Depends(get_account_actor),
) -> dict:
    elections = (
        (await db.execute(select(Election).order_by(Election.created_at.desc())))
        .scalars()
        .all()
    )
    return {"items": [election_to_dict(e) for e in elections], "today": _today()}


@router.post("/elections/{election_id}/open-nominations")
async def open_nominations(
    election_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("election.manage")),
) -> dict:
    election = await load_election(db, election_id)
    _ensure_transition(election, ELECTION_STATUS_DRAFT)
    election.status = ELECTION_STATUS_NOMINATIONS_OPEN
    record_audit(
        db, actor_admin_id=admin.id, action="election.nominations_opened",
        entity_type="election", entity_id=str(election.id), detail=election.title,
    )
    await db.commit()
    await db.refresh(election)
    return election_to_dict(election)


@router.post("/elections/{election_id}/close-nominations")
async def close_nominations(
    election_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("election.manage")),
) -> dict:
    """Closing nominations FREEZES the voter snapshot from currently-eligible
    members; from here on, eligibility follows the snapshot, not live state."""
    election = await load_election(db, election_id, for_update=True)
    _ensure_transition(election, ELECTION_STATUS_NOMINATIONS_OPEN)
    eligible_members = (
        (
            await db.execute(
                select(Member).where(
                    Member.status == MemberStatus.APPROVED,
                    Member.governance_status != GOVERNANCE_STATUS_SUSPENDED,
                    Member.member_class.in_((MEMBER_CLASS_FOUNDER, MEMBER_CLASS_GENERAL)),
                )
            )
        )
        .scalars()
        .all()
    )
    for member in eligible_members:
        db.add(
            VoterSnapshot(
                election_id=election.id,
                member_id=member.id,
                snapshot=member_snapshot(member),
            )
        )
    election.status = ELECTION_STATUS_NOMINATIONS_CLOSED
    record_audit(
        db, actor_admin_id=admin.id, action="election.snapshot_frozen",
        entity_type="election", entity_id=str(election.id),
        detail=f"{election.title}: voter snapshot frozen with {len(eligible_members)} eligible members",
    )
    await db.commit()
    await db.refresh(election)
    return election_to_dict(election, eligible_voters=len(eligible_members))


@router.post("/elections/nominations/{nomination_id}/decide")
async def decide_nomination(
    nomination_id: int,
    payload: NominationDecision,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("election.manage")),
) -> dict:
    nomination = (
        await db.execute(select(Nomination).where(Nomination.id == nomination_id))
    ).scalar_one_or_none()
    if nomination is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nomination not found.")
    election = await load_election(db, nomination.election_id)
    if election.status != ELECTION_STATUS_NOMINATIONS_OPEN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="মনোনয়ন উইন্ডো বন্ধ। Nominations can only be decided while the window is open.",
        )
    nomination.status = NOMINATION_STATUS_APPROVED if payload.approved else NOMINATION_STATUS_REJECTED
    nomination.decided_at = _now()
    nomination.decided_by = admin.id
    record_audit(
        db, actor_admin_id=admin.id, action=f"election.nomination_{nomination.status}",
        entity_type="nomination", entity_id=str(nomination.id),
        detail=f"election {election.id} post {nomination.post_key} member {nomination.member_id}",
    )
    await db.commit()
    await db.refresh(nomination)
    return {
        "id": nomination.id,
        "status": nomination.status,
        "post_key": nomination.post_key,
        "member_id": nomination.member_id,
    }


@router.post("/elections/{election_id}/open-voting")
async def open_voting(
    election_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("election.manage")),
) -> dict:
    election = await load_election(db, election_id)
    _ensure_transition(election, ELECTION_STATUS_NOMINATIONS_CLOSED)
    approved = (
        await db.execute(
            select(func.count())
            .select_from(Nomination)
            .where(Nomination.election_id == election.id, Nomination.status == NOMINATION_STATUS_APPROVED)
        )
    ).scalar_one()
    if not approved:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="কোনো অনুমোদিত প্রার্থী নেই। Cannot open voting without approved candidates.",
        )
    election.status = ELECTION_STATUS_VOTING
    record_audit(
        db, actor_admin_id=admin.id, action="election.voting_opened",
        entity_type="election", entity_id=str(election.id), detail=election.title,
    )
    await db.commit()
    await db.refresh(election)
    return election_to_dict(election)


@router.post("/elections/{election_id}/tabulate")
async def tabulate(
    election_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("election.manage")),
) -> dict:
    election = await load_election(db, election_id)
    _ensure_transition(election, ELECTION_STATUS_VOTING)
    election.status = ELECTION_STATUS_TABULATED
    counts = await _counts(db, election.id)
    record_audit(
        db, actor_admin_id=admin.id, action="election.tabulated",
        entity_type="election", entity_id=str(election.id),
        detail=f"{election.title}: counts computed for {len(counts)} post(s)",
    )
    await db.commit()
    await db.refresh(election)
    return election_to_dict(election, eligible_voters=await _eligible_snapshot_count(db, election.id))


@router.post("/elections/{election_id}/confirm")
async def confirm_results(
    election_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("election.manage")),
) -> dict:
    """Formal confirmation: the plurality winner of each contested post gets a
    new CommitteeTerm in the registry; a public notice is published; the whole
    action is audited."""
    election = await load_election(db, election_id, for_update=True)
    _ensure_transition(election, ELECTION_STATUS_TABULATED)
    counts = await _counts(db, election.id)
    created_terms: list[str] = []
    filled_posts = 0
    skipped: list[str] = []
    for post_key, bucket in counts.items():
        winners, skipped_seats = select_winners(post_key, bucket["candidates"])
        if skipped_seats:
            # tie at the cutoff or no votes: no automatic winner; re-election
            skipped.append(f"{post_key} ({skipped_seats} seat(s))")
        if winners:
            filled_posts += 1
        batch_ids: list[int] = []
        for winner in winners:
            term = CommitteeTerm(
                post_key=post_key,
                member_id=winner["member_id"],
                term_start=_today(),
                term_end=default_term_end(_today()),
                created_by=admin.id,
            )
            db.add(term)
            await db.flush()
            replaced = await supersede_current_term(db, post_key, term, exclude_ids=tuple(batch_ids))
            batch_ids.append(term.id)
            created_terms.append(
                f"{post_key}: member {winner['member_id']} ({winner['votes']} votes)"
                + (f", replaces term {replaced.id}" if replaced is not None else "")
            )
    election.status = ELECTION_STATUS_CONFIRMED
    election.confirmed_at = _now()
    record_audit(
        db, actor_admin_id=admin.id, action="election.confirmed",
        entity_type="election", entity_id=str(election.id),
        detail=f"{election.title}: confirmed; registry terms written: "
        + ("; ".join(created_terms) if created_terms else "none")
        + (f"; unfilled (tie/no votes): {', '.join(skipped)}" if skipped else ""),
    )
    await publish_resolution_book_notice(
        db,
        admin,
        title=f"🗳️ নির্বাচনের ফলাফল নিশ্চিত: {election.title}",
        body=_confirmation_notice_body(filled_posts, len(skipped)),
    )
    await db.commit()
    await db.refresh(election)
    return election_to_dict(election)


@router.post("/elections/{election_id}/cancel")
async def cancel_election(
    election_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("election.manage")),
) -> dict:
    election = await load_election(db, election_id)
    if election.status in (ELECTION_STATUS_CONFIRMED, ELECTION_STATUS_CANCELLED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"এই অবস্থায় বাতিল করা যায় না ({election.status}).",
        )
    election.status = ELECTION_STATUS_CANCELLED
    record_audit(
        db, actor_admin_id=admin.id, action="election.cancelled",
        entity_type="election", entity_id=str(election.id), detail=election.title,
    )
    await db.commit()
    await db.refresh(election)
    return election_to_dict(election)


@router.get("/elections/{election_id}/admin")
async def election_admin_detail(
    election_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("election.manage")),
) -> dict:
    election = await load_election(db, election_id)
    nominations = (
        (
            await db.execute(
                select(Nomination)
                .where(Nomination.election_id == election.id)
                .order_by(Nomination.post_key, Nomination.id)
            )
        )
        .scalars()
        .all()
    )
    name_rows = await db.execute(select(Member.id, Member.full_name))
    names = dict(name_rows.all())
    counts = await _counts(db, election.id)
    complaints = (
        (
            await db.execute(
                select(ElectionComplaint)
                .where(ElectionComplaint.election_id == election.id)
                .order_by(ElectionComplaint.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return {
        **election_to_dict(election, eligible_voters=await _eligible_snapshot_count(db, election.id)),
        "nominations": [
            {
                "id": n.id,
                "post_key": n.post_key,
                "member_id": n.member_id,
                "member_name": names.get(n.member_id),
                "status": n.status,
                "statement": n.statement,
                "created_at": n.created_at,
            }
            for n in nominations
        ],
        "counts": counts,
        "complaints": [
            {
                "id": c.id,
                "complainant_member_id": c.complainant_member_id,
                "against": c.against,
                "subject": c.subject,
                "details": c.details,
                "status": c.status,
                "resolution": c.resolution,
                "created_at": c.created_at,
            }
            for c in complaints
        ],
    }


@router.get("/elections/{election_id}/result-sheet.pdf")
async def result_sheet_pdf(
    election_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("election.manage")),
) -> Response:
    election = await load_election(db, election_id)
    if election.status not in (ELECTION_STATUS_TABULATED, ELECTION_STATUS_CONFIRMED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ফলাফল শুধু ট্যাবুলেশন/নিশ্চিতকরণের পরে পাওয়া যায়। "
            "Result sheet is available only after tabulation.",
        )
    counts = await _counts(db, election.id)
    names = await _member_names(db, (c["member_id"] for b in counts.values() for c in b["candidates"]))
    rows: list[ResultRow] = []
    for post in COUNCIL_POSTS:
        bucket = counts.get(post["key"])
        if not bucket:
            continue
        top_votes = max(c["votes"] for c in bucket["candidates"])
        leaders = [c for c in bucket["candidates"] if c["votes"] == top_votes]
        winners, _ = select_winners(post["key"], bucket["candidates"])
        winner_ids = {w["nomination_id"] for w in winners}
        candidates = [
            {
                "name": names.get(cand["member_id"]),
                "votes": cand["votes"],
                "winner": election.status == ELECTION_STATUS_CONFIRMED
                and cand["nomination_id"] in winner_ids,
            }
            for cand in bucket["candidates"]
        ]
        rows.append(
            ResultRow(
                post_key=post["key"],
                post_label=post["bn"],
                candidates=tuple(candidates),
                votes_total=bucket["votes_total"],
                winner_name=None,
                tie=len(leaders) > 1,
            )
        )
    confirmed_label = (
        election.confirmed_at.astimezone(_DHAKA).strftime("%d-%m-%Y %H:%M")
        if election.confirmed_at
        else None
    )
    data = ResultSheetData(
        org_name=settings.organization_name,
        election_title=election.title,
        generated_at_label=datetime.now(_DHAKA).strftime("%d-%m-%Y %H:%M"),
        nomination_window=f"{bn_date(election.nomination_start)} – {bn_date(election.nomination_end)}",
        voting_window=f"{bn_date(election.voting_start)} – {bn_date(election.voting_end)}",
        confirmed=election.status == ELECTION_STATUS_CONFIRMED,
        confirmed_at_label=confirmed_label,
        eligible_voters=await _eligible_snapshot_count(db, election.id),
        rows=tuple(rows),
    )
    now = datetime.now(_DHAKA)
    return Response(
        content=build_result_sheet_pdf(data),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="election-result-{election.id}-{now:%Y%m%d}.pdf"'
        },
    )


@router.post("/elections/complaints/{complaint_id}/decide")
async def decide_complaint(
    complaint_id: int,
    payload: ComplaintDecision,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("election.manage")),
) -> dict:
    complaint = (
        await db.execute(select(ElectionComplaint).where(ElectionComplaint.id == complaint_id))
    ).scalar_one_or_none()
    if complaint is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found.")
    if complaint.status != COMPLAINT_STATUS_SUBMITTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"অভিযোগটি ইতিমধ্যে নিষ্পত্তি হয়েছে ({complaint.status}). "
            "Complaint has already been decided.",
        )
    complaint.status = payload.status
    complaint.resolution = payload.resolution.strip()
    complaint.decided_at = _now()
    complaint.decided_by = admin.id
    record_audit(
        db, actor_admin_id=admin.id, action=f"election.complaint_{payload.status}",
        entity_type="election_complaint", entity_id=str(complaint.id),
        detail=f"election {complaint.election_id}: {_short(payload.resolution)}",
    )
    await db.commit()
    await db.refresh(complaint)
    return {"id": complaint.id, "status": complaint.status}


def _short(text: str, limit: int = 80) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


# ---------------------------------------------------------------------------
# Member endpoints
# ---------------------------------------------------------------------------


@router.get("/elections/{election_id}/me")
async def election_for_member(
    election_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> dict:
    """Election view for the logged-in member: own eligibility (per the frozen
    snapshot once nominations closed), own nominations, own votes, and
    published results (counts only) once tabulated/confirmed."""
    election = await load_election(db, election_id)
    today = _today()

    my_nominations = [
        {"id": n.id, "post_key": n.post_key, "status": n.status}
        for n in election.nominations if n.member_id == member.id
    ]
    my_votes = (
        (
            await db.execute(
                select(Vote.post_key).where(
                    Vote.election_id == election.id, Vote.voter_member_id == member.id
                )
            )
        )
        .scalars()
        .all()
    )

    eligible = is_election_eligible(member)
    eligibility_source = "live"
    if election.status in (
        ELECTION_STATUS_NOMINATIONS_CLOSED, ELECTION_STATUS_VOTING,
        ELECTION_STATUS_TABULATED, ELECTION_STATUS_CONFIRMED,
    ):
        snap = (
            await db.execute(
                select(VoterSnapshot).where(
                    VoterSnapshot.election_id == election.id,
                    VoterSnapshot.member_id == member.id,
                )
            )
        ).scalar_one_or_none()
        if snap is not None:
            eligible = snapshot_eligible(snap.snapshot)
            eligibility_source = "snapshot"
        else:
            eligible = False
            eligibility_source = "snapshot"

    results = None
    if election.status in (ELECTION_STATUS_TABULATED, ELECTION_STATUS_CONFIRMED):
        counts = await _counts(db, election.id)
        names = await _member_names(db, (c["member_id"] for b in counts.values() for c in b["candidates"]))
        results = []
        for post_key, bucket in counts.items():
            candidates = [
                {"member_id": c["member_id"], "name": names.get(c["member_id"]), "votes": c["votes"]}
                for c in bucket["candidates"]
            ]
            results.append({"post_key": post_key, "candidates": candidates, "votes_total": bucket["votes_total"]})

    # Approved candidate roster (names + ids only - never vote counts) so a
    # voter can actually fill the ballot once the nomination window closes.
    candidates_roster = None
    if election.status in (
        ELECTION_STATUS_NOMINATIONS_CLOSED,
        ELECTION_STATUS_VOTING,
        ELECTION_STATUS_TABULATED,
        ELECTION_STATUS_CONFIRMED,
    ):
        approved = (
            (
                await db.execute(
                    select(Nomination)
                    .where(
                        Nomination.election_id == election.id,
                        Nomination.status == NOMINATION_STATUS_APPROVED,
                    )
                    .order_by(Nomination.post_key, Nomination.id)
                )
            )
            .scalars()
            .all()
        )
        roster_names = dict(
            (
                await db.execute(
                    select(Member.id, Member.full_name).where(
                        Member.id.in_({n.member_id for n in approved})
                    )
                )
            ).all()
        )
        roster: dict[str, list] = {}
        for nomination in approved:
            roster.setdefault(nomination.post_key, []).append(
                {
                    "nomination_id": nomination.id,
                    "member_id": nomination.member_id,
                    "name": roster_names.get(nomination.member_id),
                }
            )
        candidates_roster = [
            {"post_key": post_key, "candidates": cands} for post_key, cands in roster.items()
        ]

    return {
        **election_to_dict(election),
        "today": today,
        "eligible": eligible,
        "eligibility_source": eligibility_source,
        "my_nominations": my_nominations,
        "voted_posts": my_votes,  # post keys only - never ballot content
        "candidates": candidates_roster,
        "results": results,
    }


@router.post("/elections/{election_id}/nominations", status_code=status.HTTP_201_CREATED)
async def self_nominate(
    election_id: int,
    payload: NominationCreate,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> dict:
    election = await load_election(db, election_id)
    if election.status != ELECTION_STATUS_NOMINATIONS_OPEN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="মনোনয়ন উইন্ডো খোলা নেই। Nominations are not open.",
        )
    if not _window_open(election.nomination_start, election.nomination_end, _today()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="মনোনয়নের সময়সীমার বাইরে। Outside the nomination window.",
        )
    if not is_election_eligible(member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="আপনি নির্বাচনে প্রার্থী হওয়ার যোগ্য নন। You are not eligible to stand.",
        )
    await _validate_post(payload.post_key)
    duplicate = (
        await db.execute(
            select(Nomination).where(
                Nomination.election_id == election.id,
                Nomination.post_key == payload.post_key,
                Nomination.member_id == member.id,
            )
        )
    ).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="এই পদে আপনি ইতিমধ্যে মনোনয়ন দিয়েছেন। Already nominated for this post.",
        )
    nomination = Nomination(
        election_id=election.id,
        post_key=payload.post_key,
        member_id=member.id,
        status=NOMINATION_STATUS_PENDING,
        statement=payload.statement,
    )
    db.add(nomination)
    await db.flush()
    record_audit(
        db, actor_admin_id=None,
        action="election.nomination_filed",
        entity_type="nomination", entity_id=str(nomination.id),
        detail=f"election {election.id} post {payload.post_key} by member {member.id}",
    )
    await db.commit()
    await db.refresh(nomination)
    return {"id": nomination.id, "post_key": nomination.post_key, "status": nomination.status}


@router.post("/elections/{election_id}/vote")
async def cast_vote(
    election_id: int,
    payload: VoteCast,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> dict:
    """One SECRET ballot per snapshot-eligible member per post. 409 on
    duplicate or closed window, 403 when the frozen snapshot says ineligible.
    Ballot content is stored but never read back to anyone."""
    election = await load_election(db, election_id)
    if election.status != ELECTION_STATUS_VOTING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ভোটগ্রহণ চলছে না। Voting is not open.",
        )
    if not _window_open(election.voting_start, election.voting_end, _today()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ভোটগ্রহণের সময়সীমার বাইরে। Outside the voting window.",
        )
    await _validate_post(payload.post_key)

    snap = (
        await db.execute(
            select(VoterSnapshot).where(
                VoterSnapshot.election_id == election.id,
                VoterSnapshot.member_id == member.id,
            )
        )
    ).scalar_one_or_none()
    if snap is None or not snapshot_eligible(snap.snapshot):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="স্ন্যাপশট অনুযায়ী আপনি ভোট দেওয়ার যোগ্য নন। "
            "You are not eligible to vote in this election (per the frozen snapshot).",
        )
    existing = (
        await db.execute(
            select(Vote.id).where(
                Vote.election_id == election.id,
                Vote.post_key == payload.post_key,
                Vote.voter_member_id == member.id,
            )
        )
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="এই পদে আপনি ইতিমধ্যে ভোট দিয়েছেন। You have already voted for this post.",
        )
    nomination = (
        await db.execute(
            select(Nomination).where(
                Nomination.id == payload.nomination_id,
                Nomination.election_id == election.id,
                Nomination.post_key == payload.post_key,
                Nomination.status == NOMINATION_STATUS_APPROVED,
            )
        )
    ).scalar_one_or_none()
    if nomination is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="প্রার্থী পাওয়া যায়নি। Candidate not found for this post.",
        )
    vote = Vote(
        election_id=election.id,
        post_key=payload.post_key,
        voter_member_id=member.id,
        candidate_nomination_id=nomination.id,
    )
    db.add(vote)
    try:
        await db.flush()
    except IntegrityError:
        # The unique constraint is the last line of defence against a
        # double ballot (e.g. two tabs racing).
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="এই পদে আপনি ইতিমধ্যে ভোট দিয়েছেন। You have already voted for this post.",
        )
    record_audit(
        db, actor_admin_id=None,
        action="election.ballot_cast",
        entity_type="election", entity_id=str(election.id),
        detail=f"election {election.id} post {payload.post_key}: one ballot cast (content secret)",
    )
    await db.commit()
    return {"voted": True, "post_key": payload.post_key}


@router.post("/elections/{election_id}/complaints", status_code=status.HTTP_201_CREATED)
async def file_complaint(
    election_id: int,
    payload: ComplaintCreate,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_member),
) -> dict:
    election = await load_election(db, election_id)
    complaint = ElectionComplaint(
        election_id=election.id,
        complainant_member_id=member.id,
        against=payload.against,
        subject=payload.subject.strip(),
        details=payload.details.strip(),
        status=COMPLAINT_STATUS_SUBMITTED,
    )
    db.add(complaint)
    await db.flush()
    record_audit(
        db, actor_admin_id=None,
        action="election.complaint_filed",
        entity_type="election_complaint", entity_id=str(complaint.id),
        detail=f"election {election.id} by member {member.id}: {_short(payload.subject)}",
    )
    await db.commit()
    await db.refresh(complaint)
    return {"id": complaint.id, "status": complaint.status}
