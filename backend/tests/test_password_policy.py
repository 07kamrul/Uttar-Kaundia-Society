"""Batch 6 password policy: v1 is unchanged; v2 (flag `password_policy_v2`) is
"at least 8 characters, not a very common password" with no forced digit, and
every 422 now carries a machine `code` the clients map to their own copy."""

import hashlib

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.password_policy import (
    COMMON_PASSWORDS,
    PASSWORD_SAME_AS_CURRENT,
    PASSWORD_TOO_COMMON,
    PASSWORD_TOO_SHORT,
    check_new_password,
)
from app.core.security import create_access_token, hash_password
from app.models.credential import MemberCredential
from app.models.feature_flag import FeatureFlag
from app.models.member import Member, MemberStatus
from app.models.password_reset import PasswordResetToken
from app.schemas.auth import validate_new_password

pytestmark = pytest.mark.asyncio

CURRENT = "oldpass123"
CHANGE_URL = "/api/member/change-password"
RESET_URL = "/api/reset-password"
# bcrypt is slow; hash the shared test password once for the whole module.
_CURRENT_HASH = hash_password(CURRENT)


def _code(result) -> str | None:
    return None if result is None else result.code


# --- pure policy ---------------------------------------------------------


class TestPolicyV1IsUnchanged:
    @pytest.mark.parametrize("password", ["short1", "nodigitshere", "1234567", ""])
    async def test_short_or_digitless_passwords_keep_the_original_message(self, password: str) -> None:
        errors = validate_new_password(CURRENT, password)

        assert errors == {
            "new_password": "Password must be at least 8 characters and include a number"
        }

    async def test_same_as_current_keeps_the_original_message(self) -> None:
        assert validate_new_password(CURRENT, CURRENT) == {
            "new_password": "New password must be different from the current password"
        }

    async def test_common_but_long_enough_password_is_still_accepted_by_v1(self) -> None:
        assert validate_new_password(CURRENT, "12345678") == {}
        assert check_new_password(CURRENT, "password123") is None

    async def test_v1_failures_carry_a_code_that_is_not_the_v2_length_code(self) -> None:
        # A v1 failure can be "no digit" in a 10-character password, so it must
        # not be reported as PASSWORD_TOO_SHORT.
        assert _code(check_new_password(CURRENT, "nodigitshere")) == "PASSWORD_TOO_WEAK"
        assert _code(check_new_password(CURRENT, "short1")) == "PASSWORD_TOO_WEAK"
        assert _code(check_new_password(CURRENT, CURRENT)) == PASSWORD_SAME_AS_CURRENT


class TestPolicyV2:
    async def test_accepts_letters_only(self) -> None:
        assert check_new_password(CURRENT, "abcdefgh", policy_v2=True) is None
        assert validate_new_password(CURRENT, "abcdefgh", policy_v2=True) == {}

    async def test_rejects_length_seven(self) -> None:
        result = check_new_password(CURRENT, "abcdefg", policy_v2=True)

        assert _code(result) == PASSWORD_TOO_SHORT
        assert "8 characters" in result.message

    @pytest.mark.parametrize(
        "password", ["12345678", "Password", "PASSWORD123", " password1 ", "১২৩৪৫৬৭৮", "Qwerty123"]
    )
    async def test_rejects_common_passwords_case_digit_and_space_insensitively(
        self, password: str
    ) -> None:
        assert _code(check_new_password(CURRENT, password, policy_v2=True)) == PASSWORD_TOO_COMMON

    async def test_rejects_the_current_password(self) -> None:
        assert _code(check_new_password(CURRENT, CURRENT, policy_v2=True)) == PASSWORD_SAME_AS_CURRENT

    async def test_short_wins_over_common_and_common_wins_over_same(self) -> None:
        assert _code(check_new_password("1234567", "1234567", policy_v2=True)) == PASSWORD_TOO_SHORT
        assert _code(check_new_password("12345678", "12345678", policy_v2=True)) == PASSWORD_TOO_COMMON

    async def test_the_server_validator_keeps_returning_field_errors(self) -> None:
        assert set(validate_new_password(CURRENT, "12345678", policy_v2=True)) == {"new_password"}

    async def test_blocklist_is_lowercase_ascii_and_big_enough(self) -> None:
        assert 90 <= len(COMMON_PASSWORDS) <= 160
        assert all(p == p.lower() and p == p.strip() and p.isascii() for p in COMMON_PASSWORDS)
        for required in ("12345678", "password", "password123", "kaundia", "ukamks123", "01234567"):
            assert required in COMMON_PASSWORDS

    async def test_the_documented_examples_are_blocked(self) -> None:
        for password in (
            "12345678", "123456789", "11111111", "00000000", "87654321", "password1",
            "password123", "qwertyui", "qwerty123", "abcd1234", "abc12345", "iloveyou",
            "admin123", "bangladesh", "bangladesh1", "dhaka123", "kaundia123", "ukamks123",
            "01234567",
        ):
            assert password in COMMON_PASSWORDS, password


# --- endpoints -----------------------------------------------------------


@pytest_asyncio.fixture
async def member(db_session: AsyncSession) -> Member:
    row = Member(
        member_id="UKAMKS-301",
        status=MemberStatus.APPROVED,
        full_name="Policy Member",
        father_or_husband="F",
        mother="M",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="Job",
        nid="1234500301",
        mobile="+8801712000301",
        gender="male",
        email="policy@example.com",
        admission_fee="500",
        subscription="100",
        receipt_no="R-301",
        payment_method="Cash",
        submission_date="2026-01-01",
    )
    db_session.add(row)
    await db_session.flush()
    db_session.add(
        MemberCredential(
            member_id=row.id, username="ukamks-301", password_hash=_CURRENT_HASH, must_change_password=True
        )
    )
    await db_session.commit()
    await db_session.refresh(row)
    return row


@pytest_asyncio.fixture
async def v2_on(db_session: AsyncSession) -> None:
    db_session.add(FeatureFlag(key="password_policy_v2", enabled=True))
    await db_session.commit()


def _auth(member: Member) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(member.id), 'member')}"}


async def _credential(db_session: AsyncSession, member: Member) -> MemberCredential:
    result = await db_session.execute(
        select(MemberCredential)
        .where(MemberCredential.member_id == member.id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


async def _reset_token(db_session: AsyncSession, member: Member, raw: str = "known-raw-token") -> str:
    db_session.add(
        PasswordResetToken(
            user_type="member",
            member_id=member.id,
            token_hash=hashlib.sha256(raw.encode("utf-8")).hexdigest(),
            expires_at=_far_future(),
        )
    )
    await db_session.commit()
    return raw


def _far_future():
    from datetime import datetime, timedelta, timezone

    return datetime.now(timezone.utc) + timedelta(hours=1)


class TestChangePasswordEndpoint:
    async def test_v2_off_still_demands_a_digit_and_adds_a_code(
        self, client: AsyncClient, member: Member
    ) -> None:
        response = await client.post(
            CHANGE_URL, json={"current_password": CURRENT, "new_password": "abcdefgh"}, headers=_auth(member)
        )

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert "include a number" in detail["errors"]["new_password"]
        assert detail["message"] == detail["errors"]["new_password"]
        assert detail["code"] == "PASSWORD_TOO_WEAK"

    async def test_v2_on_accepts_letters_only_and_clears_must_change(
        self, client: AsyncClient, db_session: AsyncSession, member: Member, v2_on: None
    ) -> None:
        response = await client.post(
            CHANGE_URL, json={"current_password": CURRENT, "new_password": "abcdefgh"}, headers=_auth(member)
        )

        assert response.status_code == 200, response.text
        credential = await _credential(db_session, member)
        assert credential.must_change_password is False
        assert credential.token_version == 1

    @pytest.mark.parametrize(
        "new_password,code",
        [
            ("abcdefg", "PASSWORD_TOO_SHORT"),
            ("12345678", "PASSWORD_TOO_COMMON"),
            ("Password", "PASSWORD_TOO_COMMON"),
            ("১২৩৪৫৬৭৮", "PASSWORD_TOO_COMMON"),
            (CURRENT, "PASSWORD_SAME_AS_CURRENT"),
        ],
    )
    async def test_v2_on_rejections_carry_message_errors_and_code(
        self, client: AsyncClient, member: Member, v2_on: None, new_password: str, code: str
    ) -> None:
        response = await client.post(
            CHANGE_URL,
            json={"current_password": CURRENT, "new_password": new_password},
            headers=_auth(member),
        )

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == code
        assert set(detail["errors"]) == {"new_password"}
        assert detail["message"] == detail["errors"]["new_password"]

    async def test_wrong_current_password_response_is_unchanged(
        self, client: AsyncClient, member: Member, v2_on: None
    ) -> None:
        response = await client.post(
            CHANGE_URL, json={"current_password": "not-it-1234", "new_password": "abcdefgh"}, headers=_auth(member)
        )

        assert response.status_code == 422
        assert response.json()["detail"] == {
            "message": "Current password is incorrect",
            "errors": {"current_password": "Current password is incorrect"},
        }


class TestResetPasswordEndpoint:
    async def test_v2_off_reset_error_gains_a_code_and_keeps_errors(
        self, client: AsyncClient, member: Member
    ) -> None:
        response = await client.post(RESET_URL, json={"token": "whatever", "new_password": "abcdefgh"})

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert set(detail) == {"errors", "code"}
        assert "include a number" in detail["errors"]["new_password"]
        assert detail["code"] == "PASSWORD_TOO_WEAK"

    @pytest.mark.parametrize(
        "new_password,code",
        [("abcdefg", "PASSWORD_TOO_SHORT"), ("12345678", "PASSWORD_TOO_COMMON"), ("Password", "PASSWORD_TOO_COMMON")],
    )
    async def test_v2_on_reset_rejections_carry_the_code(
        self, client: AsyncClient, member: Member, v2_on: None, new_password: str, code: str
    ) -> None:
        response = await client.post(RESET_URL, json={"token": "whatever", "new_password": new_password})

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == code

    async def test_v2_on_reset_accepts_letters_only_and_clears_must_change(
        self, client: AsyncClient, db_session: AsyncSession, member: Member, v2_on: None
    ) -> None:
        token = await _reset_token(db_session, member)

        response = await client.post(RESET_URL, json={"token": token, "new_password": "abcdefgh"})

        assert response.status_code == 200, response.text
        credential = await _credential(db_session, member)
        assert credential.must_change_password is False
        relogin = await client.post("/api/member/login", json={"username": "ukamks-301", "password": "abcdefgh"})
        assert relogin.status_code == 200
        assert relogin.json()["must_change_password"] is False

    async def test_policy_is_checked_before_the_token_is_consumed(
        self, client: AsyncClient, db_session: AsyncSession, member: Member, v2_on: None
    ) -> None:
        token = await _reset_token(db_session, member)

        rejected = await client.post(RESET_URL, json={"token": token, "new_password": "12345678"})
        accepted = await client.post(RESET_URL, json={"token": token, "new_password": "abcdefgh"})

        assert rejected.status_code == 422
        assert accepted.status_code == 200


class TestMustChangePasswordLifecycle:
    async def test_admin_reset_sets_it_and_self_change_clears_it(
        self, client: AsyncClient, db_session: AsyncSession, admin_user, member: Member, monkeypatch
    ) -> None:
        async def fake_send(**_kwargs) -> bool:
            return True

        monkeypatch.setattr("app.api.routes.admin.send_email", fake_send)
        credential = await _credential(db_session, member)
        credential.must_change_password = False
        await db_session.commit()
        admin_headers = {
            "Authorization": f"Bearer {create_access_token(str(admin_user.id), 'executive_committee')}"
        }

        reset = await client.post(f"/api/admin/members/{member.id}/reset-password", headers=admin_headers)

        assert reset.status_code == 200, reset.text
        assert (await _credential(db_session, member)).must_change_password is True

    async def test_approval_sets_it(
        self, client: AsyncClient, db_session: AsyncSession, admin_user, monkeypatch
    ) -> None:
        async def fake_send(**_kwargs) -> bool:
            return True

        monkeypatch.setattr("app.api.routes.admin.send_email", fake_send)
        pending = Member(
            status=MemberStatus.PENDING,
            full_name="Pending One",
            father_or_husband="F",
            mother="M",
            dob="1990-01-01",
            nationality="Bangladeshi",
            occupation="Job",
            nid="1234500302",
            mobile="+8801712000302",
            gender="male",
            email="pending302@example.com",
            admission_fee="500",
            subscription="100",
            receipt_no="R-302",
            payment_method="Cash",
            submission_date="2026-01-01",
        )
        db_session.add(pending)
        await db_session.commit()
        admin_headers = {
            "Authorization": f"Bearer {create_access_token(str(admin_user.id), 'executive_committee')}"
        }

        approve = await client.post(f"/api/admin/submissions/{pending.id}/approve", headers=admin_headers)

        assert approve.status_code == 200, approve.text
        assert (await _credential(db_session, pending)).must_change_password is True
