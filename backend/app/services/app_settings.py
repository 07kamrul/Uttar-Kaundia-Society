"""Admin-editable application settings (key/value JSON) and the helpline."""

import phonenumbers
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting
from app.services.normalization import _parse_phone

HELPLINE_KEY = "helpline"
ALLOWED_KEYS = frozenset({HELPLINE_KEY})
HOURS_TEXT_MAX = 200
_EMPTY_HELPLINE = {"phone": None, "whatsapp": None, "hours_text": None}


def _check_key(key: str) -> None:
    if key not in ALLOWED_KEYS:
        raise ValueError(f"Unknown app setting: {key}")


async def get_setting(db: AsyncSession, key: str) -> dict | None:
    _check_key(key)
    row = await db.get(AppSetting, key)
    return None if row is None else dict(row.value)


async def set_setting(db: AsyncSession, key: str, value: dict, *, admin_id: int | None) -> None:
    """Upsert a setting. Caller commits."""
    _check_key(key)
    row = await db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value=value, updated_by=admin_id))
    else:
        row.value = value
        row.updated_by = admin_id


def normalize_bd_mobile(raw: str | None, field: str) -> str | None:
    """E.164 (+8801...) for a Bangladeshi number; empty/None clears. Accepts
    Bangla digits and 01... / +880... / 880... forms."""
    if raw is None or not raw.strip():
        return None
    parsed = _parse_phone(raw)
    if (
        parsed is None
        or phonenumbers.region_code_for_number(parsed) != "BD"
        or not phonenumbers.is_valid_number(parsed)
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "INVALID_BD_MOBILE",
                "message": "Enter a valid Bangladeshi mobile number.",
                "field": field,
            },
        )
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


def helpline_view(stored: dict | None) -> dict:
    data = {**_EMPTY_HELPLINE, **(stored or {})}
    return {
        "phone": data["phone"],
        "whatsapp": data["whatsapp"],
        "hours_text": data["hours_text"],
        "enabled": bool(data["phone"] or data["whatsapp"]),
    }
