"""Payment ledgers (installments, picnic and other-fee payments) are finance
data: the admin read/write endpoints are gated by ``manage_finance``, not by
the member-directory permissions ``member.view_all`` / ``member.manage``."""

import pytest
from httpx import AsyncClient

from app.core.permissions import invalidate_permission_cache
from app.core.security import hash_password
from app.models.admin import AdminRole, AdminUser
from app.models.rbac import Permission, Role

pytestmark = pytest.mark.asyncio

FINANCE_ENDPOINTS = [
    ("GET", "/api/admin/members/424242/installments", None),
    ("POST", "/api/admin/members/424242/installments", {"year": 2026, "month": 1, "amount": 100}),
    ("PATCH", "/api/admin/installments/424242", {"status": "paid"}),
    ("GET", "/api/admin/picnic-payments", None),
    ("GET", "/api/admin/other-fees/payments", None),
]


async def _admin_with_permissions(
    client: AsyncClient, db_session, email: str, keys: tuple[str, ...]
) -> dict[str, str]:
    perms = []
    for key in keys:
        perm = Permission(key=key, resource=key.split(".")[0], action="test", description=None)
        db_session.add(perm)
        perms.append(perm)
    role = Role(name=f"role-{email}", description=None)
    role.permissions = perms
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    db_session.add(
        AdminUser(
            email=email,
            password_hash=hash_password("adminpass123"),
            name=email.split("@")[0],
            role=AdminRole.ADMINISTRATOR,
            role_id=role.id,
        )
    )
    await db_session.commit()
    invalidate_permission_cache()

    response = await client.post(
        "/api/admin/login", json={"email": email, "password": "adminpass123"}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.mark.parametrize("method,path,body", FINANCE_ENDPOINTS)
async def test_member_directory_permissions_cannot_reach_payment_ledgers(
    client: AsyncClient, db_session, method: str, path: str, body: dict | None
) -> None:
    headers = await _admin_with_permissions(
        client, db_session, "clerk@example.com", ("member.view_all", "member.manage")
    )

    response = await client.request(method, path, json=body, headers=headers)

    assert response.status_code == 403, (method, path, response.text)


@pytest.mark.parametrize("method,path,body", FINANCE_ENDPOINTS)
async def test_manage_finance_reaches_payment_ledgers(
    client: AsyncClient, db_session, method: str, path: str, body: dict | None
) -> None:
    headers = await _admin_with_permissions(
        client, db_session, "treasurer@example.com", ("manage_finance",)
    )

    response = await client.request(method, path, json=body, headers=headers)

    # Past the permission gate: listings succeed, unknown ids are 404.
    assert response.status_code in (200, 404), (method, path, response.text)
