"""Who may read which file under /uploads.

Upload paths are laid out by owner (see every ``save_upload_file`` caller):

- ``photos/member_<id>/``                - member photos, visible to any logged-in user
- ``finance_receipts/``, ``cost_receipts/`` - fund transparency, any logged-in user
- ``documents/member_<id>/``, ``receipts/member_<id>/``,
  ``installment_payments/member_<id>/``  - owner only
- ``complaints/<id>/``                   - owner only
- ``membership/<application_no>/``       - admins only (members use the
  authenticated application download endpoint)

Admins may read everything. Anything not matched is denied.
"""

from pathlib import PurePosixPath
from typing import Any

from app.core.security import ADMIN_ROLES, normalize_token_role

_SHARED_TOP_DIRS = frozenset({"photos", "finance_receipts", "cost_receipts"})
_OWNER_DIRS_MEMBER_PREFIX = frozenset({"documents", "receipts", "installment_payments"})
_OWNER_DIRS_BARE_ID = frozenset({"complaints"})


def _member_id(payload: dict[str, Any]) -> int | None:
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        return None


def can_access_upload(path: str, payload: dict[str, Any]) -> bool:
    parts = PurePosixPath(path).parts
    if len(parts) < 2 or any(part in ("..", ".") for part in parts):
        return False

    role = normalize_token_role(payload.get("role"))
    if role in ADMIN_ROLES:
        return True
    if role != "member":
        return False

    top, owner_dir = parts[0], parts[1]
    if top in _SHARED_TOP_DIRS:
        return True

    member_id = _member_id(payload)
    if member_id is None:
        return False
    if top in _OWNER_DIRS_MEMBER_PREFIX:
        return owner_dir == f"member_{member_id}"
    if top in _OWNER_DIRS_BARE_ID:
        return owner_dir == str(member_id)
    return False
