"""Response shapes for the rejected-applicant self-service routes."""

from pydantic import BaseModel

from app.models.member import MemberStatus
from app.schemas.member import ApplicationReviewOut, MemberDetail


class ApplicantApplicationOut(BaseModel):
    application: MemberDetail
    # True only while REJECTED: once resubmitted the record is locked.
    can_edit: bool
    rejection_reason: str | None = None
    # Sections flagged in the latest rejection (subset of the list below).
    correction_fields: list[str] = []
    available_correction_fields: list[str] = []
    reviews: list[ApplicationReviewOut] = []


class ResubmitResponse(BaseModel):
    status: MemberStatus
    resubmission_count: int
