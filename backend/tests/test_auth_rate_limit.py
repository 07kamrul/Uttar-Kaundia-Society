"""Login brute-force and forgot-password flood protection."""

import pytest
from httpx import AsyncClient

from app.api.routes.auth import LOGIN_MAX_FAILURES, RESET_REQUESTS_PER_HOUR
from app.models.admin import AdminUser

pytestmark = pytest.mark.asyncio


async def _admin_login(client: AsyncClient, password: str):
    return await client.post(
        "/api/admin/login", json={"email": "admin@example.com", "password": password}
    )


async def test_admin_login_locks_after_repeated_failures(
    client: AsyncClient, admin_user: AdminUser
) -> None:
    for _ in range(LOGIN_MAX_FAILURES):
        assert (await _admin_login(client, "wrong")).status_code == 401

    blocked = await _admin_login(client, "adminpass123")

    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0


async def test_successful_logins_do_not_count_toward_the_limit(
    client: AsyncClient, admin_user: AdminUser
) -> None:
    for _ in range(LOGIN_MAX_FAILURES + 2):
        assert (await _admin_login(client, "adminpass123")).status_code == 200


async def test_unified_login_shares_the_failure_counter(
    client: AsyncClient, admin_user: AdminUser
) -> None:
    for _ in range(LOGIN_MAX_FAILURES):
        await client.post("/api/login", json={"identifier": "Admin@Example.com", "password": "x"})

    response = await client.post(
        "/api/login", json={"identifier": "admin@example.com", "password": "adminpass123"}
    )

    assert response.status_code == 429


async def test_forgot_password_stops_sending_after_limit(
    client: AsyncClient, admin_user: AdminUser, monkeypatch
) -> None:
    sent: list[str] = []

    async def fake_send(*args, **kwargs):
        sent.append("mail")

    monkeypatch.setattr("app.api.routes.auth.send_email", fake_send)
    for _ in range(RESET_REQUESTS_PER_HOUR + 3):
        response = await client.post(
            "/api/forgot-password", json={"identifier": "admin@example.com"}
        )
        assert response.status_code == 200

    assert len(sent) == RESET_REQUESTS_PER_HOUR
