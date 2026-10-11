"""Module 2 — কমিটি/পরিষদ রেজিস্ট্রি ও নির্বাচন (committee registry and
elections).

CommitteeTerm holds one holder's tenure of one of the 11 constitutional
council posts (app.services.governance.COUNCIL_POSTS). PostVacancy carries
the resignation-acknowledgement and removal-with-right-to-respond workflow.
Election / Nomination / VoterSnapshot / Vote / ElectionComplaint implement
the secret-ballot election lifecycle: ballot content is never exposed, only
counts after tabulation.
"""

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

TERM_STATUS_ACTIVE = "active"
TERM_STATUS_EXPIRED = "expired"
TERM_STATUS_CARETAKER = "caretaker"
TERM_STATUS_VACANT = "vacant"

VACANCY_TYPE_RESIGNATION = "resignation"
VACANCY_TYPE_REMOVAL = "removal"
VACANCY_TYPES = (VACANCY_TYPE_RESIGNATION, VACANCY_TYPE_REMOVAL)

VACANCY_STATUS_PENDING_ACK = "pending_acknowledgement"
VACANCY_STATUS_ACKNOWLEDGED = "acknowledged"
VACANCY_STATUS_INVESTIGATION = "investigation"
VACANCY_STATUS_DECIDED = "decided"
VACANCY_STATUS_CANCELLED = "cancelled"
VACANCY_STATUSES = (
    VACANCY_STATUS_PENDING_ACK,
    VACANCY_STATUS_ACKNOWLEDGED,
    VACANCY_STATUS_INVESTIGATION,
    VACANCY_STATUS_DECIDED,
    VACANCY_STATUS_CANCELLED,
)

ELECTION_STATUS_DRAFT = "draft"
ELECTION_STATUS_NOMINATIONS_OPEN = "nominations_open"
ELECTION_STATUS_NOMINATIONS_CLOSED = "nominations_closed"
ELECTION_STATUS_VOTING = "voting"
ELECTION_STATUS_TABULATED = "tabulated"
ELECTION_STATUS_CONFIRMED = "confirmed"
ELECTION_STATUS_CANCELLED = "cancelled"
ELECTION_STATUSES = (
    ELECTION_STATUS_DRAFT,
    ELECTION_STATUS_NOMINATIONS_OPEN,
    ELECTION_STATUS_NOMINATIONS_CLOSED,
    ELECTION_STATUS_VOTING,
    ELECTION_STATUS_TABULATED,
    ELECTION_STATUS_CONFIRMED,
    ELECTION_STATUS_CANCELLED,
)

NOMINATION_STATUS_PENDING = "pending"
NOMINATION_STATUS_APPROVED = "approved"
NOMINATION_STATUS_REJECTED = "rejected"
NOMINATION_STATUSES = (NOMINATION_STATUS_PENDING, NOMINATION_STATUS_APPROVED, NOMINATION_STATUS_REJECTED)

COMPLAINT_STATUS_SUBMITTED = "submitted"
COMPLAINT_STATUS_RESOLVED = "resolved"
COMPLAINT_STATUS_REJECTED = "rejected"
COMPLAINT_STATUSES = (COMPLAINT_STATUS_SUBMITTED, COMPLAINT_STATUS_RESOLVED, COMPLAINT_STATUS_REJECTED)

# Default term length per the constitution: 3 years.
TERM_YEARS = 3

# Seats per council post; posts not listed have a single seat.
DEFAULT_POST_SEATS = 1
POST_SEATS: dict[str, int] = {"executive_member": 2}


def post_seats(post_key: str) -> int:
    return POST_SEATS.get(post_key, DEFAULT_POST_SEATS)


def default_term_end(term_start: date) -> date:
    """term_start + TERM_YEARS; a Feb 29 start clamps to Feb 28 instead of raising."""
    try:
        return term_start.replace(year=term_start.year + TERM_YEARS)
    except ValueError:
        return term_start.replace(year=term_start.year + TERM_YEARS, day=28)


class CommitteeTerm(Base):
    """One holder's tenure of one council post in the committee registry."""

    __tablename__ = "committee_terms"
    __table_args__ = (Index("ix_committee_terms_post_status", "post_key", "term_end"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    post_key: Mapped[str] = mapped_column(String(64), nullable=False)
    member_id: Mapped[int | None] = mapped_column(
        ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    term_start: Mapped[date] = mapped_column(Date, nullable=False)
    term_end: Mapped[date] = mapped_column(Date, nullable=False)
    is_caretaker: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    replaced_by_term_id: Mapped[int | None] = mapped_column(
        ForeignKey("committee_terms.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    member = relationship("Member", lazy="joined")

    def computed_status(self, today: date) -> str:
        if self.is_caretaker:
            return TERM_STATUS_CARETAKER
        if today > self.term_end:
            return TERM_STATUS_EXPIRED
        return TERM_STATUS_ACTIVE


class PostVacancy(Base):
    """Resignation acknowledgement / removal-with-right-to-respond workflow
    for one post held by one member."""

    __tablename__ = "post_vacancies"
    __table_args__ = (Index("ix_post_vacancies_post_status", "post_key", "status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    post_key: Mapped[str] = mapped_column(String(64), nullable=False)
    term_id: Mapped[int | None] = mapped_column(
        ForeignKey("committee_terms.id", ondelete="SET NULL"), nullable=True
    )
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    vacancy_type: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default=VACANCY_STATUS_PENDING_ACK)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    investigation_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    member_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    member_responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision: Mapped[str | None] = mapped_column(String(16), nullable=True)  # removed|retained
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    member = relationship("Member", lazy="joined")


class Election(Base):
    """One society election with its nomination/voting windows and lifecycle."""

    __tablename__ = "elections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    nomination_start: Mapped[date] = mapped_column(Date, nullable=False)
    nomination_end: Mapped[date] = mapped_column(Date, nullable=False)
    voting_start: Mapped[date] = mapped_column(Date, nullable=False)
    voting_end: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default=ELECTION_STATUS_DRAFT)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    nominations = relationship(
        "Nomination", back_populates="election", lazy="selectin"
    )
    votes = relationship("Vote", back_populates="election", lazy="noload")


class Nomination(Base):
    """One member standing for one post in one election."""

    __tablename__ = "nominations"
    __table_args__ = (
        UniqueConstraint("election_id", "post_key", "member_id", name="uq_nomination_member_post"),
        Index("ix_nominations_election_status", "election_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    election_id: Mapped[int] = mapped_column(ForeignKey("elections.id", ondelete="CASCADE"), nullable=False)
    post_key: Mapped[str] = mapped_column(String(64), nullable=False)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=NOMINATION_STATUS_PENDING)
    statement: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    election = relationship("Election", back_populates="nominations")
    member = relationship("Member", lazy="joined")


class VoterSnapshot(Base):
    """Eligibility frozen at nomination close: the member's class/status at
    freeze time decides who may vote, even if the member changes later."""

    __tablename__ = "voter_snapshots"
    __table_args__ = (
        UniqueConstraint("election_id", "member_id", name="uq_voter_snapshot_member"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    election_id: Mapped[int] = mapped_column(ForeignKey("elections.id", ondelete="CASCADE"), nullable=False)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Vote(Base):
    """One secret ballot. Which candidate a member picked is stored only so a
    recount is possible; NO read endpoint ever exposes ballot content - only
    per-post counts after tabulation."""

    __tablename__ = "votes"
    __table_args__ = (
        UniqueConstraint("election_id", "post_key", "voter_member_id", name="uq_vote_one_per_post"),
        Index("ix_votes_election_post", "election_id", "post_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    election_id: Mapped[int] = mapped_column(ForeignKey("elections.id", ondelete="CASCADE"), nullable=False)
    post_key: Mapped[str] = mapped_column(String(64), nullable=False)
    voter_member_id: Mapped[int] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    candidate_nomination_id: Mapped[int] = mapped_column(
        ForeignKey("nominations.id", ondelete="CASCADE"), nullable=False
    )
    cast_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    election = relationship("Election", back_populates="votes")


class ElectionComplaint(Base):
    """Election-scoped objection channel: a member complains about the
    election process; admins resolve or reject with a written resolution."""

    __tablename__ = "election_complaints"
    __table_args__ = (Index("ix_election_complaints_election_status", "election_id", "status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    election_id: Mapped[int] = mapped_column(ForeignKey("elections.id", ondelete="CASCADE"), nullable=False)
    complainant_member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )
    against: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    details: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=COMPLAINT_STATUS_SUBMITTED)
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    complainant = relationship("Member", lazy="joined")
