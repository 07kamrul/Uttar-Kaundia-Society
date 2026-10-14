"""Committee verification of other-fee and picnic payments (flag
`pay_verify_other_fees`).

Two tables (`fee_payments`, `picnic_payments`) share one review flow, addressed
by `kind` ("fee" | "picnic") plus the row id. With the flag off nothing here
runs: rows are created `approved` exactly as before.
"""

import re
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cost_share_payment import CostSharePayment
from app.models.fee_payment import FeePayment
from app.models.installment_payment import (
    PAYMENT_STATUS_APPROVED,
    PAYMENT_STATUS_PENDING,
    PAYMENT_STATUS_REJECTED,
    InstallmentPayment,
)
from app.models.member import Member
from app.models.picnic_payment import PicnicPayment
from app.services.audit import record_audit
from app.services.installment_payment import PaymentConflict

FLAG = "pay_verify_other_fees"
KIND_FEE = "fee"
KIND_PICNIC = "picnic"
KINDS = (KIND_FEE, KIND_PICNIC)
_MODELS = {KIND_FEE: FeePayment, KIND_PICNIC: PicnicPayment}
MOBILE_MONEY_METHODS = frozenset({"bkash", "nagad", "rocket"})
_REFERENCE_RE = re.compile(r"^[A-Za-z0-9\-_/ ]{4,64}$")
ZERO = Decimal("0")

# Id encoding shared with bulk approval: "fee:<id>" / "picnic:<id>".
_ID_REF_RE = re.compile(r"^(fee|picnic):([1-9][0-9]*)$")


def parse_id_ref(id_ref: str) -> tuple[str, int]:
    match = _ID_REF_RE.match(id_ref or "")
    if match is None:
        raise ValueError("id_ref must look like 'fee:<id>' or 'picnic:<id>'")
    return match.group(1), int(match.group(2))


def format_id_ref(kind: str, payment_id: int) -> str:
    return f"{kind}:{payment_id}"


def kind_of(payment: FeePayment | PicnicPayment) -> str:
    return KIND_PICNIC if isinstance(payment, PicnicPayment) else KIND_FEE


def payment_amount(payment: FeePayment | PicnicPayment) -> Decimal:
    return Decimal(str(payment.total if isinstance(payment, PicnicPayment) else payment.amount))


def _coded(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


async def stage_pending(db: AsyncSession, member: Member, payment: FeePayment | PicnicPayment) -> None:
    """Make a freshly built payment pending: require a valid reference for
    mobile-money methods and refuse one that is live for another member."""
    method = (payment.payment_method or "").strip().casefold()
    reference = (payment.receipt_no or "").strip().upper() or None
    if method in MOBILE_MONEY_METHODS and (reference is None or _REFERENCE_RE.match(reference) is None):
        raise _coded(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "REFERENCE_REQUIRED",
            "A valid transaction ID is required for this payment method.",
        )
    payment.receipt_no = reference
    payment.status = PAYMENT_STATUS_PENDING
    if reference is not None:
        await _ensure_reference_not_used_by_others(db, member.id, method, reference)


async def _ensure_reference_not_used_by_others(
    db: AsyncSession, member_id: int, method: str, reference: str
) -> None:
    checks = (
        (InstallmentPayment, InstallmentPayment.method, InstallmentPayment.transaction_ref),
        (CostSharePayment, CostSharePayment.method, CostSharePayment.transaction_ref),
        (FeePayment, FeePayment.payment_method, FeePayment.receipt_no),
        (PicnicPayment, PicnicPayment.payment_method, PicnicPayment.receipt_no),
    )
    for model, method_col, ref_col in checks:
        found = await db.execute(
            select(model.id).where(
                func.lower(method_col) == method,
                func.upper(ref_col) == reference,
                model.status != PAYMENT_STATUS_REJECTED,
                model.member_id != member_id,
            )
        )
        if found.first() is not None:
            raise _coded(
                status.HTTP_409_CONFLICT,
                "DUPLICATE_TRANSACTION_REF",
                "This transaction ID has already been submitted.",
            )


async def has_live_fee_payment(db: AsyncSession, member_id: int, fee_type: str) -> bool:
    """A pending or approved payment of this fee type (rejected never counts)."""
    found = await db.execute(
        select(FeePayment.id).where(
            FeePayment.member_id == member_id,
            FeePayment.fee_type == fee_type,
            FeePayment.status != PAYMENT_STATUS_REJECTED,
        )
    )
    return found.first() is not None


async def load_payment(db: AsyncSession, kind: str, payment_id: int) -> FeePayment | PicnicPayment:
    model = _MODELS[kind]
    result = await db.execute(
        select(model).where(model.id == payment_id).execution_options(populate_existing=True)
    )
    payment = result.scalars().unique().one_or_none()
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return payment


def _ensure_pending(payment) -> None:
    if payment.status != PAYMENT_STATUS_PENDING:
        raise PaymentConflict("This payment has already been reviewed.", code="ALREADY_REVIEWED")


def approve_payment(payment, admin_id: int) -> None:
    _ensure_pending(payment)
    payment.status = PAYMENT_STATUS_APPROVED
    payment.reviewed_by = admin_id
    payment.reviewed_at = datetime.now(timezone.utc)


def reject_payment(payment, admin_id: int, reason: str) -> None:
    _ensure_pending(payment)
    payment.status = PAYMENT_STATUS_REJECTED
    payment.rejection_reason = reason.strip()
    payment.reviewed_by = admin_id
    payment.reviewed_at = datetime.now(timezone.utc)


def stage_audit(db: AsyncSession, admin_id: int, action: str, payment, suffix: str = "") -> None:
    kind = kind_of(payment)
    detail = (
        f"{kind} {payment.payment_method or '-'} {payment.receipt_no or '-'} "
        f"৳{payment_amount(payment)}{suffix}"
    )
    record_audit(
        db,
        actor_admin_id=admin_id,
        action=f"other_fee_payment.{action}",
        entity_type="other_fee_payment",
        entity_id=format_id_ref(kind, payment.id),
        detail=detail,
    )


def label_of(payment) -> str:
    fee_type = "picnic" if isinstance(payment, PicnicPayment) else payment.fee_type
    return fee_type.replace("_", " ").title()


def admin_item(payment) -> dict:
    kind = kind_of(payment)
    member = payment.member
    return {
        "kind": kind,
        "id": payment.id,
        "id_ref": format_id_ref(kind, payment.id),
        "member_id": payment.member_id,
        "member_name": member.full_name if member is not None else None,
        "member_display_id": member.member_id if member is not None else None,
        "fee_type": "picnic" if kind == KIND_PICNIC else payment.fee_type,
        "fee_label": label_of(payment),
        "amount": payment_amount(payment),
        "method": payment.payment_method,
        "reference": payment.receipt_no,
        "payment_method": payment.payment_method,
        "receipt_no": payment.receipt_no,
        "payment_date": payment.payment_date,
        "proof_url": payment.proof_url,
        "date": payment.payment_date,
        "status": payment.status,
        "rejection_reason": payment.rejection_reason,
        "reviewed_at": payment.reviewed_at,
        "created_at": payment.created_at,
    }


async def list_admin(
    db: AsyncSession, *, status_filter: str | None, kind: str | None, limit: int
) -> list[dict]:
    rows = []
    for k in KINDS:
        if kind not in (None, k):
            continue
        model = _MODELS[k]
        query = select(model)
        if status_filter:
            query = query.where(model.status == status_filter)
        result = await db.execute(query.order_by(model.created_at.desc(), model.id.desc()).limit(limit))
        rows.extend(result.scalars().unique())
    rows.sort(
        key=lambda p: (p.created_at.replace(tzinfo=None) if p.created_at else datetime.min, p.id),
        reverse=True,
    )
    return [admin_item(p) for p in rows[:limit]]


async def count_pending(db: AsyncSession) -> int:
    """Pending rows across both tables, in a single statement."""
    counts = [
        select(func.count(model.id)).where(model.status == PAYMENT_STATUS_PENDING).scalar_subquery()
        for model in _MODELS.values()
    ]
    return int((await db.execute(select(counts[0] + counts[1]))).scalar_one() or 0)


async def pending_for_member(db: AsyncSession, member_id: int) -> tuple[int, Decimal]:
    count, amount = 0, ZERO
    for model, amount_col in ((FeePayment, FeePayment.amount), (PicnicPayment, PicnicPayment.total)):
        row = (
            await db.execute(
                select(func.count(model.id), func.coalesce(func.sum(amount_col), 0)).where(
                    model.member_id == member_id, model.status == PAYMENT_STATUS_PENDING
                )
            )
        ).one()
        count += int(row[0])
        amount += Decimal(str(row[1]))
    return count, amount
