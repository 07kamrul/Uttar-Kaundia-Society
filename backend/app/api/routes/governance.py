"""Read-only governance constants for any authenticated account (admin or
member token): SLA numbers, quorum, the 11 council posts and the allowed
income sources - so the frontend never hardcodes them."""

from fastapi import APIRouter, Depends

from app.core.deps import AccountActor, get_account_actor
from app.services.governance import public_constants

router = APIRouter(prefix="/governance", tags=["governance"])


@router.get("/constants")
async def governance_constants(
    _actor: AccountActor = Depends(get_account_actor),
) -> dict:
    return public_constants()
