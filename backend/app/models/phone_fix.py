from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PhoneFixQueue(Base):
    """A stored phone number the E.164 migration could not convert.

    The offending row keeps its original value until an admin supplies a
    correct number (`PUT /api/admin/phone-fixes/{id}`); `entity_type` + `field`
    name the target column (see `app/services/phone_migration.py`).
    """

    __tablename__ = "phone_fix_queue"
    __table_args__ = (Index("ix_phone_fix_queue_entity", "entity_type", "entity_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    field: Mapped[str] = mapped_column(String(64), nullable=False)
    raw_value: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by_admin_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
