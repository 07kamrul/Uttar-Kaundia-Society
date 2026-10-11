"""Module 6 — গঠনতন্ত্র সংশোধনী ট্র্যাকার (constitution amendment tracker).

ConstitutionVersion is an append-only register: adoption always INSERTs a new
row (version_no + 1); no endpoint ever rewrites full_text. AmendmentProposal
carries one proposal through submitted -> scheduled (a properly-noticed
meeting attached) -> adopted | rejected | withdrawn. Dissolution proposals
are allowed but their adoption only records the vote - execution stays a
manual, legally-advised process (governance.DISSOLUTION_NOTICE_BN).
"""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.services.governance import MAJORITY_SIMPLE

AMENDMENT_PROPOSAL_SUBMITTED = "submitted"
AMENDMENT_PROPOSAL_SCHEDULED = "scheduled"
AMENDMENT_PROPOSAL_ADOPTED = "adopted"
AMENDMENT_PROPOSAL_REJECTED = "rejected"
AMENDMENT_PROPOSAL_WITHDRAWN = "withdrawn"
AMENDMENT_PROPOSAL_DRAFT = "draft"

# Dissolution proposals may be created but adoption never executes anything.
AMENDMENT_KIND_ORDINARY = "ordinary"
AMENDMENT_KIND_DISSOLUTION = "dissolution"


class ConstitutionVersion(Base):
    """One adopted text of the গঠনতন্ত্র. Append-only: v1 is seeded on first
    use by an admin, every adoption adds the next version_no."""

    __tablename__ = "constitution_versions"
    __table_args__ = (UniqueConstraint("version_no", name="uq_constitution_version_no"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    full_text: Mapped[str] = mapped_column(Text, nullable=False)
    changes_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    adopted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # The proposal whose adoption produced this version (NULL for seeded v1).
    # use_alter=True breaks the create-order cycle: amendment_proposals also
    # references constitution_versions (current/adopted version).
    source_amendment_id: Mapped[int | None] = mapped_column(
        ForeignKey("amendment_proposals.id", ondelete="SET NULL", use_alter=True), nullable=True
    )
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    source_amendment = relationship("AmendmentProposal", foreign_keys=[source_amendment_id])


class AmendmentProposal(Base):
    """One proposed change to the constitution, with its vote record."""

    __tablename__ = "amendment_proposals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    proposal_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    proposed_text: Mapped[str] = mapped_column(Text, nullable=False)
    # The version the proposal was made against (current at creation).
    current_version_id: Mapped[int | None] = mapped_column(
        ForeignKey("constitution_versions.id", ondelete="SET NULL"), nullable=True
    )

    proposed_by_member_id: Mapped[int | None] = mapped_column(
        ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    proposed_by_admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=AMENDMENT_PROPOSAL_SUBMITTED, index=True
    )
    is_dissolution: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # The decision MUST happen in a properly-notified meeting: attaching is
    # rejected unless the Meeting has notice_published_at set, and deciding
    # without a meeting is rejected too.
    meeting_id: Mapped[int | None] = mapped_column(
        ForeignKey("meetings.id", ondelete="SET NULL"), nullable=True
    )
    meeting_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    votes_for: Mapped[int | None] = mapped_column(Integer, nullable=True)
    votes_against: Mapped[int | None] = mapped_column(Integer, nullable=True)
    votes_abstain: Mapped[int | None] = mapped_column(Integer, nullable=True)
    required_majority: Mapped[str] = mapped_column(
        String(16), nullable=False, default=MAJORITY_SIMPLE, server_default=MAJORITY_SIMPLE
    )

    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    adopted_version_id: Mapped[int | None] = mapped_column(
        ForeignKey("constitution_versions.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    meeting = relationship("Meeting", lazy="joined")
    current_version = relationship("ConstitutionVersion", foreign_keys=[current_version_id])
    adopted_version = relationship("ConstitutionVersion", foreign_keys=[adopted_version_id])
    proposed_by_member = relationship("Member", lazy="joined")
