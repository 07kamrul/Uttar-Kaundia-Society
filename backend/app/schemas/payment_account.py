"""Admin-managed payment accounts (bank accounts / MFS numbers).

Validation errors are key-like detail codes the clients translate - never
human sentences (see app/services/normalization.py for the convention).
"""
import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.payment_account import (
    ACCOUNT_KINDS,
    ACCOUNT_STATUSES,
    ACCOUNT_TYPES,
    MFS_PROVIDERS,
)
from app.services.normalization import ascii_digits

# Key-like 422 detail codes the frontend translates.
PAYMENT_ACCOUNT_TYPE_INVALID = "PAYMENT_ACCOUNT_TYPE_INVALID"
PAYMENT_ACCOUNT_PROVIDER_INVALID = "PAYMENT_ACCOUNT_PROVIDER_INVALID"
PAYMENT_ACCOUNT_KIND_INVALID = "PAYMENT_ACCOUNT_KIND_INVALID"
PAYMENT_ACCOUNT_STATUS_INVALID = "PAYMENT_ACCOUNT_STATUS_INVALID"
BANK_NAME_REQUIRED = "BANK_NAME_REQUIRED"
BRANCH_NAME_REQUIRED = "BRANCH_NAME_REQUIRED"
ACCOUNT_NAME_REQUIRED = "ACCOUNT_NAME_REQUIRED"
ACCOUNT_NUMBER_REQUIRED = "ACCOUNT_NUMBER_REQUIRED"
ACCOUNT_NUMBER_INVALID = "ACCOUNT_NUMBER_INVALID"
ROUTING_NUMBER_REQUIRED = "ROUTING_NUMBER_REQUIRED"
ROUTING_NUMBER_INVALID = "ROUTING_NUMBER_INVALID"
MFS_NUMBER_REQUIRED = "MFS_NUMBER_REQUIRED"
MFS_NUMBER_INVALID = "MFS_NUMBER_INVALID"
LABEL_REQUIRED = "LABEL_REQUIRED"
DUPLICATE_ACCOUNT = "DUPLICATE_ACCOUNT"
PAYMENT_ACCOUNT_NOT_FOUND = "PAYMENT_ACCOUNT_NOT_FOUND"
PAYMENT_ACCOUNT_TYPE_MISMATCH = "PAYMENT_ACCOUNT_TYPE_MISMATCH"
PAYMENT_ACCOUNT_INACTIVE = "PAYMENT_ACCOUNT_INACTIVE"

# Bangladeshi mobile numbers: 01 + operator prefix (13-19) + 8 digits.
_MFS_NUMBER_PATTERN = re.compile(r"^01[3-9]\d{8}$")
_ROUTING_NUMBER_DIGITS = 9
_ACCOUNT_NUMBER_MIN = 6
_ACCOUNT_NUMBER_MAX = 24


def normalize_number_field(value: str | None) -> str | None:
    """Trim and convert Bangla digits to Latin digits for storage."""
    if value is None:
        return None
    cleaned = ascii_digits(value).strip()
    return cleaned or None


def mask_number(number: str | None) -> str:
    """`••••0421` - all but the last 4 digits hidden (audit-log display)."""
    if not number:
        return ""
    digits = ascii_digits(number)
    return f"••••{digits[-4:]}" if len(digits) >= 4 else digits


def _clean_optional(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned[:limit] if cleaned else None


# Shared field validators, attached to both the create and the update schema.
def _validate_type(value: str) -> str:
    cleaned = value.strip()
    if cleaned not in ACCOUNT_TYPES:
        raise ValueError(PAYMENT_ACCOUNT_TYPE_INVALID)
    return cleaned


def _validate_label_required(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(LABEL_REQUIRED)
    return cleaned


def _validate_label_optional(value: str | None) -> str | None:
    if value is not None and not value.strip():
        raise ValueError(LABEL_REQUIRED)
    return value


def _strip_text(value: str | None) -> str | None:
    return _clean_optional(value, 500)


def _normalize_account_number(value: str | None) -> str | None:
    cleaned = normalize_number_field(value)
    if cleaned is not None and (
        not cleaned.isdigit() or not _ACCOUNT_NUMBER_MIN <= len(cleaned) <= _ACCOUNT_NUMBER_MAX
    ):
        raise ValueError(ACCOUNT_NUMBER_INVALID)
    return cleaned


def _normalize_routing_number(value: str | None) -> str | None:
    cleaned = normalize_number_field(value)
    if cleaned is not None and (not cleaned.isdigit() or len(cleaned) != _ROUTING_NUMBER_DIGITS):
        raise ValueError(ROUTING_NUMBER_INVALID)
    return cleaned


def _normalize_mfs_number(value: str | None) -> str | None:
    cleaned = normalize_number_field(value)
    if cleaned is None:
        return None
    # Accept +880/88 prefixes and separators, store 01XXXXXXXXX.
    digits = ascii_digits(re.sub(r"\D", "", cleaned))
    if digits.startswith("880"):
        digits = f"0{digits[3:]}"
    elif digits.startswith("88"):
        digits = digits[2:]
    if not _MFS_NUMBER_PATTERN.fullmatch(digits):
        raise ValueError(MFS_NUMBER_INVALID)
    return digits


def _validate_provider(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().casefold()
    if cleaned and cleaned not in MFS_PROVIDERS:
        raise ValueError(PAYMENT_ACCOUNT_PROVIDER_INVALID)
    return cleaned or None


def _validate_account_kind(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().casefold()
    if cleaned and cleaned not in ACCOUNT_KINDS:
        raise ValueError(PAYMENT_ACCOUNT_KIND_INVALID)
    return cleaned or None


def _validate_status(value: str) -> str:
    cleaned = value.strip()
    if cleaned not in ACCOUNT_STATUSES:
        raise ValueError(PAYMENT_ACCOUNT_STATUS_INVALID)
    return cleaned


class PaymentAccountIn(BaseModel):
    type: str
    label: str = Field(min_length=1, max_length=120)
    bank_name: str | None = Field(default=None, max_length=120)
    branch_name: str | None = Field(default=None, max_length=120)
    account_name: str | None = Field(default=None, max_length=120)
    account_number: str | None = Field(default=None, max_length=32)
    routing_number: str | None = Field(default=None, max_length=9)
    provider: str | None = Field(default=None, max_length=16)
    mfs_number: str | None = Field(default=None, max_length=16)
    account_kind: str | None = Field(default=None, max_length=16)
    account_holder: str | None = Field(default=None, max_length=120)
    instructions: str | None = Field(default=None, max_length=500)
    display_order: int = 0

    _check_type = field_validator("type")(_validate_type)
    _check_label = field_validator("label")(_validate_label_required)
    _strip = field_validator("bank_name", "branch_name", "account_name", "account_holder", "instructions")(_strip_text)
    _check_account_number = field_validator("account_number")(_normalize_account_number)
    _check_routing_number = field_validator("routing_number")(_normalize_routing_number)
    _check_mfs_number = field_validator("mfs_number")(_normalize_mfs_number)
    _check_provider = field_validator("provider")(_validate_provider)
    _check_account_kind = field_validator("account_kind")(_validate_account_kind)

    @model_validator(mode="after")
    def _require_type_fields(self) -> "PaymentAccountIn":
        if self.type == "bank":
            if not self.bank_name:
                raise ValueError(BANK_NAME_REQUIRED)
            if not self.branch_name:
                raise ValueError(BRANCH_NAME_REQUIRED)
            if not self.account_name:
                raise ValueError(ACCOUNT_NAME_REQUIRED)
            if not self.account_number:
                raise ValueError(ACCOUNT_NUMBER_REQUIRED)
            if not self.routing_number:
                raise ValueError(ROUTING_NUMBER_REQUIRED)
        else:
            if not self.provider:
                raise ValueError(PAYMENT_ACCOUNT_PROVIDER_INVALID)
            if not self.mfs_number:
                raise ValueError(MFS_NUMBER_REQUIRED)
            if not self.account_kind:
                self.account_kind = "personal"
        return self


class PaymentAccountUpdateIn(BaseModel):
    """Partial update; the account's type never changes after creation."""

    label: str | None = Field(default=None, min_length=1, max_length=120)
    bank_name: str | None = Field(default=None, max_length=120)
    branch_name: str | None = Field(default=None, max_length=120)
    account_name: str | None = Field(default=None, max_length=120)
    account_number: str | None = Field(default=None, max_length=32)
    routing_number: str | None = Field(default=None, max_length=9)
    provider: str | None = Field(default=None, max_length=16)
    mfs_number: str | None = Field(default=None, max_length=16)
    account_kind: str | None = Field(default=None, max_length=16)
    account_holder: str | None = Field(default=None, max_length=120)
    instructions: str | None = Field(default=None, max_length=500)
    display_order: int | None = None

    _check_label = field_validator("label")(_validate_label_optional)
    _strip = field_validator("bank_name", "branch_name", "account_name", "account_holder", "instructions")(_strip_text)
    _check_account_number = field_validator("account_number")(_normalize_account_number)
    _check_routing_number = field_validator("routing_number")(_normalize_routing_number)
    _check_mfs_number = field_validator("mfs_number")(_normalize_mfs_number)
    _check_provider = field_validator("provider")(_validate_provider)
    _check_account_kind = field_validator("account_kind")(_validate_account_kind)


class PaymentAccountStatusIn(BaseModel):
    status: str

    _check_status = field_validator("status")(_validate_status)


class PaymentAccountReorderIn(BaseModel):
    ids: list[int] = Field(min_length=1)


class PaymentAccountOut(BaseModel):
    """Admin view - full details plus audit timestamps."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    status: str
    display_order: int
    label: str
    bank_name: str | None = None
    branch_name: str | None = None
    account_name: str | None = None
    account_number: str | None = None
    routing_number: str | None = None
    provider: str | None = None
    mfs_number: str | None = None
    account_kind: str | None = None
    account_holder: str | None = None
    instructions: str | None = None
    qr_image_url: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PaymentAccountPublicOut(BaseModel):
    """What an authenticated payer needs - full numbers (they must copy them
    to pay) but no internal/audit fields."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    method: str = ""
    display_order: int
    label: str
    bank_name: str | None = None
    branch_name: str | None = None
    account_name: str | None = None
    account_number: str | None = None
    routing_number: str | None = None
    provider: str | None = None
    mfs_number: str | None = None
    account_kind: str | None = None
    account_holder: str | None = None
    instructions: str | None = None
    qr_image_url: str | None = None
