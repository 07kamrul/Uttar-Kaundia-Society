from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, Numeric, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.installment_payment import PAYMENT_STATUS_PENDING


class CostSharePayment(Base):
    """A member's self-reported payment toward a society-cost share. Mirrors
    InstallmentPayment: it only increases share.amount_paid once a committee
    member verifies the transaction.

    One transfer can pay several shares (and an installment) for the same
    member, so the live-reference index is per share; ownership of a reference
    across members is enforced in the service."""

    __tablename__ = "cost_share_payments"
    __table_args__ = (
        Index(
            "uq_cost_share_payments_share_method_ref",
            "share_id",
            "method",
            "transaction_ref",
            unique=True,
            postgresql_where=text("status <> 'rejected'"),
            sqlite_where=text("status <> 'rejected'"),
        ),
        Index("ix_cost_share_payments_status_created", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    share_id: Mapped[int] = mapped_column(
        ForeignKey("cost_split_shares.id", ondelete="CASCADE"), nullable=False, index=True
    )
    method: Mapped[str] = mapped_column(String(64), nullable=False)
    transaction_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    sender_account: Mapped[str | None] = mapped_column(String(64), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    proof_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)

    status: Mapped[str] = mapped_column(String(16), nullable=False, default=PAYMENT_STATUS_PENDING)
    rejection_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    member: Mapped["Member"] = relationship(lazy="joined")  # noqa: F821
    share: Mapped["CostSplitShare"] = relationship(lazy="joined")  # noqa: F821


from app.models.member import Member  # noqa: E402,F401
from app.models.society_cost import CostSplitShare  # noqa: E402,F401
