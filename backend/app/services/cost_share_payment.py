"""Member self-service payments toward society-cost shares.

Same lifecycle as installment payments: a member reports a payment (pending),
a committee member verifies it (approved: the share's amount_paid grows) or
rejects it (the share is untouched and the reference is freed).

Approve mirrors what ``PATCH /admin/cost-split-shares/{id}`` does today: that
path only updates the share row (amount_paid, status, paid_at, receipt_no) and
writes an audit row - it creates no finance-ledger entries - so neither does
this one. Totals therefore stay consistent between the two ways of recording.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cost_share_payment import CostSharePayment
from app.models.installment_payment import (
    PAYMENT_STATUS_APPROVED,
    PAYMENT_STATUS_PENDING,
    PAYMENT_STATUS_REJECTED,
    InstallmentPayment,
)
from app.models.member import Member
from app.models.society_cost import SHARE_PAID, SHARE_PARTIAL, SHARE_UNPAID, CostSplitShare
from app.services.installment_payment import _bad_request, _validate_method

ZERO = Decimal("0")


def _coded(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def share_status(amount_due: Decimal, amount_paid: Decimal) -> str:
    if amount_paid <= 0:
        return SHARE_UNPAID
    if amount_paid < amount_due:
        return SHARE_PARTIAL
    return SHARE_PAID


async def pending_sums_by_share(db: AsyncSession, share_ids: list[int]) -> dict[int, Decimal]:
    if not share_ids:
        return {}
    rows = await db.execute(
        select(CostSharePayment.share_id, func.coalesce(func.sum(CostSharePayment.amount), 0))
        .where(CostSharePayment.share_id.in_(share_ids), CostSharePayment.status == PAYMENT_STATUS_PENDING)
        .group_by(CostSharePayment.share_id)
    )
    return {share_id: Decimal(str(total)) for share_id, total in rows.all()}


async def _ensure_unique_reference(db: AsyncSession, method: str, reference: str) -> None:
    for model in (CostSharePayment, InstallmentPayment):
        found = await db.execute(
            select(model.id).where(
                model.method == method,
                model.transaction_ref == reference,
                model.status != PAYMENT_STATUS_REJECTED,
            )
        )
        if found.first() is not None:
            raise _coded(
                status.HTTP_409_CONFLICT,
                "DUPLICATE_TRANSACTION_REF",
                "This transaction ID has already been submitted.",
            )


async def submit_payment(
    db: AsyncSession,
    *,
    member: Member,
    share_id: int,
    amount: Decimal,
    method: str,
    transaction_ref: str,
    paid_on: date,
    sender_account: str | None = None,
    note: str | None = None,
) -> CostSharePayment:
    """Validate and stage a pending cost-share payment. Caller commits."""
    result = await db.execute(
        select(CostSplitShare)
        .where(CostSplitShare.id == share_id, CostSplitShare.member_id == member.id)
        .with_for_update()
    )
    share = result.scalars().unique().one_or_none()
    if share is None:
        raise _coded(status.HTTP_404_NOT_FOUND, "SHARE_NOT_FOUND", "Cost share not found.")
    if share.status == SHARE_PAID or share.amount_paid >= share.amount_due:
        raise _coded(status.HTTP_409_CONFLICT, "SHARE_ALREADY_PAID", "This share is already fully paid.")
    if paid_on > date.today():
        raise _bad_request("Payment date cannot be in the future.")
    canonical_method = await _validate_method(db, method)
    reference = transaction_ref.strip().upper()
    await _ensure_unique_reference(db, canonical_method, reference)

    pending = (await pending_sums_by_share(db, [share.id])).get(share.id, ZERO)
    remaining = share.amount_due - share.amount_paid - pending
    if amount <= 0 or amount > remaining:
        raise _coded(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "AMOUNT_EXCEEDS_REMAINING",
            f"Amount must be more than 0 and at most the remaining ৳{max(remaining, ZERO)}.",
        )

    payment = CostSharePayment(
        member_id=member.id,
        share_id=share.id,
        method=canonical_method,
        transaction_ref=reference,
        sender_account=(sender_account or "").strip() or None,
        amount=amount,
        paid_on=paid_on,
        note=(note or "").strip() or None,
        status=PAYMENT_STATUS_PENDING,
    )
    db.add(payment)
    return payment


def _ensure_pending(payment: CostSharePayment) -> None:
    if payment.status != PAYMENT_STATUS_PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This payment has already been reviewed.")


async def approve_payment(db: AsyncSession, payment: CostSharePayment, admin_id: int) -> CostSplitShare:
    """Add the amount to the share and mark the payment approved. Caller commits."""
    _ensure_pending(payment)
    share = (
        await db.execute(
            select(CostSplitShare)
            .where(CostSplitShare.id == payment.share_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalars().unique().one()
    new_paid = share.amount_paid + payment.amount
    if new_paid > share.amount_due:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This payment now exceeds the share's due amount; reject it instead.",
        )
    now = datetime.now(timezone.utc)
    share.amount_paid = new_paid
    share.status = share_status(share.amount_due, new_paid)
    share.paid_at = now
    share.receipt_no = payment.transaction_ref
    payment.status = PAYMENT_STATUS_APPROVED
    payment.reviewed_by = admin_id
    payment.reviewed_at = now
    return share


def reject_payment(payment: CostSharePayment, admin_id: int, reason: str) -> None:
    """Reject the payment; the share is untouched. Caller commits."""
    _ensure_pending(payment)
    payment.status = PAYMENT_STATUS_REJECTED
    payment.rejection_reason = reason.strip()
    payment.reviewed_by = admin_id
    payment.reviewed_at = datetime.now(timezone.utc)
