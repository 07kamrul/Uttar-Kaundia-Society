"""/uploads authorization: media tokens + per-folder access rules."""

import pytest
from httpx import AsyncClient

from app.core.config import get_settings
from app.core.security import create_access_token, create_media_token, decode_media_token
from app.services.upload_access import can_access_upload

pytestmark = pytest.mark.asyncio

ADMIN = {"role": "administrator", "sub": "1"}
MEMBER_7 = {"role": "member", "sub": "7"}


@pytest.mark.parametrize(
    "path",
    [
        "photos/member_3/a.jpg",
        "finance_receipts/txn_1/a.pdf",
        "cost_receipts/cost_1/a.pdf",
        "documents/member_7/khajna/a.pdf",
        "receipts/member_7/a.jpg",
        "installment_payments/member_7/a.png",
        "complaints/7/a.pdf",
    ],
)
async def test_member_can_access_shared_and_own_files(path: str) -> None:
    assert can_access_upload(path, MEMBER_7)


@pytest.mark.parametrize(
    "path",
    [
        "documents/member_8/khajna/a.pdf",
        "documents/member_77/a.pdf",
        "receipts/member_8/a.jpg",
        "installment_payments/member_8/a.png",
        "complaints/8/a.pdf",
        "membership/APP-1/a.pdf",
        "unknown/a.pdf",
        "../etc/passwd",
        "",
    ],
)
async def test_member_cannot_access_other_members_or_admin_only_files(path: str) -> None:
    assert not can_access_upload(path, MEMBER_7)


async def test_admin_can_access_everything() -> None:
    assert can_access_upload("membership/APP-1/a.pdf", ADMIN)
    assert can_access_upload("documents/member_8/a.pdf", ADMIN)


async def test_unknown_role_is_denied() -> None:
    assert not can_access_upload("photos/member_3/a.jpg", {"role": "guest", "sub": "1"})


async def test_media_token_round_trip_and_access_token_is_not_a_media_token() -> None:
    media = create_media_token("7", "member")
    assert decode_media_token(media)["sub"] == "7"
    assert decode_media_token(create_access_token("7", "member")) is None
    assert decode_media_token("garbage") is None


async def _write_upload(rel: str) -> None:
    target = get_settings().upload_root / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(b"x")


async def test_uploads_mount_requires_media_token(client: AsyncClient) -> None:
    await _write_upload("photos/member_3/t.jpg")

    anonymous = await client.get("/uploads/photos/member_3/t.jpg")
    with_access_token = await client.get(
        "/uploads/photos/member_3/t.jpg", params={"t": create_access_token("7", "member")}
    )
    with_media_token = await client.get(
        "/uploads/photos/member_3/t.jpg", params={"t": create_media_token("7", "member")}
    )

    assert anonymous.status_code == 401
    assert with_access_token.status_code == 401
    assert with_media_token.status_code == 200


async def test_uploads_mount_forbids_other_members_documents(client: AsyncClient) -> None:
    await _write_upload("documents/member_8/x/t.pdf")

    response = await client.get(
        "/uploads/documents/member_8/x/t.pdf", params={"t": create_media_token("7", "member")}
    )

    assert response.status_code == 403


async def test_media_token_endpoint_requires_login_and_issues_token(
    client: AsyncClient, admin_user
) -> None:
    anonymous = await client.get("/api/media-token")
    login = await client.post(
        "/api/admin/login", json={"email": "admin@example.com", "password": "adminpass123"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    issued = await client.get("/api/media-token", headers=headers)

    assert anonymous.status_code == 401
    assert issued.status_code == 200
    assert decode_media_token(issued.json()["media_token"]) is not None
