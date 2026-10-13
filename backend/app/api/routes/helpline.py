"""Society helpline: public read (cached) and admin update."""

import json

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import CacheName, cached_response, make_key
from app.core.permissions import require_permission
from app.db.session import get_db
from app.services import app_settings as settings_service
from app.services.audit import record_audit

router = APIRouter(tags=["helpline"])


class HelplineOut(BaseModel):
    phone: str | None = None
    whatsapp: str | None = None
    hours_text: str | None = None
    enabled: bool = False


class HelplineIn(BaseModel):
    phone: str | None = Field(default=None, max_length=32)
    whatsapp: str | None = Field(default=None, max_length=32)
    hours_text: str | None = Field(default=None, max_length=settings_service.HOURS_TEXT_MAX)


@router.get("/public/helpline", response_model=HelplineOut)
async def get_helpline(response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    async def load() -> dict:
        stored = await settings_service.get_setting(db, settings_service.HELPLINE_KEY)
        return settings_service.helpline_view(stored)

    return await cached_response(response, CacheName.PUBLIC_LISTS, make_key("helpline"), load)


@router.put("/admin/helpline", response_model=HelplineOut)
async def update_helpline(
    payload: HelplineIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_permission("manage_system_config")),
) -> dict:
    new_value = {
        "phone": settings_service.normalize_bd_mobile(payload.phone, "phone"),
        "whatsapp": settings_service.normalize_bd_mobile(payload.whatsapp, "whatsapp"),
        "hours_text": (payload.hours_text or "").strip() or None,
    }
    before = settings_service.helpline_view(
        await settings_service.get_setting(db, settings_service.HELPLINE_KEY)
    )
    await settings_service.set_setting(db, settings_service.HELPLINE_KEY, new_value, admin_id=admin.id)
    after = settings_service.helpline_view(new_value)
    record_audit(
        db,
        actor_admin_id=admin.id,
        action="system.helpline_update",
        entity_type="app_setting",
        entity_id=settings_service.HELPLINE_KEY,
        detail=json.dumps({"before": before, "after": after}, ensure_ascii=False),
    )
    await db.commit()
    return after
