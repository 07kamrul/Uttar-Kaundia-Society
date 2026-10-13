"""Feature flags: public read for the clients, admin read/override."""

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import CacheName, cached_response, make_key
from app.core.deps import AdminUser
from app.core.feature_flags import FEATURE_FLAGS, FlagDef, load_overrides
from app.core.permissions import require_permission
from app.db.session import get_db
from app.models.feature_flag import FeatureFlag
from app.services.audit import record_audit

router = APIRouter(tags=["feature-flags"])


class PublicFeatureFlagsOut(BaseModel):
    flags: dict[str, bool]


class FeatureFlagOut(BaseModel):
    key: str
    enabled: bool
    default: bool
    description: str
    updated_at: datetime | None


class FeatureFlagUpdate(BaseModel):
    enabled: bool


def _to_out(flag: FlagDef, override: FeatureFlag | None) -> FeatureFlagOut:
    return FeatureFlagOut(
        key=flag.key,
        enabled=flag.default if override is None else bool(override.enabled),
        default=flag.default,
        description=flag.description,
        updated_at=None if override is None else override.updated_at,
    )


@router.get("/public/feature-flags", response_model=PublicFeatureFlagsOut)
async def public_feature_flags(
    response: Response, db: AsyncSession = Depends(get_db)
) -> PublicFeatureFlagsOut:
    async def load() -> PublicFeatureFlagsOut:
        overrides = await load_overrides(db)
        return PublicFeatureFlagsOut(
            flags={key: _to_out(flag, overrides.get(key)).enabled for key, flag in FEATURE_FLAGS.items()}
        )

    return await cached_response(response, CacheName.PUBLIC_LISTS, make_key("feature_flags"), load)


@router.get("/admin/feature-flags", response_model=list[FeatureFlagOut])
async def list_feature_flags(
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("manage_system_config")),
) -> list[FeatureFlagOut]:
    overrides = await load_overrides(db)
    return [_to_out(flag, overrides.get(key)) for key, flag in FEATURE_FLAGS.items()]


@router.put("/admin/feature-flags/{key}", response_model=FeatureFlagOut)
async def update_feature_flag(
    key: str,
    payload: FeatureFlagUpdate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("manage_system_config")),
) -> FeatureFlagOut:
    flag = FEATURE_FLAGS.get(key)
    if flag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown feature flag")

    override = await db.get(FeatureFlag, key)
    old_enabled = flag.default if override is None else bool(override.enabled)
    if override is None:
        override = FeatureFlag(key=key, enabled=payload.enabled, updated_by_admin_id=admin.id)
        db.add(override)
    else:
        override.enabled = payload.enabled
        override.updated_by_admin_id = admin.id

    record_audit(
        db,
        actor_admin_id=admin.id,
        action="feature_flag.update",
        entity_type="feature_flag",
        entity_id=key,
        detail=json.dumps({"old": old_enabled, "new": payload.enabled}),
    )
    await db.commit()
    await db.refresh(override)
    return _to_out(flag, override)
