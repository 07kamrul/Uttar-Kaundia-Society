"""Module 1 models: membership applications, fee waivers, membership
actions (suspension/termination workflow) and membership appeals.

Statuses are plain strings (mirrors member_class/governance_status on the
Member model) so SQLite tests and Postgres behave identically without enums.
"""

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# --- MembershipApplication --------------------------------------------------

APP_STATUS_RECEIVED = "received"
APP_STATUS_UNDER_REVIEW = "under_review"
APP_STATUS_APPROVED = "approved"
APP_STATUS_REJECTED = "rejected"
APPLICATION_STATUSES = (
    APP_STATUS_RECEIVED,
    APP_STATUS_UNDER_REVIEW,
    APP_STATUS_APPROVED,
    APP_STATUS_REJECTED,
)

OWNERSHIP_TYPES = ("owner", "co_owner", "inheritance", "purchased", "other")


class MembershipApplication(Base):
    __tablename__ = "membership_applications"
    __table_args__ = (Index("ix_membership_applications_status", "status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    application_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)

    # Applicant identity
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    father_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mother_name: Mapped[str] = mapped_column(String(255), nullable=False)
    spouse_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mobile: Mapped[str] = mapped_column(String(32), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)

    # Structured address (same shape as the members table)
    address_house: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_road: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_post_office: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_upazila: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_district: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_division: Mapped[str | None] = mapped_column(String(255), nullable=True)

    ownership_type: Mapped[str] = mapped_column(String(32), nullable=False)
    nid_document_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    ownership_document_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    consent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Link to the member row once the application is approved (or when an
    # existing member's record is being tracked through the review workflow).
    member_id: Mapped[int | None] = mapped_column(
        ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )

    status: Mapped[str] = mapped_column(
        String(24), default=APP_STATUS_RECEIVED, nullable=False
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # SLA: submitted + 20 working days (app.services.governance.add_working_days).
    sla_due_at: Mapped[date] = mapped_column(Date, nullable=False)

    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by_admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id"), nullable=True
    )
    notification_status: Mapped[str | None] = mapped_column(String(16), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# --- FeeWaiver ---------------------------------------------------------------

WAIVER_TYPE_WAIVER = "waiver"
WAIVER_TYPE_INSTALLMENT = "installment"
WAIVER_TYPES = (WAIVER_TYPE_WAIVER, WAIVER_TYPE_INSTALLMENT)

WAIVER_STATUS_PENDING = "pending"
WAIVER_STATUS_APPROVED = "approved"
WAIVER_STATUS_REJECTED = "rejected"
WAIVER_STATUSES = (WAIVER_STATUS_PENDING, WAIVER_STATUS_APPROVED, WAIVER_STATUS_REJECTED)


class FeeWaiver(Base):
    """Member-requested fee waiver or installment plan. `reason` is REQUIRED -
    a waiver without a recorded justification must never reach the committee."""

    __tablename__ = "fee_waivers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(16), nullable=False)  # waiver | installment
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    # waiver: how many months; installment: plan JSON (list of {amount, due_date})
    months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    installment_plan: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON

    status: Mapped[str] = mapped_column(String(16), default=WAIVER_STATUS_PENDING, nullable=False, index=True)
    decided_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# --- MembershipAction (written-notice suspension/termination workflow) ------

ACTION_TYPE_SUSPEND = "suspend"
ACTION_TYPE_TERMINATE = "terminate"
ACTION_TYPES = (ACTION_TYPE_SUSPEND, ACTION_TYPE_TERMINATE)

ACTION_STATUS_DRAFT = "draft"
ACTION_STATUS_NOTICED = "noticed"
ACTION_STATUS_AWAITING_RESPONSE = "awaiting_response"
ACTION_STATUS_DECIDED = "decided"
ACTION_STATUS_CANCELLED = "cancelled"
ACTION_STATUSES = (
    ACTION_STATUS_DRAFT,
    ACTION_STATUS_NOTICED,
    ACTION_STATUS_AWAITING_RESPONSE,
    ACTION_STATUS_DECIDED,
    ACTION_STATUS_CANCELLED,
)


class MembershipAction(Base):
    """Written-notice-before-suspension workflow. Never gates the member's own
    authentication or land-info access - it is a governance record."""

    __tablename__ = "membership_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(16), nullable=False)  # suspend | terminate
    reason: Mapped[str] = mapped_column(Text, nullable=False)

    written_notice_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # written notice + 15 working days
    response_deadline: Mapped[date | None] = mapped_column(Date, nullable=True)

    member_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    member_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[str] = mapped_column(String(24), default=ACTION_STATUS_DRAFT, nullable=False, index=True)
    decision: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notification_email_sent: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# --- MembershipAppeal --------------------------------------------------------

APPEAL_STATUS_SUBMITTED = "submitted"
APPEAL_STATUS_UNDER_REVIEW = "under_review"
APPEAL_STATUS_UPHELD = "upheld"
APPEAL_STATUS_OVERTURNED = "overturned"
APPEAL_STATUSES = (
    APPEAL_STATUS_SUBMITTED,
    APPEAL_STATUS_UNDER_REVIEW,
    APPEAL_STATUS_UPHELD,
    APPEAL_STATUS_OVERTURNED,
)
APPEAL_STATUS_DECIDED_STATES = (APPEAL_STATUS_UPHELD, APPEAL_STATUS_OVERTURNED)


class MembershipAppeal(Base):
    __tablename__ = "membership_appeals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    membership_action_id: Mapped[int | None] = mapped_column(
        ForeignKey("membership_actions.id", ondelete="CASCADE"), nullable=True, index=True
    )
    application_id: Mapped[int | None] = mapped_column(
        ForeignKey("membership_applications.id", ondelete="CASCADE"), nullable=True, index=True
    )
    filed_by_member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    grounds: Mapped[str] = mapped_column(Text, nullable=False)
    filed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # decision date + 30 calendar days (APPEAL_WINDOW_DAYS)
    window_expires_at: Mapped[date] = mapped_column(Date, nullable=False)

    assigned_reviewer_admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(16), default=APPEAL_STATUS_SUBMITTED, nullable=False, index=True
    )
    decision: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notification_status: Mapped[str | None] = mapped_column(String(16), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
