import asyncio
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings

settings = get_settings()

TokenRole = Literal["super_admin", "executive_committee", "administrator", "member"]

ADMIN_ROLES: tuple[TokenRole, ...] = ("super_admin", "executive_committee", "administrator")

# Every role value a token may carry; the comparison set for the normalizer.
CANONICAL_ROLES: tuple[str, ...] = ("super_admin", "executive_committee", "administrator", "member")


def normalize_token_role(role: object) -> str:
    """Canonical form of a token role claim, so "super_admin", "SuperAdmin",
    "SUPER_ADMIN" and "super-admin" all compare equal to "super_admin".
    Separators fold to underscore first; anything else is matched compact
    (separators stripped) against the known role names."""
    folded = str(role or "").strip().lower().replace("-", "_").replace(" ", "_")
    if folded in CANONICAL_ROLES:
        return folded
    compact = folded.replace("_", "")
    for canonical in CANONICAL_ROLES:
        if compact == canonical.replace("_", ""):
            return canonical
    return folded

# bcrypt has a hard 72-byte input limit; truncate defensively so arbitrarily
# long passwords don't raise instead of just losing entropy past 72 bytes.
_BCRYPT_MAX_BYTES = 72


def hash_password(password: str) -> str:
    truncated = password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    return bcrypt.hashpw(truncated, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    truncated = plain_password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    try:
        return bcrypt.checkpw(truncated, password_hash.encode("utf-8"))
    except ValueError:
        return False


# bcrypt costs ~200ms per call; running it inside an async handler would freeze
# the whole event loop (stalling every other in-flight request). Route handlers
# must use these coroutine variants instead of the sync functions above.


async def hash_password_async(password: str) -> str:
    return await asyncio.to_thread(hash_password, password)


async def verify_password_async(plain_password: str, password_hash: str) -> bool:
    return await asyncio.to_thread(verify_password, plain_password, password_hash)


def generate_temp_password(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _create_token(
    subject: str,
    role: TokenRole,
    expires_delta: timedelta,
    token_type: str,
    version: int | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    if version is not None:
        # Matched against the account's token_version on every request;
        # bumping the column (password reset/change) revokes older tokens.
        payload["ver"] = version
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str, role: TokenRole, version: int = 0) -> str:
    return _create_token(
        subject, role, timedelta(minutes=settings.access_token_expire_minutes), "access", version
    )


def create_refresh_token(subject: str, role: TokenRole, version: int = 0) -> str:
    return _create_token(
        subject, role, timedelta(days=settings.refresh_token_expire_days), "refresh", version
    )


def token_version_matches(payload: dict[str, Any], current_version: int) -> bool:
    """Tokens minted before versioning carry no `ver`; treat them as 0 so they
    stay valid until expiry unless the account has since been revoked."""
    claimed = payload.get("ver", 0)
    return isinstance(claimed, int) and not isinstance(claimed, bool) and claimed == current_version


def decode_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


# Media tokens ride in /uploads URLs (?t=...), where <img>/<a> cannot send an
# Authorization header. They are short-lived and typed "media", so a URL that
# leaks into logs or history can neither call the API nor outlive the window.
MEDIA_TOKEN_EXPIRE_MINUTES = 30


def create_media_token(subject: str, role: TokenRole) -> str:
    return _create_token(subject, role, timedelta(minutes=MEDIA_TOKEN_EXPIRE_MINUTES), "media")


def decode_media_token(token: str) -> dict[str, Any] | None:
    payload = decode_token(token)
    if payload is None or payload.get("type") != "media":
        return None
    return payload
