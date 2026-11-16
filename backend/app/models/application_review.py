"""One row per review decision on a membership application.

`members.rejection_reason` only holds the latest reason; this table keeps the
whole history so the applicant and the committee can see every round of
"rejected -> corrected -> resubmitted" that led to the final decision.
"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

DECISION_REJECTED = "rejected"
DECISION_APPROVED = "approved"


class ApplicationReview(Base):
    __tablename__ = "application_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 1 for the original submission, +1 for every resubmission.
    round: Mapped[int] = mapped_column(Integer, nullable=False)
    decision: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Form sections the applicant must correct (keys of CORRECTION_FIELDS).
    correction_fields: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
