from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Plain strings (not native enums) so the vocabulary can grow without a
# migration - same rationale as installment_payments.
ACCOUNT_TYPE_BANK = "bank"
ACCOUNT_TYPE_MFS = "mfs"
ACCOUNT_TYPES = (ACCOUNT_TYPE_BANK, ACCOUNT_TYPE_MFS)

ACCOUNT_STATUS_ACTIVE = "active"
ACCOUNT_STATUS_INACTIVE = "inactive"
ACCOUNT_STATUSES = (ACCOUNT_STATUS_ACTIVE, ACCOUNT_STATUS_INACTIVE)

MFS_PROVIDER_BKASH = "bkash"
MFS_PROVIDER_NAGAD = "nagad"
MFS_PROVIDER_ROCKET = "rocket"
MFS_PROVIDER_UPAY = "upay"
MFS_PROVIDER_OTHER = "other"
MFS_PROVIDERS = (
    MFS_PROVIDER_BKASH,
    MFS_PROVIDER_NAGAD,
    MFS_PROVIDER_ROCKET,
    MFS_PROVIDER_UPAY,
    MFS_PROVIDER_OTHER,
)

ACCOUNT_KIND_PERSONAL = "personal"
ACCOUNT_KIND_AGENT = "agent"
ACCOUNT_KIND_MERCHANT = "merchant"
ACCOUNT_KINDS = (ACCOUNT_KIND_PERSONAL, ACCOUNT_KIND_AGENT, ACCOUNT_KIND_MERCHANT)


class PaymentAccount(Base):
    """A society account members can pay into (bank account or mobile
    financial service number), managed by fee managers from the admin panel.

    Accounts are never hard-deleted - deactivating one hides it from members
    while payment snapshots and history keep referencing it.
    """

    __tablename__ = "payment_accounts"
    __table_args__ = (
        # The member-facing list query: active accounts of a type, in order.
        Index("ix_payment_accounts_status_type_order", "status", "type", "display_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(8), nullable=False, default=ACCOUNT_STATUS_ACTIVE, server_default=ACCOUNT_STATUS_ACTIVE
    )
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    label: Mapped[str] = mapped_column(String(120), nullable=False)

    # Bank-specific (null for MFS accounts).
    bank_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    branch_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    account_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    account_number: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    routing_number: Mapped[str | None] = mapped_column(String(9), nullable=True)

    # MFS-specific (null for bank accounts).
    provider: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    mfs_number: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    account_kind: Mapped[str | None] = mapped_column(String(16), nullable=True)
    account_holder: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # Common.
    instructions: Mapped[str | None] = mapped_column(String(500), nullable=True)
    qr_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
