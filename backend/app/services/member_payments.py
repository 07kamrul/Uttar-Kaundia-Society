"""Merged member payments view: summary and combined history across
installments, other fees (incl. picnic) and cost shares."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cost_share_payment import CostSharePayment
from app.models.fee_payment import FeePayment
from app.models.installment import Installment, InstallmentStatus
from app.models.installment_payment import (
    PAYMENT_STATUS_APPROVED,
    PAYMENT_STATUS_PENDING,
    InstallmentPayment,
)
from app.models.member import Member
from app.models.picnic_payment import PicnicPayment
from app.models.society_cost import CostSplitShare
from app.schemas.other_fees import OtherFeeTypeOut
from app.services import installment_payment as installment_service
from app.services.cost_share_payment import pending_sums_by_share
from app.services.other_fees import INSTALLMENT_FEE_TYPE, other_fee_history, resolve_other_fee_types

KIND_INSTALLMENT = "installment"
KIND_OTHER_FEE = "other_fee"
KIND_COST_SHARE = "cost_share"
KINDS = (KIND_INSTALLMENT, KIND_OTHER_FEE, KIND_COST_SHARE)
STATUS_RECORDED = "recorded"
HISTORY_STATUSES = ("pending", "approved", "rejected", STATUS_RECORDED)
HISTORY_MAX_PAGE_SIZE = 100
ZERO = Decimal("0")


def _dec(value) -> Decimal:
    return Decimal(str(value if value is not None else 0))


async def build_summary(db: AsyncSession, member: Member) -> dict:
    installment_due = list(
        (
            await db.execute(
                select(Installment)
                .where(Installment.member_id == member.id, Installment.status == InstallmentStatus.DUE)
                .order_by(Installment.year, Installment.month)
            )
        ).scalars()
    )
    held = await installment_service._pending_installment_ids(db, member.id)
    dues: list[dict] = []
    total_due = ZERO
    for inst in installment_due:
        is_pending = inst.id in held
        amount = _dec(inst.amount)
        dues.append(
            {
                "kind": KIND_INSTALLMENT,
                "ref_id": inst.id,
                "title": f"কিস্তি {inst.month:02d}/{inst.year}",
                "amount": amount,
                "due_date": None,
                "pending": is_pending,
            }
        )
        if not is_pending:
            total_due += amount

    shares = list(
        (
            await db.execute(select(CostSplitShare).where(CostSplitShare.member_id == member.id))
        ).scalars().unique()
    )
    share_pending = await pending_sums_by_share(db, [s.id for s in shares])
    total_paid = sum((_dec(s.amount_paid) for s in shares), start=ZERO)
    for share in shares:
        unpaid = _dec(share.amount_due) - _dec(share.amount_paid)
        if unpaid <= 0:
            continue
        held_amount = share_pending.get(share.id, ZERO)
        payable = max(unpaid - held_amount, ZERO)
        cost = share.split.cost if share.split is not None else None
        dues.append(
            {
                "kind": KIND_COST_SHARE,
                "ref_id": share.id,
                "title": cost.title if cost is not None else "খরচের ভাগ",
                "amount": payable,
                "due_date": None,
                "pending": held_amount > 0,
            }
        )
        total_due += payable

    approved_installments = (
        await db.execute(
            select(func.coalesce(func.sum(InstallmentPayment.amount), 0)).where(
                InstallmentPayment.member_id == member.id, InstallmentPayment.status == PAYMENT_STATUS_APPROVED
            )
        )
    ).scalar_one()
    fees = await other_fee_history(db, member_id=member.id, page=1, page_size=1)
    total_paid += _dec(approved_installments) + _dec(fees["summary"]["total_paid"])

    pending_i = (
        await db.execute(
            select(func.count(InstallmentPayment.id), func.coalesce(func.sum(InstallmentPayment.amount), 0)).where(
                InstallmentPayment.member_id == member.id, InstallmentPayment.status == PAYMENT_STATUS_PENDING
            )
        )
    ).one()
    pending_c = (
        await db.execute(
            select(func.count(CostSharePayment.id), func.coalesce(func.sum(CostSharePayment.amount), 0)).where(
                CostSharePayment.member_id == member.id, CostSharePayment.status == PAYMENT_STATUS_PENDING
            )
        )
    ).one()

    fee_types = await resolve_other_fee_types(db, date.today(), member=member)
    return {
        "currency": "BDT",
        "total_due": total_due,
        "total_paid": total_paid,
        "pending_count": int(pending_i[0]) + int(pending_c[0]),
        "pending_amount": _dec(pending_i[1]) + _dec(pending_c[1]),
        "dues": dues,
        "payable_fee_types": [
            OtherFeeTypeOut(**t) for t in fee_types if not (t["pay_once"] and t["already_paid"])
        ],
        "accounts": await installment_service.list_payment_accounts(db),
    }


def _sort_key(created_at: datetime | None, item_id: int) -> tuple:
    stamp = created_at.replace(tzinfo=None) if created_at is not None else datetime.min
    return (stamp, item_id)


def installment_item(payment: InstallmentPayment) -> dict:
    months = ", ".join(f"{i.month:02d}/{i.year}" for i in payment.installments)
    return {
        "kind": KIND_INSTALLMENT,
        "id": payment.id,
        "title": f"কিস্তি {months}",
        "amount": payment.amount,
        "method": payment.method,
        "reference": payment.transaction_ref,
        "date": payment.paid_on,
        "status": payment.status,
        "rejection_reason": payment.rejection_reason,
        "proof_url": payment.proof_url,
    }


def cost_share_item(payment: CostSharePayment) -> dict:
    cost = payment.share.split.cost if payment.share is not None and payment.share.split is not None else None
    return {
        "kind": KIND_COST_SHARE,
        "id": payment.id,
        "title": cost.title if cost is not None else "খরচের ভাগ",
        "amount": payment.amount,
        "method": payment.method,
        "reference": payment.transaction_ref,
        "date": payment.paid_on,
        "status": payment.status,
        "rejection_reason": payment.rejection_reason,
        "proof_url": payment.proof_url,
    }


def _fee_item(row: FeePayment) -> dict:
    return {
        "kind": KIND_OTHER_FEE,
        "id": row.id,
        "title": row.fee_type.replace("_", " ").title(),
        "amount": row.amount,
        "method": row.payment_method,
        "reference": row.receipt_no,
        "date": row.payment_date,
        "status": STATUS_RECORDED,
        "rejection_reason": None,
        "proof_url": None,
    }


def _picnic_item(row: PicnicPayment) -> dict:
    return {
        "kind": KIND_OTHER_FEE,
        "id": row.id,
        "title": "Picnic",
        "amount": row.total,
        "method": row.payment_method,
        "reference": row.receipt_no,
        "date": row.payment_date,
        "status": STATUS_RECORDED,
        "rejection_reason": None,
        "proof_url": None,
    }


async def build_history(
    db: AsyncSession,
    member: Member,
    *,
    kind: str | None,
    status_filter: str | None,
    page: int,
    page_size: int,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), HISTORY_MAX_PAGE_SIZE)
    entries: list[tuple[tuple, dict]] = []

    def wanted(item_kind: str, item_status: str) -> bool:
        return (kind is None or kind == item_kind) and (status_filter is None or status_filter == item_status)

    if kind in (None, KIND_INSTALLMENT) and status_filter != STATUS_RECORDED:
        for p in await installment_service.list_member_payments(db, member.id):
            if wanted(KIND_INSTALLMENT, p.status):
                entries.append((_sort_key(p.created_at, p.id), installment_item(p)))
    if kind in (None, KIND_COST_SHARE) and status_filter != STATUS_RECORDED:
        rows = await db.execute(select(CostSharePayment).where(CostSharePayment.member_id == member.id))
        for p in rows.scalars().unique():
            if wanted(KIND_COST_SHARE, p.status):
                entries.append((_sort_key(p.created_at, p.id), cost_share_item(p)))
    if kind in (None, KIND_OTHER_FEE) and status_filter in (None, STATUS_RECORDED):
        fee_rows = await db.execute(
            select(FeePayment).where(
                FeePayment.member_id == member.id, FeePayment.fee_type != INSTALLMENT_FEE_TYPE
            )
        )
        for row in fee_rows.scalars().unique():
            entries.append((_sort_key(row.created_at, row.id), _fee_item(row)))
        picnic_rows = await db.execute(select(PicnicPayment).where(PicnicPayment.member_id == member.id))
        for row in picnic_rows.scalars().unique():
            entries.append((_sort_key(row.created_at, row.id), _picnic_item(row)))

    entries.sort(key=lambda pair: (pair[0], pair[1]["kind"]), reverse=True)
    start = (page - 1) * page_size
    return {
        "items": [item for _, item in entries[start : start + page_size]],
        "total": len(entries),
        "page": page,
        "page_size": page_size,
    }
