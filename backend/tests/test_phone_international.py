"""Batch 0b - international phone handling: acceptance rule (possible, not just
valid), Bangla digits / "00" prefix, status helper, tail-digit helper, schema
validation of co-owner and membership-application phones, and E.164-aware
duplicate detection."""

import json

import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import AdminUser
from app.models.member import Member, MemberStatus
from app.schemas.common import CoOwner, validate_phone
from app.services.normalization import (
    mobile_lookup_variants,
    normalize_mobile,
    phone_status,
    phone_tail_digits,
)
from tests.test_submission_flow import _submission_payload

BD_E164 = "+8801712345678"


class TestNormalizeMobileFormats:
    @pytest.mark.parametrize(
        "raw",
        [
            "01712345678",
            "+8801712345678",
            "8801712345678",
            "০১৭১২৩৪৫৬৭৮",
            "+৮৮০ ১৭১২-৩৪৫৬৭৮",
            "017 1234 5678",
            "017-1234-5678",
            "+880 1712-345678",
            "00880 1712 345678",
            "  01712345678  ",
        ],
    )
    def test_every_bangladesh_format_normalises_to_the_same_e164(self, raw: str) -> None:
        assert normalize_mobile(raw) == BD_E164

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("+966 50 123 4567", "+966501234567"),
            ("00966 50 123 4567", "+966501234567"),
            ("0044 7911 123456", "+447911123456"),
            ("0044-7911-123456", "+447911123456"),
            ("+44 7911 123456", "+447911123456"),
            ("+1 415 555 2671", "+14155552671"),
        ],
    )
    def test_foreign_numbers_normalise_to_e164(self, raw: str, expected: str) -> None:
        assert normalize_mobile(raw) == expected

    @pytest.mark.parametrize(
        "raw",
        ["", "   ", "12345", "+1 555", "not a phone", "+8801234", "017123456789", "+999 123", "abc"],
    )
    def test_rejects_numbers_that_are_not_even_possible(self, raw: str) -> None:
        with pytest.raises(ValueError, match="PHONE_INVALID"):
            normalize_mobile(raw)

    def test_rejects_non_string_input(self) -> None:
        with pytest.raises(ValueError, match="PHONE_INVALID"):
            normalize_mobile(None)  # type: ignore[arg-type]

    @pytest.mark.parametrize(
        "raw,expected",
        [("0171234567", "+880171234567"), ("+44 7911 12345", "+44791112345")],
    )
    def test_accepts_possible_but_not_valid_numbers(self, raw: str, expected: str) -> None:
        assert phone_status(raw) == "possible"
        assert normalize_mobile(raw) == expected


class TestPhoneStatus:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("01712345678", "valid"),
            ("০১৭১২৩৪৫৬৭৮", "valid"),
            ("+966 50 123 4567", "valid"),
            ("0044 7911 123456", "valid"),
            ("0171234567", "possible"),
            ("+15555555555", "possible"),
            ("12345", "invalid"),
            ("", "invalid"),
            ("hello", "invalid"),
            ("+8801234", "invalid"),
        ],
    )
    def test_classifies(self, raw: str, expected: str) -> None:
        assert phone_status(raw) == expected

    def test_none_is_invalid(self) -> None:
        assert phone_status(None) == "invalid"  # type: ignore[arg-type]


class TestPhoneTailDigits:
    def test_returns_last_n_ascii_digits(self) -> None:
        assert phone_tail_digits("+880 1712-345678", 7) == "2345678"

    def test_converts_bangla_digits(self) -> None:
        assert phone_tail_digits("০১৭১২৩৪৫৬৭৮", 9) == "712345678"

    def test_returns_all_digits_when_shorter_than_n(self) -> None:
        assert phone_tail_digits("12-34", 7) == "1234"

    def test_no_digits_gives_empty_string(self) -> None:
        assert phone_tail_digits("abc", 7) == ""
        assert phone_tail_digits("", 7) == ""

    def test_non_positive_n_gives_empty_string(self) -> None:
        assert phone_tail_digits("01712345678", 0) == ""


class TestLookupVariants:
    def test_possible_bangladesh_number_also_gets_legacy_form(self) -> None:
        assert "0171234567" in mobile_lookup_variants("+880171234567")


class TestSchemaValidatesEveryPhone:
    def test_validate_phone_keeps_optional_blank(self) -> None:
        assert validate_phone(None) is None
        assert validate_phone("") == ""
        assert validate_phone("   ") == "   "

    def test_co_owner_phone_is_normalised(self) -> None:
        owner = CoOwner(owner_name="X", owner_phone="০১৭১২৩৪৫৬৭৮")
        assert owner.owner_phone == BD_E164

    def test_co_owner_phone_invalid_is_rejected_with_key(self) -> None:
        with pytest.raises(ValidationError) as excinfo:
            CoOwner(owner_name="X", owner_phone="12345")
        assert "PHONE_INVALID" in str(excinfo.value)

    def test_submission_with_invalid_co_owner_phone_is_422(self) -> None:
        from app.schemas.submission import SubmissionPayload

        payload = _submission_payload()
        payload["properties"][0]["co_owners"] = [{"owner_name": "Co", "owner_phone": "abc"}]
        with pytest.raises(ValidationError):
            SubmissionPayload.model_validate(payload)

    def test_membership_application_mobile_is_normalised_and_validated(self) -> None:
        from app.api.routes.membership_appeal import ApplicationCreate

        base = {
            "full_name": "A",
            "father_name": "B",
            "mother_name": "C",
            "mobile": "8801712345678",
            "email": "a@example.com",
            "ownership_type": "owner",
            "consent": True,
        }
        try:
            data = ApplicationCreate.model_validate(base)
        except ValidationError as exc:  # ownership_type literal may differ
            pytest.fail(str(exc))
        assert data.mobile == BD_E164
        with pytest.raises(ValidationError) as excinfo:
            ApplicationCreate.model_validate({**base, "mobile": "12"})
        assert "PHONE_INVALID" in str(excinfo.value)


@pytest.mark.asyncio
async def test_submission_422_detail_contains_phone_invalid_key(
    client: AsyncClient, admin_user: AdminUser
) -> None:
    payload = _submission_payload()
    payload["mobile"] = "12345"

    response = await client.post("/api/submissions", data={"payload": json.dumps(payload)})

    assert response.status_code == 422
    assert "PHONE_INVALID" in json.dumps(response.json())


def _legacy_member(mobile: str, **overrides) -> Member:
    values = dict(
        status=MemberStatus.PENDING,
        full_name="Legacy",
        father_or_husband="f",
        mother="m",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="job",
        nid="5555555555",
        mobile=mobile,
        gender="male",
        email="legacy@example.com",
        admission_fee="500",
        subscription="100",
        receipt_no="r",
        payment_method="cash",
        submission_date="2026-01-01",
    )
    values.update(overrides)
    return Member(**values)


@pytest.mark.asyncio
@pytest.mark.parametrize("submitted", ["01712345678", "+8801712345678", "8801712345678", "০১৭১২৩৪৫৬৭৮"])
@pytest.mark.parametrize("stored", ["01712345678", "+8801712345678"])
async def test_same_person_in_any_format_is_a_duplicate(
    client: AsyncClient,
    admin_user: AdminUser,
    db_session: AsyncSession,
    submitted: str,
    stored: str,
) -> None:
    db_session.add(_legacy_member(stored))
    await db_session.commit()
    payload = _submission_payload()
    payload["mobile"] = submitted

    response = await client.post("/api/submissions", data={"payload": json.dumps(payload)})

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "APPLICATION_PENDING"


@pytest.mark.asyncio
async def test_duplicate_matches_non_canonical_stored_value(
    client: AsyncClient, admin_user: AdminUser, db_session: AsyncSession
) -> None:
    """Rows written by hand / imports may not be canonical; the comparison is
    on the normalised E.164 of the stored value too."""
    db_session.add(_legacy_member("+880 1712345678"))
    await db_session.commit()
    payload = _submission_payload()
    payload["mobile"] = "+8801712345678"

    response = await client.post("/api/submissions", data={"payload": json.dumps(payload)})

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_different_number_is_not_a_duplicate(
    client: AsyncClient, admin_user: AdminUser, db_session: AsyncSession
) -> None:
    db_session.add(_legacy_member("01712345678"))
    await db_session.commit()
    payload = _submission_payload()
    payload["mobile"] = "01712345679"
    payload["nid"] = "9999999990"
    payload["email"] = "other@example.com"

    response = await client.post("/api/submissions", data={"payload": json.dumps(payload)})

    assert response.status_code == 201


@pytest.mark.asyncio
async def test_submission_stores_saudi_number_as_e164(
    client: AsyncClient, admin_user: AdminUser, db_session: AsyncSession
) -> None:
    payload = _submission_payload()
    payload["mobile"] = "+966 50 123 4567"

    response = await client.post("/api/submissions", data={"payload": json.dumps(payload)})

    assert response.status_code == 201
    member = await db_session.get(Member, response.json()["id"])
    assert member is not None
    assert member.mobile == "+966501234567"
