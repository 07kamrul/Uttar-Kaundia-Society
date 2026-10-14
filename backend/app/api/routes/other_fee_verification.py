"""Committee verification of other-fee and picnic payments (Batch 2b).

Every endpoint answers 404 FEATURE_DISABLED while `pay_verify_other_fees` is off.
"""

import logging
from decimal import Decimal
from html import escape

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import BaseModel
from datetime import date, datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.feature_flags import is_enabled
from app.core.permissions import require_permission
from app.db.session import get_db
from app.models.installment_payment import PAYMENT_STATUS_APPROVED, PAYMENT_STATUSES
from app.schemas.installment_payment import PaymentRejectIn
from app.services import other_fee_verification as verification
from app.services.email import send_email

router = APIRouter(tags=["other-fee-verification"])
logger = logging.getLogger(__name__)

ADMIN_LIST_LIMIT = 200


class OtherFeeAdminItemOut(BaseModel):
    kind: str
    id: int
    id_ref: str
    member_id: int
    member_name: str | None = None
    member_display_id: str | None = None
    fee_type: str
    fee_label: str
    amount: Decimal
    method: str | None = None
    reference: str | None = None
    payment_method: str | None = None
    receipt_no: str | None = None
    payment_date: date
    proof_url: str | None = None
    date: date
    status: str
    rejection_reason: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime


async def _require_flag(db: AsyncSession = Depends(get_db)) -> None:
    if not await is_enabled(db, verification.FLAG):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "FEATURE_DISABLED", "message": "Other-fee verification is not enabled."},
        )


async def notify_member(payment) -> None:
    """Best effort e-mail, same wording as the installment flow."""
    member = payment.member
    if member is None or not member.email:
        return
    label = escape(verification.label_of(payment))
    amount = verification.payment_amount(payment)
    if payment.status == PAYMENT_STATUS_APPROVED:
        subject = "ফি পরিশোধ নিশ্চিত হয়েছে / Payment confirmed"
        body = (
            f"<p>প্রিয় {escape(member.full_name)},</p>"
            f"<p>আপনার ৳{amount} পরিশোধ ({label}) যাচাই করে গ্রহণ করা হয়েছে। ধন্যবাদ।</p>"
            f"<p>Your payment of ৳{amount} for {label} has been verified. Thank you.</p>"
        )
    else:
        reason = escape(payment.rejection_reason or "")
        subject = "ফি পরিশোধ যাচাই করা যায়নি / Payment could not be verified"
        body = (
            f"<p>প্রিয় {escape(member.full_name)},</p>"
            f"<p>আপনার ৳{amount} পরিশোধ ({label}) যাচাই করা যায়নি। কারণ: {reason}</p>"
            f"<p>Your payment for {label} could not be verified. Reason: {reason}.</p>"
        )
    try:
        await send_email(member.email, subject, body)
    except Exception:  # noqa: BLE001 - a mail failure never undoes a review
        logger.exception("other-fee notification failed for %s", payment.id)


@router.get(
    "/admin/other-fee-payments",
    response_model=list[OtherFeeAdminItemOut],
    dependencies=[Depends(_require_flag)],
)
async def admin_list_other_fee_payments(
    status_filter: str | None = Query(default=None, alias="status", pattern=rf"^({'|'.join(PAYMENT_STATUSES)})$"),
    kind: str | None = Query(default=None, pattern=r"^(fee|picnic)$"),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission("manage_finance")),
) -> list[dict]:
    return await verification.list_admin(db, status_filter=status_filter, kind=kind, limit=ADMIN_LIST_LIMIT)


async def _review(db, admin, kind: str, payment_id: int, action: str, reason: str | None) -> dict:
    payment = await verification.load_payment(db, kind, payment_id)
    if action == "approve":
        verification.approve_payment(payment, admin.id)
        verification.stage_audit(db, admin.id, "approve", payment)
    else:
        verification.reject_payment(payment, admin.id, reason or "")
        verification.stage_audit(db, admin.id, "reject", payment, suffix=f" — {reason}")
    await db.commit()
    payment = await verification.load_payment(db, kind, payment_id)
    await notify_member(payment)
    return verification.admin_item(payment)


@router.post(
    "/admin/other-fee-payments/{kind}/{payment_id}/approve",
    response_model=OtherFeeAdminItemOut,
    dependencies=[Depends(_require_flag)],
)
async def admin_approve_other_fee_payment(
    kind: str = Path(pattern=r"^(fee|picnic)$"),
    payment_id: int = Path(gt=0),
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("manage_finance")),
) -> dict:
    return await _review(db, admin, kind, payment_id, "approve", None)


@router.post(
    "/admin/other-fee-payments/{kind}/{payment_id}/reject",
    response_model=OtherFeeAdminItemOut,
    dependencies=[Depends(_require_flag)],
)
async def admin_reject_other_fee_payment(
    payload: PaymentRejectIn,
    kind: str = Path(pattern=r"^(fee|picnic)$"),
    payment_id: int = Path(gt=0),
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("manage_finance")),
) -> dict:
    return await _review(db, admin, kind, payment_id, "reject", payload.reason)
