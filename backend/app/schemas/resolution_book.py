from datetime import date as dt_date, datetime as dt_datetime, time as dt_time

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.resolution_book import (
    ATTENDANCE_STATUSES,
    CASTING_VOTES,
    CHOICES,
    COUNCIL_TYPES,
    MEETING_STATUSES,
    MEETING_TYPES,
    RESOLUTION_STATUSES,
    VOTE_MODES,
)

_MEETING_TYPE_PATTERN = rf"^({'|'.join(MEETING_TYPES)})$"
_MEETING_STATUS_PATTERN = rf"^({'|'.join(MEETING_STATUSES)})$"
_RESOLUTION_STATUS_PATTERN = rf"^({'|'.join(RESOLUTION_STATUSES)})$"
_ATTENDANCE_STATUS_PATTERN = rf"^({'|'.join(ATTENDANCE_STATUSES)})$"
_COUNCIL_TYPE_PATTERN = rf"^({'|'.join(COUNCIL_TYPES)})$"
_VOTE_MODE_PATTERN = rf"^({'|'.join(VOTE_MODES)})$"
_CASTING_VOTE_PATTERN = rf"^({'|'.join(CASTING_VOTES)})$"
_CHOICE_PATTERN = rf"^({'|'.join(CHOICES)})$"

_MEETING_NO_PATTERN = r"^[A-Za-z0-9\-]{3,32}$"


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class ResolutionIn(BaseModel):
    decision: str = Field(min_length=1, max_length=2000)
    vote_for: int = Field(default=0, ge=0)
    vote_against: int = Field(default=0, ge=0)
    vote_neutral: int = Field(default=0, ge=0)
    assigned_to_member_id: int | None = None
    task: str | None = Field(default=None, max_length=1000)
    due_date: dt_date | None = None
    status: str = Field(default="pending", pattern=_RESOLUTION_STATUS_PATTERN)

    @field_validator("decision")
    @classmethod
    def _strip_decision(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Decision must not be blank.")
        return stripped

    @field_validator("task")
    @classmethod
    def _strip_task(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class AttendanceEntryIn(BaseModel):
    member_id: int
    status: str = Field(pattern=_ATTENDANCE_STATUS_PATTERN)


class MeetingCreate(BaseModel):
    """One atomic submission: meeting + resolutions + attendance together."""

    meeting_no: str | None = Field(default=None, max_length=32, pattern=_MEETING_NO_PATTERN)
    date: dt_date
    time: dt_time | None = None
    meeting_type: str = Field(default="online", pattern=_MEETING_TYPE_PATTERN)
    chairperson: str = Field(min_length=1, max_length=255)
    chairperson_member_id: int | None = None
    agenda: str = Field(min_length=1, max_length=5000)
    summary: str | None = Field(default=None, max_length=8000)
    next_meeting_date: dt_date | None = None
    status: str = Field(default="completed", pattern=_MEETING_STATUS_PATTERN)
    council_type: str = Field(default="executive", pattern=_COUNCIL_TYPE_PATTERN)
    scheduled_start_at: dt_datetime | None = None
    resolutions: list[ResolutionIn] = Field(default_factory=list, max_length=100)
    attendance: list[AttendanceEntryIn] = Field(default_factory=list, max_length=2000)
    notify: bool = True
    # Module 3: recording a completed meeting below quorum requires an
    # explicit acknowledgement (stored + audited, warned in the UI forever).
    acknowledge_no_quorum: bool = False

    @field_validator("chairperson", "agenda")
    @classmethod
    def _strip_required(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Must not be blank.")
        return stripped

    @field_validator("summary")
    @classmethod
    def _strip_optional(cls, value: str | None) -> str | None:
        return _blank_to_none(value)

    @model_validator(mode="after")
    def _unique_members(self) -> "MeetingCreate":
        member_ids = [entry.member_id for entry in self.attendance]
        if len(member_ids) != len(set(member_ids)):
            raise ValueError("Each member may appear at most once in the attendance list.")
        return self


class MeetingUpdate(BaseModel):
    """Partial update. Field names mirror MeetingCreate; the route decides
    whether the change lands as a normal edit or a post-cutoff correction."""

    date: dt_date | None = None
    time: dt_time | None = None
    meeting_type: str | None = Field(default=None, pattern=_MEETING_TYPE_PATTERN)
    chairperson: str | None = Field(default=None, min_length=1, max_length=255)
    chairperson_member_id: int | None = None
    agenda: str | None = Field(default=None, min_length=1, max_length=5000)
    summary: str | None = Field(default=None, max_length=8000)
    next_meeting_date: dt_date | None = None
    status: str | None = Field(default=None, pattern=_MEETING_STATUS_PATTERN)
    council_type: str | None = Field(default=None, pattern=_COUNCIL_TYPE_PATTERN)
    scheduled_start_at: dt_datetime | None = None
    acknowledge_no_quorum: bool = False

    @field_validator("chairperson", "agenda")
    @classmethod
    def _strip_required(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Must not be blank.")
        return stripped

    @field_validator("summary")
    @classmethod
    def _strip_optional(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class ResolutionCreate(BaseModel):
    decision: str = Field(min_length=1, max_length=2000)
    vote_for: int = Field(default=0, ge=0)
    vote_against: int = Field(default=0, ge=0)
    vote_neutral: int = Field(default=0, ge=0)
    assigned_to_member_id: int | None = None
    task: str | None = Field(default=None, max_length=1000)
    due_date: dt_date | None = None
    status: str = Field(default="pending", pattern=_RESOLUTION_STATUS_PATTERN)
    vote_mode: str | None = Field(default=None, pattern=_VOTE_MODE_PATTERN)
    casting_vote: str | None = Field(default=None, pattern=_CASTING_VOTE_PATTERN)
    casting_note: str | None = Field(default=None, max_length=1000)

    @field_validator("decision")
    @classmethod
    def _strip_decision(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Decision must not be blank.")
        return stripped

    @field_validator("task")
    @classmethod
    def _strip_task(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class ResolutionUpdate(BaseModel):
    decision: str | None = Field(default=None, min_length=1, max_length=2000)
    vote_for: int | None = Field(default=None, ge=0)
    vote_against: int | None = Field(default=None, ge=0)
    vote_neutral: int | None = Field(default=None, ge=0)
    assigned_to_member_id: int | None = None
    task: str | None = Field(default=None, max_length=1000)
    due_date: dt_date | None = None
    status: str | None = Field(default=None, pattern=_RESOLUTION_STATUS_PATTERN)
    vote_mode: str | None = Field(default=None, pattern=_VOTE_MODE_PATTERN)
    casting_vote: str | None = Field(default=None, pattern=_CASTING_VOTE_PATTERN)
    casting_note: str | None = Field(default=None, max_length=1000)

    @field_validator("decision")
    @classmethod
    def _strip_decision(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Decision must not be blank.")
        return stripped

    @field_validator("task")
    @classmethod
    def _strip_task(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class AttendanceBulkIn(BaseModel):
    entries: list[AttendanceEntryIn] = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def _unique_members(self) -> "AttendanceBulkIn":
        member_ids = [entry.member_id for entry in self.entries]
        if len(member_ids) != len(set(member_ids)):
            raise ValueError("Each member may appear at most once.")
        return self


# ---------------------------------------------------------------------------
# Output models
# ---------------------------------------------------------------------------


class MemberRefOut(BaseModel):
    id: int
    full_name: str
    member_id: str | None = None


class ResolutionOut(BaseModel):
    id: int
    meeting_id: int
    resolution_no: int
    decision: str
    vote_for: int
    vote_against: int
    vote_neutral: int
    assigned_to: MemberRefOut | None
    task: str | None
    due_date: dt_date | None
    status: str
    vote_mode: str | None = None
    casting_vote: str | None = None
    casting_note: str | None = None
    open_choices: list["OpenChoiceOut"] | None = None
    updated_at: dt_datetime | None


class OpenChoiceIn(BaseModel):
    member_id: int
    choice: str = Field(pattern=_CHOICE_PATTERN)


class OpenChoiceBulkIn(BaseModel):
    entries: list[OpenChoiceIn] = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def _unique_members(self) -> "OpenChoiceBulkIn":
        member_ids = [e.member_id for e in self.entries]
        if len(member_ids) != len(set(member_ids)):
            raise ValueError("Each member may appear at most once.")
        return self


class OpenChoiceOut(BaseModel):
    member: MemberRefOut
    choice: str


class AttendanceOut(BaseModel):
    member: MemberRefOut
    status: str


class RecordingOut(BaseModel):
    id: int
    meeting_id: int
    original_name: str
    file_type: str
    file_size: int
    uploaded_by: str | None = None
    uploaded_at: dt_datetime | None


class MeetingListOut(BaseModel):
    id: int
    meeting_no: str
    date: dt_date
    time: dt_time | None
    meeting_type: str
    chairperson: str
    next_meeting_date: dt_date | None
    status: str
    council_type: str = "executive"
    notice_published_at: dt_datetime | None = None
    scheduled_start_at: dt_datetime | None = None
    quorum_present: int | None = None
    quorum_required: int | None = None
    quorum_acknowledged: bool = False
    resolution_count: int
    attendance_present: int
    attendance_total: int
    attendance_percent: int


class MeetingDetailOut(MeetingListOut):
    agenda: str
    summary: str | None
    created_by: str | None = None
    casting_vote_used: bool = False
    updated_at: dt_datetime | None
    resolutions: list[ResolutionOut]
    attendance: list[AttendanceOut]
    recordings: list[RecordingOut]


class MeetingPageOut(BaseModel):
    total: int
    items: list[MeetingListOut]


class ResolutionStatusUpdateOut(BaseModel):
    resolution: ResolutionOut


class SuggestedMeetingNoOut(BaseModel):
    meeting_no: str
    available: bool


class DashboardOut(BaseModel):
    total_meetings: int
    meetings_this_year: int
    average_attendance_percent: int
    open_action_items: int
    upcoming_meeting_date: dt_date | None
    recent_meetings: list[MeetingListOut]
