"""Module 4 — তহবিল নিয়ন্ত্রণ ও অডিট (fund controls).

BankSignatory records who may operate the society's bank account; the full
account number is deliberately NEVER stored - only the last four digits for
identification. AuditReport is the annual (July-June) audit summary and its
PDF. WelfareFundRequest is the member-facing সদস্যকল্যাণ তহবিল application
flow - every decision is a human committee decision; there is no
auto-approval path anywhere in this module.
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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# Plain-string vocabularies (not native enums) so a new value never needs a
# migration - same rationale as financial_transactions.
WELFARE_REQUEST_SUBMITTED = "submitted"
WELFARE_REQUEST_UNDER_REVIEW = "under_review"
WELFARE_REQUEST_APPROVED = "approved"
WELFARE_REQUEST_REJECTED = "rejected"
WELFARE_REQUEST_DISBURSED = "disbursed"


class BankSignatory(Base):
    """One person authorised to operate a society bank account.

    ``account_number_masked`` holds only the last 4 digits (e.g. "4521") -
    storing a full account number is not necessary for the register and the
    bank letter, and would turn a leak into a fraud kit.
    """

    __tablename__ = "bank_signatories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    # Optional link to the committee tenure that authorises the signatory;
    # the bank-letter PDF shows the council post from this term.
    committee_term_id: Mapped[int | None] = mapped_column(
        ForeignKey("committee_terms.id", ondelete="SET NULL"), nullable=True
    )
    bank_name: Mapped[str] = mapped_column(String(255), nullable=False)
    branch: Mapped[str] = mapped_column(String(255), nullable=False)
    account_name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_number_masked: Mapped[str] = mapped_column(String(8), nullable=False)
    # joint / individual plus free-form notes about the signing authority.
    authority_scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    member = relationship("Member", lazy="joined")
    committee_term = relationship("CommitteeTerm", lazy="joined")


class AuditReport(Base):
    """The annual audit report for one fiscal year (July 1 - June 30).

    One row per fiscal year (re-uploading replaces the file and metadata; the
    row is never deleted so the register stays complete). The summary becomes
    member-visible only through the linked published Notice.
    """

    __tablename__ = "audit_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fiscal_year: Mapped[str] = mapped_column(String(8), nullable=False, unique=True, index=True)
    report_date: Mapped[date] = mapped_column(Date, nullable=False)
    summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Uploaded via save_upload_file; served only through the authenticated
    # download endpoints (same pattern as meeting recordings).
    file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    original_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Set when the summary is published as a member-visible Notice.
    published_notice_id: Mapped[int | None] = mapped_column(
        ForeignKey("notices.id", ondelete="SET NULL"), nullable=True
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    uploaded_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WelfareFundRequest(Base):
    """One সদস্যকল্যাণ তহবিল application from a member.

    Lifecycle: submitted -> (under_review) -> approved | rejected -> disbursed.
    ``committee_reason`` is mandatory on EVERY decision (approve or reject) so
    the member always receives a written explanation; ``approved_amount`` may
    be less than but never more than ``amount_requested``. Disbursement links
    the payout to its ledger row in financial_transactions.
    """

    __tablename__ = "welfare_fund_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    request_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    request_type: Mapped[str] = mapped_column(String(16), nullable=False)  # medical|emergency|education|other
    amount_requested: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=WELFARE_REQUEST_SUBMITTED, index=True
    )
    committee_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    decided_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    disbursed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # The payout's ledger entry (expense), linked when the committee marks the
    # request disbursed.
    transaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("financial_transactions.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    member = relationship("Member", lazy="joined")
    decider = relationship("AdminUser", lazy="joined")
