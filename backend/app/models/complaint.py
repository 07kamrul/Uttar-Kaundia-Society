"""Module 5 models: complaints (including the land-protection form, সংযুক্তি ৩)
and member data-correction requests.
"""

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

COMPLAINT_SUBMITTED = "submitted"
COMPLAINT_ACKNOWLEDGED = "acknowledged"
COMPLAINT_INVESTIGATING = "investigating"
COMPLAINT_RESOLVED = "resolved"
COMPLAINT_REJECTED = "rejected"
COMPLAINT_CLOSED = "closed"
COMPLAINT_STATUSES = (
    COMPLAINT_SUBMITTED,
    COMPLAINT_ACKNOWLEDGED,
    COMPLAINT_INVESTIGATING,
    COMPLAINT_RESOLVED,
    COMPLAINT_REJECTED,
    COMPLAINT_CLOSED,
)


class Complaint(Base):
    __tablename__ = "complaints"
    __table_args__ = (
        Index("ix_complaints_status", "status"),
        Index("ix_complaints_complainant", "complainant_member_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # KRMF-AB-YYYY-####, sequence per year (complaints service)
    complaint_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)

    complainant_member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    details: Mapped[str] = mapped_column(Text, nullable=False)

    is_land_protection: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Full সংযুক্তি-৩ payload (JSON) when is_land_protection is true.
    form_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Evidence file name shown on download.
    evidence_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    accused_admin_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id"), nullable=True)
    assigned_admin_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id"), nullable=True)

    status: Mapped[str] = mapped_column(String(24), default=COMPLAINT_SUBMITTED, nullable=False)

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # submitted + 3 working days / first update within +15 working days
    sla_ack_due: Mapped[date] = mapped_column(Date, nullable=False)
    sla_update_due: Mapped[date] = mapped_column(Date, nullable=False)

    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    first_update_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


CORRECTION_STATUS_PENDING = "pending"
CORRECTION_STATUS_APPLIED = "applied"
CORRECTION_STATUS_REJECTED = "rejected"
CORRECTION_STATUSES = (
    CORRECTION_STATUS_PENDING,
    CORRECTION_STATUS_APPLIED,
    CORRECTION_STATUS_REJECTED,
)


class DataCorrectionRequest(Base):
    """Member's "সংশোধনের অনুরোধ": the committee applies corrections manually;
    this table only records the request and its handling (audited)."""

    __tablename__ = "data_correction_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field: Mapped[str] = mapped_column(String(64), nullable=False)
    requested_value: Mapped[str] = mapped_column(String(500), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[str] = mapped_column(String(16), default=CORRECTION_STATUS_PENDING, nullable=False, index=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    handled_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id"), nullable=True)
    handled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
