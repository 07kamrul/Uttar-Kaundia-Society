import math
from datetime import date, datetime, time as dt_time

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# Plain-string vocabularies (not native enums) so a new value never needs a
# migration - same rationale as roadmap / financial_transactions.
MEETING_TYPE_ONLINE = "online"
MEETING_TYPE_OFFLINE = "offline"
MEETING_TYPES = (MEETING_TYPE_ONLINE, MEETING_TYPE_OFFLINE)

MEETING_STATUS_SCHEDULED = "scheduled"
MEETING_STATUS_COMPLETED = "completed"
MEETING_STATUS_CANCELLED = "cancelled"
MEETING_STATUSES = (MEETING_STATUS_SCHEDULED, MEETING_STATUS_COMPLETED, MEETING_STATUS_CANCELLED)

RESOLUTION_STATUS_PENDING = "pending"
RESOLUTION_STATUS_IN_PROGRESS = "in_progress"
RESOLUTION_STATUS_DONE = "done"
RESOLUTION_STATUSES = (RESOLUTION_STATUS_PENDING, RESOLUTION_STATUS_IN_PROGRESS, RESOLUTION_STATUS_DONE)

ATTENDANCE_PRESENT = "present"
ATTENDANCE_ABSENT = "absent"
ATTENDANCE_STATUSES = (ATTENDANCE_PRESENT, ATTENDANCE_ABSENT)

RECORDING_VIDEO = "video"
RECORDING_AUDIO = "audio"
RECORDING_SCREENSHOT = "screenshot"
RECORDING_CHAT_LOG = "chat_log"
RECORDING_TYPES = (RECORDING_VIDEO, RECORDING_AUDIO, RECORDING_SCREENSHOT, RECORDING_CHAT_LOG)

# Module 3 — সভা ও কোরাম: council kind of the sitting, notice publishing and
# quorum bookkeeping on Meeting; vote mode / casting vote on Resolution.
COUNCIL_TYPE_EXECUTIVE = "executive"
COUNCIL_TYPE_STANDING = "standing"
COUNCIL_TYPE_AGM = "agm"
COUNCIL_TYPE_EMERGENCY = "emergency"
COUNCIL_TYPES = (COUNCIL_TYPE_EXECUTIVE, COUNCIL_TYPE_STANDING, COUNCIL_TYPE_AGM, COUNCIL_TYPE_EMERGENCY)

VOTE_MODE_OPEN = "open"
VOTE_MODE_SECRET = "secret"
VOTE_MODES = (VOTE_MODE_OPEN, VOTE_MODE_SECRET)

CASTING_VOTE_NONE = "none"
CASTING_VOTE_FOR = "for"
CASTING_VOTE_AGAINST = "against"
CASTING_VOTE_NEUTRAL = "neutral"
CASTING_VOTES = (CASTING_VOTE_NONE, CASTING_VOTE_FOR, CASTING_VOTE_AGAINST, CASTING_VOTE_NEUTRAL)

CHOICE_FOR = "for"
CHOICE_AGAINST = "against"
CHOICE_NEUTRAL = "neutral"
CHOICES = (CHOICE_FOR, CHOICE_AGAINST, CHOICE_NEUTRAL)

PETITION_STATUS_SUBMITTED = "submitted"
PETITION_STATUS_UNDER_REVIEW = "under_review"
PETITION_STATUS_SCHEDULED = "scheduled"
PETITION_STATUS_RESPONDED = "responded"
PETITION_STATUS_REJECTED = "rejected"
PETITION_STATUSES = (
    PETITION_STATUS_SUBMITTED,
    PETITION_STATUS_UNDER_REVIEW,
    PETITION_STATUS_SCHEDULED,
    PETITION_STATUS_RESPONDED,
    PETITION_STATUS_REJECTED,
)

PETITION_SIGNATURE_SHARE = 0.20  # 20% of eligible members to force a session


def required_signature_count(eligible_members: int) -> int:
    """ceil(20% of eligible members), at least 1."""
    return max(1, math.ceil(eligible_members * PETITION_SIGNATURE_SHARE))


class Meeting(Base):
    """One recorded sitting of the society (অনলাইন রেজোলিউশন বুক)."""

    __tablename__ = "meetings"
    __table_args__ = (
        Index("ix_meetings_date", "date"),
        Index("ix_meetings_status_date", "status", "date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    time: Mapped[dt_time | None] = mapped_column(Time, nullable=True)
    meeting_type: Mapped[str] = mapped_column(String(16), nullable=False, default=MEETING_TYPE_ONLINE)
    chairperson: Mapped[str] = mapped_column(String(255), nullable=False)
    chairperson_member_id: Mapped[int | None] = mapped_column(
        ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    agenda: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_meeting_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=MEETING_STATUS_COMPLETED)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Module 3 additions (all nullable / defaulted so existing rows survive).
    council_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default=COUNCIL_TYPE_EXECUTIVE, server_default=COUNCIL_TYPE_EXECUTIVE
    )
    notice_published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scheduled_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    quorum_present: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quorum_required: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quorum_acknowledged: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    casting_vote_used: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )

    resolutions = relationship("Resolution", back_populates="meeting", lazy="selectin")
    attendance = relationship("MeetingAttendance", back_populates="meeting", lazy="selectin")
    recordings = relationship("MeetingRecording", back_populates="meeting", lazy="selectin")


class Resolution(Base):
    """A decision taken in a meeting, with its vote tally and optional action item."""

    __tablename__ = "resolutions"
    __table_args__ = (
        Index("ix_resolutions_meeting_no", "meeting_id", "resolution_no", unique=True),
        Index("ix_resolutions_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)
    resolution_no: Mapped[int] = mapped_column(Integer, nullable=False)
    decision: Mapped[str] = mapped_column(Text, nullable=False)
    vote_for: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vote_against: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vote_neutral: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    assigned_to_member_id: Mapped[int | None] = mapped_column(
        ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    task: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=RESOLUTION_STATUS_PENDING)
    vote_mode: Mapped[str | None] = mapped_column(String(8), nullable=True)  # open|secret
    casting_vote: Mapped[str | None] = mapped_column(String(8), nullable=True)  # none|for|against|neutral
    casting_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    meeting = relationship("Meeting", back_populates="resolutions")
    assigned_to = relationship("Member", lazy="joined")
    open_choices = relationship("OpenVoteChoice", back_populates="resolution", lazy="selectin")


class MeetingAttendance(Base):
    """One member's present/absent record for one meeting."""

    __tablename__ = "meeting_attendance"
    __table_args__ = (
        Index("ix_meeting_attendance_meeting_member", "meeting_id", "member_id", unique=True),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=ATTENDANCE_ABSENT)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    meeting = relationship("Meeting", back_populates="attendance")
    member = relationship("Member", lazy="joined")


class MeetingRecording(Base):
    """An attachment (video/audio/screenshot/chat log) of a meeting, stored on
    the shared upload disk but served only through the authenticated
    download endpoint - never via the public /uploads mount."""

    __tablename__ = "meeting_recordings"
    __table_args__ = (Index("ix_meeting_recordings_meeting", "meeting_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(16), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    uploaded_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    meeting = relationship("Meeting", back_populates="recordings")


class OpenVoteChoice(Base):
    """Per-member choice on an OPEN vote only. Secret ballots (vote_mode =
    'secret') must never have rows here, and no read endpoint exposes these
    rows for a secret resolution."""

    __tablename__ = "open_vote_choices"
    __table_args__ = (
        Index("uq_open_vote_choice", "resolution_id", "member_id", unique=True),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    resolution_id: Mapped[int] = mapped_column(ForeignKey("resolutions.id", ondelete="CASCADE"), nullable=False)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    choice: Mapped[str] = mapped_column(String(8), nullable=False)  # for|against|neutral
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    resolution = relationship("Resolution", back_populates="open_choices")
    member = relationship("Member", lazy="joined")


class SpecialSessionPetition(Base):
    """Module 3 — বিশেষ সভার পিটিশন: members force a special session with
    signatures from >= 20% of eligible members. Response is due in
    PETITION_RESPONSE_DAYS calendar-anchor days (30) measured in working days
    from submission."""

    __tablename__ = "special_session_petitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    petition_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    justification: Mapped[str] = mapped_column(Text, nullable=False)
    submitted_by_member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )
    signatures: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    signature_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    required_count: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=PETITION_STATUS_SUBMITTED)
    response_due: Mapped[date | None] = mapped_column(Date, nullable=True)
    committee_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meeting_id: Mapped[int | None] = mapped_column(
        ForeignKey("meetings.id", ondelete="SET NULL"), nullable=True
    )
    created_by_admin: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
