"""Admin-managed payment accounts (bank accounts / MFS numbers members pay into).

Replaces the free-text 'payment_account' config-list rows and the hardcoded
frontend ORG_BANK_INFO / ORG_MFS_INFO constants. Accounts are soft-deleted
(deactivated) so payment snapshots and history stay readable.
"""
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import CacheName, get_or_load
from app.models.payment_account import (
    ACCOUNT_STATUS_ACTIVE,
    ACCOUNT_TYPES,
    PaymentAccount,
)
from app.schemas.payment_account import (
    DUPLICATE_ACCOUNT,
    PAYMENT_ACCOUNT_NOT_FOUND,
    PAYMENT_ACCOUNT_TYPE_MISMATCH,
    PAYMENT_ACCOUNT_INACTIVE,
    PaymentAccountIn,
    PaymentAccountUpdateIn,
    mask_number,
)
from app.services.audit import record_audit

ACTIVE_LIST_CACHE_KEY = "payment_accounts_active"


async def list_accounts(
    db: AsyncSession, *, account_type: str | None = None, account_status: str | None = None
) -> list[PaymentAccount]:
    query = select(PaymentAccount)
    if account_type:
        query = query.where(PaymentAccount.type == account_type)
    if account_status:
        query = query.where(PaymentAccount.status == account_status)
    result = await db.execute(
        query.order_by(PaymentAccount.type, PaymentAccount.display_order, PaymentAccount.id)
    )
    return list(result.scalars())


async def _load_active_accounts(db: AsyncSession) -> list[PaymentAccount]:
    result = await db.execute(
        select(PaymentAccount)
        .where(PaymentAccount.status == ACCOUNT_STATUS_ACTIVE)
        .order_by(PaymentAccount.display_order, PaymentAccount.id)
    )
    return list(result.scalars())


async def list_active_accounts(db: AsyncSession) -> list[PaymentAccount]:
    """Active accounts for payers, TTL-cached; the cache auto-clears on any
    committed write to payment_accounts (TABLE_DEPENDENCIES)."""
    accounts, _ = await get_or_load(CacheName.PUBLIC_LISTS, ACTIVE_LIST_CACHE_KEY,
                                    lambda: _load_active_accounts(db))
    return accounts


async def _ensure_no_duplicate(
    db: AsyncSession, *, account_type: str, provider: str | None,
    account_number: str | None, mfs_number: str | None, exclude_id: int | None = None,
) -> None:
    query = select(PaymentAccount).where(
        PaymentAccount.type == account_type,
        PaymentAccount.status == ACCOUNT_STATUS_ACTIVE,
    )
    if account_type == "bank":
        query = query.where(PaymentAccount.account_number == account_number)
    else:
        query = query.where(PaymentAccount.provider == provider, PaymentAccount.mfs_number == mfs_number)
    if exclude_id is not None:
        query = query.where(PaymentAccount.id != exclude_id)
    existing = (await db.execute(query)).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_ACCOUNT)


def account_snapshot(account: PaymentAccount) -> str:
    """What the admin verification screens and payment history show: the
    account identity with the number masked (last 4 digits only)."""
    if account.type == "bank":
        return f"{account.bank_name} {mask_number(account.account_number)}"
    return f"{(account.provider or 'other').upper()} {mask_number(account.mfs_number)}"


def method_key(account: PaymentAccount) -> str:
    """The legacy payment method string this account maps to (bank, or the
    MFS provider; upay/other fold into 'other' like the old config rows)."""
    if account.type == "bank":
        return "bank"
    return account.provider if account.provider in ("bkash", "nagad", "rocket") else "other"


def to_public_out(account: PaymentAccount):
    """Public shape with the derived method key filled in."""
    from app.schemas.payment_account import PaymentAccountPublicOut

    out = PaymentAccountPublicOut.model_validate(account)
    out.method = method_key(account)
    return out


async def create_account(db: AsyncSession, payload: PaymentAccountIn, admin_id: int) -> PaymentAccount:
    await _ensure_no_duplicate(
        db,
        account_type=payload.type,
        provider=payload.provider,
        account_number=payload.account_number,
        mfs_number=payload.mfs_number,
    )
    account = PaymentAccount(
        **payload.model_dump(),
        status=ACCOUNT_STATUS_ACTIVE,
        created_by=admin_id,
        updated_by=admin_id,
    )
    db.add(account)
    await db.flush()
    record_audit(
        db,
        actor_admin_id=admin_id,
        action="payment_account.create",
        entity_type="payment_account",
        entity_id=str(account.id),
        detail=f"{payload.label} ({account_snapshot(account)})",
    )
    return account


async def update_account(
    db: AsyncSession, account: PaymentAccount, payload: PaymentAccountUpdateIn, admin_id: int
) -> PaymentAccount:
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return account
    merged = PaymentAccountIn(
        type=account.type,
        label=changes.get("label") or account.label,
        bank_name=changes.get("bank_name", account.bank_name),
        branch_name=changes.get("branch_name", account.branch_name),
        account_name=changes.get("account_name", account.account_name),
        account_number=changes.get("account_number", account.account_number),
        routing_number=changes.get("routing_number", account.routing_number),
        provider=changes.get("provider", account.provider),
        mfs_number=changes.get("mfs_number", account.mfs_number),
        account_kind=changes.get("account_kind", account.account_kind),
        account_holder=changes.get("account_holder", account.account_holder),
        instructions=changes.get("instructions", account.instructions),
        display_order=changes.get("display_order", account.display_order),
    )
    await _ensure_no_duplicate(
        db,
        account_type=account.type,
        provider=merged.provider,
        account_number=merged.account_number,
        mfs_number=merged.mfs_number,
        exclude_id=account.id,
    )
    for field, value in merged.model_dump().items():
        setattr(account, field, value)
    account.updated_by = admin_id
    record_audit(
        db,
        actor_admin_id=admin_id,
        action="payment_account.update",
        entity_type="payment_account",
        entity_id=str(account.id),
        detail=f"{account.label} ({account_snapshot(account)})",
    )
    return account


async def set_account_status(
    db: AsyncSession, account: PaymentAccount, new_status: str, admin_id: int
) -> PaymentAccount:
    old_status = account.status
    account.status = new_status
    account.updated_by = admin_id
    record_audit(
        db,
        actor_admin_id=admin_id,
        action="payment_account.status",
        entity_type="payment_account",
        entity_id=str(account.id),
        detail=f"{account.label}: {old_status} -> {new_status} ({account_snapshot(account)})",
    )
    return account


async def reorder_accounts(db: AsyncSession, ordered_ids: list[int], admin_id: int) -> None:
    accounts = {
        account.id: account
        for account in (await db.execute(select(PaymentAccount).where(PaymentAccount.id.in_(ordered_ids))))
        .scalars()
    }
    for position, account_id in enumerate(ordered_ids):
        account = accounts.get(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PAYMENT_ACCOUNT_NOT_FOUND)
        if account.display_order != position:
            account.display_order = position
            account.updated_by = admin_id
            record_audit(
                db,
                actor_admin_id=admin_id,
                action="payment_account.reorder",
                entity_type="payment_account",
                entity_id=str(account.id),
                detail=f"{account.label}: position {position}",
            )


async def load_account(db: AsyncSession, account_id: int) -> PaymentAccount:
    account = (
        await db.execute(select(PaymentAccount).where(PaymentAccount.id == account_id))
    ).scalars().one_or_none()
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PAYMENT_ACCOUNT_NOT_FOUND)
    return account


async def resolve_for_submission(
    db: AsyncSession, account_id: int | None, expected_type: str
) -> tuple[PaymentAccount | None, str | None]:
    """Validate the account a payment claims to have been paid into.

    Returns (account, snapshot) or (None, None) when no account was given.
    The account must exist, match the chosen method's type, and be ACTIVE at
    submission time.
    """
    if account_id is None:
        return None, None
    if expected_type not in ACCOUNT_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=PAYMENT_ACCOUNT_TYPE_MISMATCH)
    account = await load_account(db, account_id)
    if account.type != expected_type:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=PAYMENT_ACCOUNT_TYPE_MISMATCH)
    if account.status != ACCOUNT_STATUS_ACTIVE:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=PAYMENT_ACCOUNT_INACTIVE)
    return account, account_snapshot(account)
