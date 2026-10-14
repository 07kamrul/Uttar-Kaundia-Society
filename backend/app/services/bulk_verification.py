"""Bulk approval of member-reported payments (Batch 5, flag `admin_bulk_verify`).

The admin confirms an exact selection ("3 payments, total ৳1,500"). The stale
guard rejects the whole request, writing nothing, when that selection no longer
matches the database. After the guard each payment is approved inside its own
SAVEPOINT by the same service functions the single-approve endpoints use, so one
payment that became "no longer due" fails alone and the rest go through. The
caller commits once and notifies the members of approved items.

There is no bulk reject: every rejection needs its own reason.
"""

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cost_share_payment import CostSharePayment
from app.models.installment_payment import PAYMENT_STATUS_PENDING, InstallmentPayment
from app.services import cost_share_payment as cost_share_service
from app.services import installment_payment as installment_service
from app.services.audit import record_audit

Kind = Literal["installment", "cost_share"]
KIND_INSTALLMENT: Kind = "installment"
KIND_COST_SHARE: Kind = "cost_share"

STALE_CODE = "BULK_SELECTION_STALE"
NOT_FOUND = "NOT_FOUND"

_MODELS = {KIND_INSTALLMENT: InstallmentPayment, KIND_COST_SHARE: CostSharePayment}
_CENT = Decimal("0.01")

Item = tuple[Kind, int]


@dataclass(frozen=True)
class Approved:
    kind: Kind
    id: int
    amount: Decimal


@dataclass(frozen=True)
class Failed:
    kind: Kind
    id: int
    code: str


@dataclass(frozen=True)
class BulkResult:
    batch_id: str
    approved: list[Approved]
    failed: list[Failed]

    @property
    def approved_total(self) -> Decimal:
        return sum((a.amount for a in self.approved), start=Decimal("0")).quantize(_CENT)


class _ItemFailure(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def new_batch_id() -> str:
    return uuid.uuid4().hex[:8]


def stale_selection() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": STALE_CODE,
            "message": "The selection changed since it was loaded. Refresh the list and try again.",
        },
    )


async def _load_fresh(db: AsyncSession, kind: Kind, payment_id: int):
    """The payment as the database holds it right now (ignoring cached state)."""
    model = _MODELS[kind]
    result = await db.execute(
        select(model).where(model.id == payment_id).execution_options(populate_existing=True)
    )
    return result.scalars().unique().one_or_none()


async def check_selection(
    db: AsyncSession, items: list[Item], expected_count: int, expected_total: Decimal
) -> None:
    """Raise the stale 409 unless every item exists and is pending, and the
    count and total match what the admin confirmed. Writes nothing."""
    amounts: list[Decimal] = []
    for kind, model in _MODELS.items():
        ids = [payment_id for item_kind, payment_id in items if item_kind == kind]
        if not ids:
            continue
        rows = (await db.execute(select(model).where(model.id.in_(ids)))).scalars().unique().all()
        if len(rows) != len(ids) or any(row.status != PAYMENT_STATUS_PENDING for row in rows):
            raise stale_selection()
        amounts.extend(Decimal(str(row.amount)) for row in rows)
    if len(amounts) != expected_count or sum(amounts, start=Decimal("0")) != expected_total:
        raise stale_selection()


def _stage_audit(db: AsyncSession, admin_id: int, kind: Kind, payment, suffix: str, share=None) -> None:
    if kind == KIND_INSTALLMENT:
        record_audit(
            db,
            actor_admin_id=admin_id,
            action="installment_payment.approve",
            entity_type="installment_payment",
            entity_id=str(payment.id),
            detail=(
                f"{payment.method} {payment.transaction_ref} ৳{payment.amount} "
                f"({installment_service.months_label(payment)}){suffix}"
            ),
        )
        return
    record_audit(
        db,
        actor_admin_id=admin_id,
        action="cost_share_payment.approve",
        entity_type="cost_share_payment",
        entity_id=str(payment.id),
        detail=f"{payment.method} {payment.transaction_ref} ৳{payment.amount} (share {share.id}){suffix}",
    )
    # Same row the single endpoint and the admin PATCH path write.
    record_audit(
        db,
        actor_admin_id=admin_id,
        action="society_cost.payment",
        entity_type="cost_split_share",
        entity_id=str(share.id),
        detail=f"৳{share.amount_paid} paid of ৳{share.amount_due} (status: {share.status}){suffix}",
    )


async def _approve_one(db: AsyncSession, admin_id: int, kind: Kind, payment_id: int, suffix: str) -> Decimal:
    payment = await _load_fresh(db, kind, payment_id)
    if payment is None:
        raise _ItemFailure(NOT_FOUND)
    amount = Decimal(str(payment.amount))
    if kind == KIND_INSTALLMENT:
        await installment_service.approve_payment(db, payment, admin_id)
        _stage_audit(db, admin_id, kind, payment, suffix)
    else:
        share = await cost_share_service.approve_payment(db, payment, admin_id)
        _stage_audit(db, admin_id, kind, payment, suffix, share)
    return amount


async def approve_items(db: AsyncSession, admin_id: int, items: list[Item]) -> BulkResult:
    """Approve each item in its own SAVEPOINT. Caller commits afterwards."""
    batch_id = new_batch_id()
    suffix = f" bulk={batch_id}"
    approved: list[Approved] = []
    failed: list[Failed] = []
    for kind, payment_id in items:
        try:
            async with db.begin_nested():
                amount = await _approve_one(db, admin_id, kind, payment_id, suffix)
        except _ItemFailure as failure:
            failed.append(Failed(kind, payment_id, failure.code))
        except HTTPException as exc:
            code = getattr(exc, "code", None) or (NOT_FOUND if exc.status_code == 404 else None)
            if code is None:
                raise
            failed.append(Failed(kind, payment_id, code))
        else:
            approved.append(Approved(kind, payment_id, amount.quantize(_CENT)))
    return BulkResult(batch_id=batch_id, approved=approved, failed=failed)
