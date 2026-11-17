import asyncio
import json
from collections.abc import AsyncGenerator
from datetime import date

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.cache import clear_all
from app.core.permissions import invalidate_permission_cache
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.core.security import hash_password
from app.models.admin import AdminRole, AdminUser
from app.models.fee_settings import FeeSetting
from app.models.feature_flag import FeatureFlag

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(autouse=True)
def _clear_permission_cache():
    """The process-wide effective-permission cache is keyed by user id + role,
    which repeats across the fresh in-memory databases each test builds."""
    invalidate_permission_cache()
    yield
    invalidate_permission_cache()


@pytest.fixture(autouse=True)
def _clear_read_caches():
    """Read caches are process-wide; every test builds a fresh database."""
    clear_all(reason="test isolation")
    yield
    clear_all(reason="test isolation")


@pytest.fixture(autouse=True)
def _stub_admin_notification_email(monkeypatch):
    """Submissions alert admins by email in a background task; keep every
    test off real SMTP. Tests asserting on the alert re-patch this."""
    from app.services import admin_notifications

    async def _no_send(**_kwargs) -> bool:
        return True

    monkeypatch.setattr(admin_notifications, "send_email", _no_send)


@pytest.fixture(autouse=True)
def _reset_auth_rate_limits():
    """Auth limiters are process-wide; tests reuse the same identifiers."""
    from app.api.routes.auth import login_failure_limiter, reset_request_limiter

    login_failure_limiter.reset()
    reset_request_limiter.reset()
    yield


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(
        TEST_DATABASE_URL, poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(bind=engine, expire_on_commit=False)

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    try:
        async with session_maker() as session:
            yield session
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _seed_admission_fee(db_session: AsyncSession):
    """Submissions re-resolve the admission fee and monthly subscription
    server-side from the active fee settings, so every test needs them
    configured."""
    db_session.add_all(
        [
            FeeSetting(key="admission_fee", value=500, start_date=date(2000, 1, 1)),
            FeeSetting(
                key="monthly_subscription_base_amount", value=100, start_date=date(2000, 1, 1)
            ),
            # 20.00 per extra decimal per the constitution
            # (গঠনতন্ত্র: প্রতি অতিরিক্ত ডেসিমেলে ২০ টাকা). Kept as a versioned
            # FeeSetting row; the calculators never hardcode it.
            FeeSetting(
                key="monthly_subscription_additional_rate", value=20.00, start_date=date(2000, 1, 1)
            ),
            FeeSetting(
                key="monthly_subscription_base_threshold", value=1, start_date=date(2000, 1, 1)
            ),
        ]
    )
    await db_session.commit()


NO_PHOTO_HEADER = "x-test-no-photo"
_TEST_PHOTO = ("member_photo", ("photo.jpg", b"\xff\xd8\xff\xe0fakejpeg", "image/jpeg"))


async def set_flag(db_session: AsyncSession, key: str, enabled: bool) -> None:
    """Pin a feature flag via an admin-style override row. Most flags now
    default on, so tests of the old ("flag off") behaviour pin them off."""
    db_session.add(FeatureFlag(key=key, enabled=enabled))
    await db_session.commit()


NO_PROOF_HEADER = "x-test-no-proof"
_TEST_PROOF_DOC_TYPE = "খতিয়ান/পর্চা"


def _files_list(files) -> list:
    return list(files.items() if isinstance(files, dict) else files or [])


def _with_default_proofs(data: dict, files: list) -> tuple[dict, list]:
    """reg_min_one_proof (on by default) needs one proof file per property.
    When the test sent no document files, give every property without a
    document slot a default slot plus a tiny PDF. Returns new objects."""
    if any(name in ("doc_files", "docFiles") for name, _ in files):
        return data, files
    raw = data.get("payload")
    if not isinstance(raw, str):
        return data, files
    try:
        payload = json.loads(raw)
    except ValueError:
        return data, files
    properties = payload.get("properties")
    if not isinstance(properties, list):
        return data, files
    extra_files: list = []
    new_properties = []
    for prop in properties:
        if isinstance(prop, dict) and not prop.get("applicable_docs"):
            prop = {**prop, "applicable_docs": [{"doc_type": _TEST_PROOF_DOC_TYPE}]}
            extra_files.append(("doc_files", ("proof.pdf", b"%PDF-1.4 proof", "application/pdf")))
        new_properties.append(prop)
    if not extra_files:
        return data, files
    new_data = {**data, "payload": json.dumps({**payload, "properties": new_properties})}
    return new_data, [*files, *extra_files]


class _PhotoDefaultClient(AsyncClient):
    """The member photo and (with reg_min_one_proof) one proof per property are
    mandatory on /api/submissions. Most tests are about neither, so POSTs there
    get tiny defaults unless the test sends its own files or the
    `x-test-no-photo` / `x-test-no-proof` header."""

    async def post(self, url, *args, **kwargs):  # type: ignore[override]
        if str(url).endswith("/api/submissions"):
            headers = dict(kwargs.get("headers") or {})
            files = _files_list(kwargs.get("files"))
            if headers.pop(NO_PHOTO_HEADER, None) is None:
                if not any(name in ("member_photo", "memberPhoto") for name, _ in files):
                    files = [_TEST_PHOTO, *files]
            if headers.pop(NO_PROOF_HEADER, None) is None and isinstance(kwargs.get("data"), dict):
                kwargs["data"], files = _with_default_proofs(kwargs["data"], files)
            kwargs["files"] = files
            kwargs["headers"] = headers
        return await super().post(url, *args, **kwargs)


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with _PhotoDefaultClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> AdminUser:
    admin = AdminUser(
        email="admin@example.com",
        password_hash=hash_password("adminpass123"),
        name="Admin",
        role=AdminRole.EXECUTIVE_COMMITTEE,
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)
    return admin
