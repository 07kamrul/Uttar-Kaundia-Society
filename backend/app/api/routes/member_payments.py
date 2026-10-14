"""Merged member payments (Batch 2): summary, history, cost-share self-payment,
and committee verification of cost-share payments."""

import logging
from datetime import date
from decimal import Decimal
from html import escape

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.installment_payments import _notify_member as _notify_installment_member
from app.api.routes.installment_payments import _require_member
from app.api.routes.other_fee_verification import notify_member as notify_other_fee_member
from app.core.deps import AccountActor, get_account_actor
from app.core.feature_flags import is_enabled
from app.core.permissions import require_permission
from app.db.session import get_db
from app.models.cost_share_payment import CostSharePayment
from app.models.installment_payment import PAYMENT_STATUS_PENDING, PAYMENT_STATUSES, InstallmentPayment
from app.schemas.installment_payment import PaymentRejectIn
from app.schemas.member_payments import (
    BulkApproveIn,
    BulkApproveOut,
    CostSharePaymentAdminOut,
    PaymentHistoryItemOut,
    PaymentHistoryPageOut,
    PaymentSummaryOut,
    PendingVerificationsOut,
)
from app.services import bulk_verification
from app.services import cost_share_payment as cost_share_service
from app.services import member_payments as merged
from app.services import other_fee_verification
from app.services.audit import record_audit
from app.services.email import send_email
from app.services.storage import save_upload_file

router = APIRouter(tags=["member-payments"])
logger = logging.getLogger(__name__)

PAY_FLAG = "pay_merged_page"
ADMIN_LIST_LIMIT = 200


# --- Member -----------------------------------------------------------------


@router.get("/member/payments/summary", response_model=PaymentSummaryOut)
async def payments_summary(
    actor: AccountActor = Depends(get_account_actor), db: AsyncSession = Depends(get_db)
) -> dict:
    member = _require_member(actor)
    return await merged.build_summary(db, member)


@router.get("/member/payments/history", response_model=PaymentHistoryPageOut)
async def payments_history(
    kind: str | None = Query(default=None, pattern=rf"^({'|'.join(merged.KINDS)})$"),
    status_filter: str | None = Query(
        default=None, alias="status", pattern=rf"^({'|'.join(merged.HISTORY_STATUSES)})$"
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=merged.HISTORY_MAX_PAGE_SIZE),
    actor: AccountActor = Depends(get_account_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    member = _require_member(actor)
    return await merged.build_history(
        db, member, kind=kind, status_filter=status_filter, page=page, page_size=page_size
    )


@router.post(
    "/member/payments/cost-shares",
    response_model=PaymentHistoryItemOut,
    status_code=status.HTTP_201_CREATED,
)
async def submit_cost_share_payment(
    share_id: int = Form(...),
    amount: Decimal = Form(..., max_digits=12, decimal_places=2),
    method: str = Form(..., min_length=1, max_length=64),
    transaction_ref: str = Form(..., min_length=4, max_length=64, pattern=r"^[A-Za-z0-9\-_/ ]+$"),
    paid_on: date = Form(...),
    sender_account: str | None = Form(default=None, max_length=64),
    note: str | None = Form(default=None, max_length=500),
    proof: UploadFile | None = File(default=None),
    actor: AccountActor = Depends(get_account_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    member = _require_member(actor)
    if not await is_enabled(db, PAY_FLAG):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "FEATURE_DISABLED", "message": "Cost-share payments are not enabled."},
        )
    payment = await cost_share_service.submit_payment(
        db,
        member=member,
        share_id=share_id,
        amount=amount,
        method=method,
        transaction_ref=transaction_ref,
        paid_on=paid_on,
        sender_account=sender_account,
        note=note,
    )
    # Upload only after every validation passed, so rejected submissions
    # never leave orphaned files behind.
    if proof is not None and proof.filename:
        payment.proof_url = await save_upload_file(proof, f"cost_share_payments/member_{member.id}")
    await db.commit()
    return merged.cost_share_item(await _load_payment(db, payment.id))


# --- Admin ------------------------------------------------------------------


async def _load_payment(db: AsyncSession, payment_id: int) -> CostSharePayment:
    result = await db.execute(
        select(CostSharePayment)
        .where(CostSharePayment.id == payment_id)
        .execution_options(populate_existing=True)
    )
    payment = result.scalars().unique().one_or_none()
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return payment


def _admin_out(payment: CostSharePayment) -> CostSharePaymentAdminOut:
    share, member = payment.share, payment.member
    cost = share.split.cost if share is not None and share.split is not None else None
    return CostSharePaymentAdminOut(
        id=payment.id,
        member_id=payment.member_id,
        member_name=member.full_name if member is not None else None,
        member_display_id=member.member_id if member is not None else None,
        share_id=payment.share_id,
        cost_title=cost.title if cost is not None else None,
        amount_due=share.amount_due,
        amount_paid=share.amount_paid,
        remaining=max(share.amount_due - share.amount_paid, Decimal("0")),
        method=payment.method,
        transaction_ref=payment.transaction_ref,
        sender_account=payment.sender_account,
        amount=payment.amount,
        paid_on=payment.paid_on,
        proof_url=payment.proof_url,
        note=payment.note,
        status=payment.status,
        rejection_reason=payment.rejection_reason,
        reviewed_at=payment.reviewed_at,
        created_at=payment.created_at,
    )


async def _notify_member(payment: CostSharePayment) -> None:
    member = payment.member
    if member is None or not member.email:
        return
    cost = payment.share.split.cost if payment.share is not None and payment.share.split is not None else None
    title = escape(cost.title if cost is not None else "")
    if payment.status == "approved":
        subject = "খরচের ভাগ পরিশোধ নিশ্চিত হয়েছে / Payment confirmed"
        body = (
            f"<p>প্রিয় {escape(member.full_name)},</p>"
            f"<p>আপনার ৳{payment.amount} পরিশোধ ({title}) যাচাই করে গ্রহণ করা হয়েছে। ধন্যবাদ।</p>"
            f"<p>Your payment of ৳{payment.amount} for {title} has been verified. Thank you.</p>"
        )
    else:
        reason = escape(payment.rejection_reason or "")
        subject = "খরচের ভাগ পরিশোধ যাচাই করা যায়নি / Payment could not be verified"
        body = (
            f"<p>প্রিয় {escape(member.full_name)},</p>"
            f"<p>আপনার ৳{payment.amount} পরিশোধ ({title}) যাচাই করা যায়নি। কারণ: {reason}</p>"
            f"<p>Your payment for {title} could not be verified. Reason: {reason}.</p>"
        )
    await send_email(member.email, subject, body)


@router.get("/admin/cost-share-payments", response_model=list[CostSharePaymentAdminOut])
async def admin_list_cost_share_payments(
    status_filter: str | None = Query(default=None, alias="status", pattern=rf"^({'|'.join(PAYMENT_STATUSES)})$"),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission("manage_finance")),
) -> list[CostSharePaymentAdminOut]:
    query = select(CostSharePayment)
    if status_filter:
        query = query.where(CostSharePayment.status == status_filter)
    result = await db.execute(
        query.order_by(CostSharePayment.created_at.desc(), CostSharePayment.id.desc()).limit(ADMIN_LIST_LIMIT)
    )
    return [_admin_out(p) for p in result.scalars().unique()]


async def _count_pending(db: AsyncSession, model) -> int:
    result = await db.execute(select(func.count(model.id)).where(model.status == PAYMENT_STATUS_PENDING))
    return int(result.scalar_one())


@router.get("/admin/cost-share-payments/pending-count")
async def admin_cost_share_pending_count(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission("manage_finance")),
) -> dict[str, int]:
    return {"count": await _count_pending(db, CostSharePayment)}


@router.get("/admin/payment-verifications/pending-count", response_model=PendingVerificationsOut)
async def admin_pending_verifications(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission("manage_finance")),
) -> dict[str, int]:
    installment = await _count_pending(db, InstallmentPayment)
    cost_share = await _count_pending(db, CostSharePayment)
    other_fee = await other_fee_verification.count_pending(db)
    return {
        "installment": installment,
        "cost_share": cost_share,
        "other_fee": other_fee,
        "total": installment + cost_share + other_fee,
    }


@router.post("/admin/cost-share-payments/{payment_id}/approve", response_model=CostSharePaymentAdminOut)
async def admin_approve_cost_share_payment(
    payment_id: int,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("manage_finance")),
) -> CostSharePaymentAdminOut:
    payment = await _load_payment(db, payment_id)
    share = await cost_share_service.approve_payment(db, payment, admin.id)
    detail = f"{payment.method} {payment.transaction_ref} ৳{payment.amount} (share {share.id})"
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="cost_share_payment.approve",
        entity_type="cost_share_payment",
        entity_id=str(payment.id),
        detail=detail,
    )
    # Same row the admin PATCH path writes, so existing audit views see it.
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="society_cost.payment",
        entity_type="cost_split_share",
        entity_id=str(share.id),
        detail=f"৳{share.amount_paid} paid of ৳{share.amount_due} (status: {share.status})",
    )
    await db.commit()
    payment = await _load_payment(db, payment_id)
    await _notify_member(payment)
    return _admin_out(payment)


@router.post("/admin/cost-share-payments/{payment_id}/reject", response_model=CostSharePaymentAdminOut)
async def admin_reject_cost_share_payment(
    payment_id: int,
    payload: PaymentRejectIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("manage_finance")),
) -> CostSharePaymentAdminOut:
    payment = await _load_payment(db, payment_id)
    cost_share_service.reject_payment(payment, admin.id, payload.reason)
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="cost_share_payment.reject",
        entity_type="cost_share_payment",
        entity_id=str(payment.id),
        detail=payload.reason,
    )
    await db.commit()
    payment = await _load_payment(db, payment_id)
    await _notify_member(payment)
    return _admin_out(payment)


BULK_FLAG = "admin_bulk_verify"


async def _notify_approved(db: AsyncSession, result: bulk_verification.BulkResult) -> None:
    """Best effort, after the commit, approved items only: a mail failure never
    undoes (or hides) an approval."""
    for item in result.approved:
        try:
            payment = await bulk_verification._load_fresh(db, item.kind, item.id)
            if payment is None:
                continue
            if item.kind == bulk_verification.KIND_OTHER_FEE:
                await notify_other_fee_member(payment)
            elif item.kind == bulk_verification.KIND_INSTALLMENT:
                await _notify_installment_member(payment)
            else:
                await _notify_member(payment)
        except Exception:  # noqa: BLE001
            logger.exception("bulk approval notification failed for %s %s", item.kind, item.id)


@router.post("/admin/payment-verifications/bulk-approve", response_model=BulkApproveOut)
async def admin_bulk_approve(
    payload: BulkApproveIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("manage_finance")),
) -> dict:
    if not await is_enabled(db, BULK_FLAG):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "FEATURE_DISABLED", "message": "Bulk approval is not enabled."},
        )
    items = [
        (item.kind, bulk_verification.encode_other_fee(item.id_ref) if item.kind == "other_fee" else item.id)
        for item in payload.items
    ]
    await bulk_verification.check_selection(db, items, payload.expected_count, payload.expected_total)
    result = await bulk_verification.approve_items(db, admin.id, items)
    await db.commit()
    await _notify_approved(db, result)
    return {
        "batch_id": result.batch_id,
        "approved_count": len(result.approved),
        "approved_total": result.approved_total,
        "approved": [
            {"kind": a.kind, "id": a.id, "id_ref": a.id_ref, "amount": a.amount} for a in result.approved
        ],
        "failed": [{"kind": f.kind, "id": f.id, "id_ref": f.id_ref, "code": f.code} for f in result.failed],
    }
