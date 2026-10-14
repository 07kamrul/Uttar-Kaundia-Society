"""`GET /api/admin/today`: the admin "today's work" counts (Batch 5).

Open to any admin account; each section is filled only when the caller holds
its permission (see `app.services.admin_today`). Read-only, so it is not behind
the `admin_console` flag - only the UI that shows it is."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_admin
from app.core.permissions import get_effective_permissions
from app.db.session import get_db
from app.models.admin import AdminUser
from app.services.admin_today import build_today

router = APIRouter(prefix="/admin", tags=["admin"])


class ApplicationsOut(BaseModel):
    registrations_pending: int | None
    membership_applications_open: int | None
    total: int


class PaymentVerificationsOut(BaseModel):
    installment: int
    cost_share: int
    total: int


class ComplaintsOut(BaseModel):
    open: int
    due_soon: int
    overdue: int


class PendingOut(BaseModel):
    pending: int


class CommitteeTermsOut(BaseModel):
    expiring_soon: int
    expired: int
    window_days: int


class PhoneFixesOut(BaseModel):
    open: int


class AdminTodayOut(BaseModel):
    as_of: str
    applications: ApplicationsOut | None
    needs_dag: int | None
    payment_verifications: PaymentVerificationsOut | None
    complaints: ComplaintsOut | None
    property_requests: PendingOut | None
    boundaries: PendingOut | None
    committee_terms: CommitteeTermsOut | None
    phone_fixes: PhoneFixesOut | None


@router.get("/today", response_model=AdminTodayOut)
async def admin_today(
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
) -> dict:
    return await build_today(db, await get_effective_permissions(db, admin))
