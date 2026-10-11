"""Module 7 — রেজিস্টার (registers): society asset register and welfare
activities.

Both are simple audited registers: admin CRUD gated by their own permission
keys, soft-deactivation for assets (physical things are never silently
forgotten), and a read-only member view for welfare activities.
"""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

ASSET_CONDITION_GOOD = "good"
ASSET_CONDITION_FAIR = "fair"
ASSET_CONDITION_POOR = "poor"
ASSET_CONDITION_LOST = "lost"

WELFARE_ACTIVITY_TRAINING = "training"
WELFARE_ACTIVITY_WELFARE = "welfare"
WELFARE_ACTIVITY_OTHER = "other"


class SocietyAsset(Base):
    """One entry of the society asset register (সম্পদ রেজিস্টার).

    asset_code is the auto "KRMF-AS-###" sequence; the register PDF prints
    the whole active list for the annual audit pack."""
    __tablename__ = "society_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    asset_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    acquisition_date: Mapped[date] = mapped_column(Date, nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    condition: Mapped[str] = mapped_column(String(16), nullable=False, default="good")
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WelfareActivity(Base):
    """One recorded কল্যাণমূলক কার্যক্রম (training camp, welfare distribution,
    ...). Members see the list read-only; the committee keeps the record."""

    __tablename__ = "welfare_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    activity_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    activity_type: Mapped[str] = mapped_column(String(16), nullable=False, default="welfare")
    participants_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    participant_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    organizer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
