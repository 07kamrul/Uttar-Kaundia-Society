"""Read-cache observability and emergency flush (app/core/cache.py)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import clear_all, get_cache_stats, is_enabled
from app.core.deps import AdminUser
from app.core.permissions import require_permission
from app.db.session import get_db
from app.services.audit import record_audit

router = APIRouter(prefix="/admin/cache", tags=["cache"])


@router.get("/stats")
async def cache_stats(
    _admin: AdminUser = Depends(require_permission("manage_system_config")),
) -> dict:
    return {"enabled": is_enabled(), "caches": get_cache_stats()}


@router.post("/clear")
async def clear_caches(
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("manage_system_config")),
) -> dict:
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="cache.clear_all",
        entity_type="cache",
        entity_id="all",
    )
    await db.commit()
    clear_all(reason=f"admin flush by admin_id={admin.id}")
    return {"enabled": is_enabled(), "caches": get_cache_stats()}
