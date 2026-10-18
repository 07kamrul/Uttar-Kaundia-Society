"""Admin management of the society payment accounts members pay into."""

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_account_actor
from app.core.permissions import require_permission
from app.db.session import get_db
from app.models.payment_account import ACCOUNT_STATUSES, ACCOUNT_TYPES
from app.schemas.payment_account import (
    PaymentAccountIn,
    PaymentAccountOut,
    PaymentAccountPublicOut,
    PaymentAccountReorderIn,
    PaymentAccountStatusIn,
    PaymentAccountUpdateIn,
)
from app.services import payment_accounts as accounts
from app.services.storage import save_upload_file

router = APIRouter(tags=["payment-accounts"])


# --- Member / any authenticated payer ----------------------------------------


@router.get("/payment-accounts", response_model=list[PaymentAccountPublicOut])
async def list_active_payment_accounts(
    actor=Depends(get_account_actor),
    db: AsyncSession = Depends(get_db),
) -> list[PaymentAccountPublicOut]:
    """Active accounts only - enforced here, never by the client. Account
    details are not public: any authenticated account holder may read them,
    anonymous callers may not."""
    return [
        accounts.to_public_out(account)
        for account in await accounts.list_active_accounts(db)
    ]


# --- Admin -------------------------------------------------------------------


@router.get("/admin/payment-accounts", response_model=list[PaymentAccountOut])
async def admin_list_payment_accounts(
    type_filter: str | None = Query(default=None, alias="type", pattern=rf"^({'|'.join(ACCOUNT_TYPES)})$"),
    status_filter: str | None = Query(default=None, alias="status", pattern=rf"^({'|'.join(ACCOUNT_STATUSES)})$"),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission("manage_payment_accounts")),
) -> list[PaymentAccountOut]:
    return [
        PaymentAccountOut.model_validate(account)
        for account in await accounts.list_accounts(db, account_type=type_filter, account_status=status_filter)
    ]


@router.post(
    "/admin/payment-accounts",
    response_model=PaymentAccountOut,
    status_code=201,
)
async def admin_create_payment_account(
    payload: PaymentAccountIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("manage_payment_accounts")),
) -> PaymentAccountOut:
    account = await accounts.create_account(db, payload, admin.id)
    await db.commit()
    await db.refresh(account)
    return PaymentAccountOut.model_validate(account)


@router.put("/admin/payment-accounts/{account_id}", response_model=PaymentAccountOut)
async def admin_update_payment_account(
    account_id: int,
    payload: PaymentAccountUpdateIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("manage_payment_accounts")),
) -> PaymentAccountOut:
    account = await accounts.load_account(db, account_id)
    account = await accounts.update_account(db, account, payload, admin.id)
    await db.commit()
    await db.refresh(account)
    return PaymentAccountOut.model_validate(account)


@router.patch("/admin/payment-accounts/{account_id}/status", response_model=PaymentAccountOut)
async def admin_set_payment_account_status(
    account_id: int,
    payload: PaymentAccountStatusIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("manage_payment_accounts")),
) -> PaymentAccountOut:
    account = await accounts.load_account(db, account_id)
    account = await accounts.set_account_status(db, account, payload.status, admin.id)
    await db.commit()
    await db.refresh(account)
    return PaymentAccountOut.model_validate(account)


@router.patch("/admin/payment-accounts/reorder", response_model=list[PaymentAccountOut])
async def admin_reorder_payment_accounts(
    payload: PaymentAccountReorderIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("manage_payment_accounts")),
) -> list[PaymentAccountOut]:
    await accounts.reorder_accounts(db, payload.ids, admin.id)
    await db.commit()
    return [
        PaymentAccountOut.model_validate(account) for account in await accounts.list_accounts(db)
    ]


@router.post("/admin/payment-accounts/upload-qr", response_model=dict)
async def admin_upload_payment_account_qr(
    qr_image: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission("manage_payment_accounts")),
) -> dict[str, str]:
    url = await save_upload_file(qr_image, "payment_accounts/qr")
    return {"url": url}
