"""Batch 6: `/api/login` accepts mobile number and member email (flag
`login_by_phone`) besides admin email and member ID."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.auth import LOGIN_MAX_FAILURES
from app.core.security import hash_password
from app.models.admin import AdminUser
from app.models.credential import MemberCredential
from app.models.feature_flag import FeatureFlag
from app.models.member import Member, MemberStatus
from app.services.login_identity import classify, login_key

pytestmark = pytest.mark.asyncio

PASSWORD = "memberpass1"
# bcrypt is slow; hash once for the module.
_HASH = hash_password(PASSWORD)
_SEQ = {"n": 0}


async def _member(
    db: AsyncSession,
    *,
    mobile: str,
    email: str | None = None,
    status: MemberStatus = MemberStatus.APPROVED,
    with_login: bool = True,
) -> Member:
    _SEQ["n"] += 1
    n = _SEQ["n"]
    member = Member(
        member_id=f"UKAMKS-{n}",
        status=status,
        full_name=f"Login Member {n}",
        father_or_husband="F",
        mother="M",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="Job",
        nid=f"90000000{n:02d}",
        mobile=mobile,
        gender="male",
        email=email or f"login{n}@example.com",
        admission_fee="500",
        subscription="100",
        receipt_no=f"R-{n}",
        payment_method="Cash",
        submission_date="2026-01-01",
    )
    db.add(member)
    await db.flush()
    if with_login:
        db.add(MemberCredential(member_id=member.id, username=f"ukamks-{n}", password_hash=_HASH))
    await db.commit()
    await db.refresh(member)
    return member


async def _flag_on(db: AsyncSession) -> None:
    db.add(FeatureFlag(key="login_by_phone", enabled=True))
    await db.commit()


async def _login(client: AsyncClient, identifier: str, password: str = PASSWORD):
    return await client.post("/api/login", json={"identifier": identifier, "password": password})


# --- classification --------------------------------------------------------


@pytest.mark.parametrize(
    "raw,kind",
    [
        ("user@example.com", "email"),
        ("  USER@Example.com ", "email"),
        ("01712345678", "phone"),
        ("+8801712345678", "phone"),
        ("8801712345678", "phone"),
        ("০১৭১২৩৪৫৬৭৮", "phone"),
        ("01712-345 678", "phone"),
        ("(01712) 345678", "phone"),
        ("+44 7911 123456", "phone"),
        ("ukamks-12", "username"),
        ("UKAMKS-12", "username"),
        ("kam-0001", "username"),
        ("017123", "username"),  # fewer than 10 digits
        ("447911123456", "username"),  # foreign number without '+' is not a phone
        ("", "username"),
        ("+++++++++++", "username"),
    ],
)
async def test_classify(raw: str, kind: str) -> None:
    assert classify(raw) == kind


async def test_login_key_is_canonical_per_number_and_lowercase_otherwise() -> None:
    assert (
        login_key("01712345678")
        == login_key("+880 1712-345678")
        == login_key("০১৭১২৩৪৫৬৭৮")
        == "+8801712345678"
    )
    assert login_key(" UKAMKS-12 ") == "ukamks-12"
    assert login_key("User@Example.COM") == "user@example.com"


# --- flag on: phone --------------------------------------------------------


@pytest.mark.parametrize(
    "typed",
    ["01712345678", "+8801712345678", "8801712345678", "০১৭১২৩৪৫৬৭৮", "01712-345 678", " +880 1712 345678 "],
)
async def test_every_bd_format_logs_in_a_member_stored_as_e164(
    client: AsyncClient, db_session: AsyncSession, typed: str
) -> None:
    await _flag_on(db_session)
    await _member(db_session, mobile="+8801712345678")

    response = await _login(client, typed)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["role"] == "member"
    assert body["access_token"] and body["refresh_token"]


async def test_legacy_digits_only_row_is_found_via_variants(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _flag_on(db_session)
    await _member(db_session, mobile="01712345678")

    assert (await _login(client, "+8801712345678")).status_code == 200
    assert (await _login(client, "01712345678")).status_code == 200


async def test_foreign_number_needs_a_plus(client: AsyncClient, db_session: AsyncSession) -> None:
    await _flag_on(db_session)
    await _member(db_session, mobile="+447911123456")

    assert (await _login(client, "+44 7911 123456")).status_code == 200
    without_plus = await _login(client, "447911123456")
    assert without_plus.status_code == 401


async def test_flag_off_phone_is_not_accepted(client: AsyncClient, db_session: AsyncSession) -> None:
    await _member(db_session, mobile="+8801712345678")

    response = await _login(client, "01712345678")

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials"}


async def test_flag_off_member_email_is_not_accepted(client: AsyncClient, db_session: AsyncSession) -> None:
    await _member(db_session, mobile="+8801712345678", email="off@example.com")

    assert (await _login(client, "off@example.com")).status_code == 401


async def test_rejected_members_mobile_is_ignored(client: AsyncClient, db_session: AsyncSession) -> None:
    await _flag_on(db_session)
    await _member(db_session, mobile="+8801712345678", status=MemberStatus.REJECTED)

    assert (await _login(client, "01712345678")).status_code == 401


async def test_wrong_password_and_unknown_number_share_the_unchanged_401(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _flag_on(db_session)
    await _member(db_session, mobile="+8801712345678")

    wrong = await _login(client, "01712345678", "wrong-password")
    unknown = await _login(client, "01999999999")

    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "Invalid credentials"}


async def test_must_change_password_is_returned(client: AsyncClient, db_session: AsyncSession) -> None:
    await _flag_on(db_session)
    await _member(db_session, mobile="+8801712345678")

    body = (await _login(client, "01712345678")).json()

    assert body["must_change_password"] is True  # the model default for a fresh credential
    assert body["permissions"]


# --- flag on: email and the other identifiers ------------------------------


async def test_member_email_logs_in_case_insensitively(client: AsyncClient, db_session: AsyncSession) -> None:
    await _flag_on(db_session)
    await _member(db_session, mobile="+8801712345678", email="Rahim@Example.com")

    assert (await _login(client, "rahim@example.com")).status_code == 200
    assert (await _login(client, " RAHIM@EXAMPLE.COM ")).status_code == 200


async def test_member_id_still_works_with_the_flag_on(client: AsyncClient, db_session: AsyncSession) -> None:
    await _flag_on(db_session)
    member = await _member(db_session, mobile="+8801712345678")

    assert (await _login(client, member.member_id)).status_code == 200
    assert (await _login(client, member.member_id.upper())).status_code == 200


async def test_admin_email_is_unchanged_with_the_flag_on(
    client: AsyncClient, db_session: AsyncSession, admin_user: AdminUser
) -> None:
    await _flag_on(db_session)

    response = await _login(client, "admin@example.com", "adminpass123")

    assert response.status_code == 200
    assert response.json()["role"] == "executive_committee"


async def test_member_email_of_a_rejected_member_is_ignored(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _flag_on(db_session)
    await _member(db_session, mobile="+8801712345678", email="gone@example.com", status=MemberStatus.REJECTED)

    assert (await _login(client, "gone@example.com")).status_code == 401


# --- ambiguity -------------------------------------------------------------


async def test_shared_mobile_with_correct_password_is_a_409_not_a_login(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _flag_on(db_session)
    await _member(db_session, mobile="+8801712345678")
    await _member(db_session, mobile="01712345678")  # same number, legacy format

    response = await _login(client, "01712345678")

    assert response.status_code == 409
    assert response.json()["detail"] == {"code": "LOGIN_AMBIGUOUS_IDENTIFIER", "kind": "mobile"}


async def test_shared_mobile_with_wrong_password_reveals_nothing(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _flag_on(db_session)
    await _member(db_session, mobile="+8801712345678")
    await _member(db_session, mobile="01712345678")

    response = await _login(client, "01712345678", "wrong-password")

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials"}


async def test_shared_email_is_a_409_with_kind_email(client: AsyncClient, db_session: AsyncSession) -> None:
    await _flag_on(db_session)
    await _member(db_session, mobile="+8801712345671", email="family@example.com")
    await _member(db_session, mobile="+8801712345672", email="Family@example.com")

    response = await _login(client, "family@example.com")

    assert response.status_code == 409
    assert response.json()["detail"] == {"code": "LOGIN_AMBIGUOUS_IDENTIFIER", "kind": "email"}


async def test_ambiguous_409_is_not_counted_as_a_failure(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _flag_on(db_session)
    await _member(db_session, mobile="+8801712345678")
    await _member(db_session, mobile="01712345678")

    for _ in range(LOGIN_MAX_FAILURES + 2):
        assert (await _login(client, "01712345678")).status_code == 409


async def test_a_shared_number_does_not_block_the_member_id(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _flag_on(db_session)
    first = await _member(db_session, mobile="+8801712345678")
    await _member(db_session, mobile="01712345678")

    assert (await _login(client, first.member_id)).status_code == 200


async def test_shared_number_with_one_login_less_member_is_not_ambiguous(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _flag_on(db_session)
    await _member(db_session, mobile="+8801712345678")
    await _member(db_session, mobile="01712345678", with_login=False)

    assert (await _login(client, "01712345678")).status_code == 200


# --- rate limiting ---------------------------------------------------------


async def test_failures_in_different_formats_share_one_bucket(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _flag_on(db_session)
    await _member(db_session, mobile="+8801712345678")
    formats = ["01712345678", "+8801712345678", "8801712345678", "০১৭১২৩৪৫৬৭৮", "01712-345678"]

    for attempt in range(LOGIN_MAX_FAILURES):
        response = await _login(client, formats[attempt % len(formats)], "wrong-password")
        assert response.status_code == 401

    blocked = await _login(client, "+88 01712 345678")  # correct password, yet throttled
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0


async def test_flag_off_rate_limit_key_is_the_raw_lowercased_identifier(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _member(db_session, mobile="+8801712345678")

    for _ in range(LOGIN_MAX_FAILURES):
        await _login(client, "01712345678", "wrong-password")

    assert (await _login(client, "01712345678", "wrong-password")).status_code == 429
    # a different spelling has its own bucket while the flag is off (as today)
    assert (await _login(client, "+8801712345678", "wrong-password")).status_code == 401
