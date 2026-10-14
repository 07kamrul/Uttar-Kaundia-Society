"""Counts behind the admin "today's work" landing (`GET /api/admin/today`).

COUNT queries only, on indexed columns, nothing cached: at most ten statements
for an account holding every permission. A section is computed only when the
caller holds its permission; otherwise it is None and the client hides that card.
"""

from collections.abc import Collection
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, case, func, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.committee_election import CommitteeTerm
from app.models.complaint import (
    COMPLAINT_ACKNOWLEDGED,
    COMPLAINT_INVESTIGATING,
    COMPLAINT_SUBMITTED,
    Complaint,
)
from app.models.cost_share_payment import CostSharePayment
from app.models.installment_payment import PAYMENT_STATUS_PENDING, InstallmentPayment
from app.models.member import Member, MemberStatus
from app.models.membership_appeal import APP_STATUS_RECEIVED, APP_STATUS_UNDER_REVIEW, MembershipApplication
from app.models.phone_fix import PhoneFixQueue
from app.models.plot_boundary import PlotBoundary
from app.models.property import Property
from app.models.property_change_request import PropertyChangeRequest, PropertyChangeStatus
from app.services.dag_guard import _needs_dag_clause
from app.services.governance import DUE_SOON_WINDOW_DAYS

COMMITTEE_WINDOW_DAYS = 60

PERM_REGISTRATIONS = "membership.review"
PERM_APPLICATIONS = "membership_application.manage"
PERM_PAYMENTS = "manage_finance"
PERM_COMPLAINTS = "complaint.manage"
PERM_PROPERTY_REQUESTS = "property.review"
PERM_BOUNDARIES = "boundary.review"
PERM_COMMITTEE = "committee_registry.manage"
PERM_PHONE_FIXES = "member.manage"

_OPEN_COMPLAINT_STATUSES = (COMPLAINT_SUBMITTED, COMPLAINT_ACKNOWLEDGED, COMPLAINT_INVESTIGATING)


async def _scalar(db: AsyncSession, statement) -> int:
    return int((await db.execute(statement)).scalar_one() or 0)


async def _applications(db: AsyncSession, permissions: Collection[str]) -> dict | None:
    registrations = (
        await _scalar(db, select(func.count(Member.id)).where(Member.status == MemberStatus.PENDING))
        if PERM_REGISTRATIONS in permissions
        else None
    )
    open_applications = (
        await _scalar(
            db,
            select(func.count(MembershipApplication.id)).where(
                MembershipApplication.status.in_((APP_STATUS_RECEIVED, APP_STATUS_UNDER_REVIEW))
            ),
        )
        if PERM_APPLICATIONS in permissions
        else None
    )
    if registrations is None and open_applications is None:
        return None
    return {
        "registrations_pending": registrations,
        "membership_applications_open": open_applications,
        "total": (registrations or 0) + (open_applications or 0),
    }


async def _needs_dag(db: AsyncSession) -> int:
    return await _scalar(
        db,
        select(func.count(func.distinct(Property.member_id)))
        .join(Member, Member.id == Property.member_id)
        .where(Member.status == MemberStatus.PENDING, *_needs_dag_clause()),
    )


async def _payment_verifications(db: AsyncSession) -> dict:
    installment = await _scalar(
        db,
        select(func.count(InstallmentPayment.id)).where(InstallmentPayment.status == PAYMENT_STATUS_PENDING),
    )
    cost_share = await _scalar(
        db,
        select(func.count(CostSharePayment.id)).where(CostSharePayment.status == PAYMENT_STATUS_PENDING),
    )
    return {"installment": installment, "cost_share": cost_share, "total": installment + cost_share}


async def _complaints(db: AsyncSession, today: date) -> dict:
    """One query. `overdue`: an unmet deadline already passed. `due_soon`: not
    overdue, but an unmet deadline falls within DUE_SOON_WINDOW_DAYS (the same
    thresholds as `governance.sla_status`)."""
    horizon = today + timedelta(days=DUE_SOON_WINDOW_DAYS)
    ack_pending = Complaint.acknowledged_at.is_(None)
    update_pending = Complaint.first_update_at.is_(None)
    overdue = or_(
        and_(ack_pending, Complaint.sla_ack_due < today),
        and_(update_pending, Complaint.sla_update_due < today),
    )
    due_within_window = or_(
        and_(ack_pending, Complaint.sla_ack_due <= horizon),
        and_(update_pending, Complaint.sla_update_due <= horizon),
    )
    row = (
        await db.execute(
            select(
                func.count(Complaint.id),
                func.sum(case((overdue, 1), else_=0)),
                func.sum(case((and_(not_(overdue), due_within_window), 1), else_=0)),
            ).where(Complaint.status.in_(_OPEN_COMPLAINT_STATUSES))
        )
    ).one()
    return {"open": int(row[0] or 0), "due_soon": int(row[2] or 0), "overdue": int(row[1] or 0)}


async def _committee_terms(db: AsyncSession, today: date) -> dict:
    """Current terms only: not caretaker, not replaced. Ending today is still
    active (matches `CommitteeTerm.computed_status`)."""
    window_end = today + timedelta(days=COMMITTEE_WINDOW_DAYS)
    row = (
        await db.execute(
            select(
                func.sum(case((CommitteeTerm.term_end < today, 1), else_=0)),
                func.sum(
                    case((and_(CommitteeTerm.term_end >= today, CommitteeTerm.term_end <= window_end), 1), else_=0)
                ),
            ).where(
                CommitteeTerm.is_caretaker.is_(False),
                CommitteeTerm.replaced_by_term_id.is_(None),
            )
        )
    ).one()
    return {
        "expiring_soon": int(row[1] or 0),
        "expired": int(row[0] or 0),
        "window_days": COMMITTEE_WINDOW_DAYS,
    }


async def build_today(
    db: AsyncSession, permissions: Collection[str], *, now: datetime | None = None
) -> dict:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    today = now.date()
    allowed = permissions.__contains__

    return {
        "as_of": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "applications": await _applications(db, permissions),
        "needs_dag": await _needs_dag(db) if allowed(PERM_REGISTRATIONS) else None,
        "payment_verifications": await _payment_verifications(db) if allowed(PERM_PAYMENTS) else None,
        "complaints": await _complaints(db, today) if allowed(PERM_COMPLAINTS) else None,
        "property_requests": (
            {
                "pending": await _scalar(
                    db,
                    select(func.count(PropertyChangeRequest.id)).where(
                        PropertyChangeRequest.status == PropertyChangeStatus.PENDING
                    ),
                )
            }
            if allowed(PERM_PROPERTY_REQUESTS)
            else None
        ),
        "boundaries": (
            {
                "pending": await _scalar(
                    db,
                    select(func.count(PlotBoundary.id)).where(
                        PlotBoundary.is_deleted.is_(False), PlotBoundary.pending_version_id.is_not(None)
                    ),
                )
            }
            if allowed(PERM_BOUNDARIES)
            else None
        ),
        "committee_terms": await _committee_terms(db, today) if allowed(PERM_COMMITTEE) else None,
        "phone_fixes": (
            {"open": await _scalar(db, select(func.count(PhoneFixQueue.id)).where(PhoneFixQueue.resolved_at.is_(None)))}
            if allowed(PERM_PHONE_FIXES)
            else None
        ),
    }
