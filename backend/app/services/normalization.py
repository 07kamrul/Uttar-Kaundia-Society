"""Normalization for applicant identity fields (NID, mobile, email).

These are the canonical forms stored on `Member.nid`/`mobile`/`email` and
used for duplicate-submission lookups, so a stored value and a freshly
normalized comparison value are always byte-for-byte comparable.
"""
import re
from typing import Literal

import phonenumbers

_NON_DIGITS = re.compile(r"\D+")
_BANGLADESH_COUNTRY_CODE = 880


def normalize_nid(nid: str) -> str:
    """Digits only, matching the `^\\d{10,17}$` format enforced client-side."""
    return _NON_DIGITS.sub("", nid.strip())


# Numbers typed without a leading "+" (e.g. legacy "01712345678") are read as
# Bangladeshi, which is also the country the frontend preselects.
DEFAULT_PHONE_REGION = "BD"

# Key-like 422 detail the clients translate; never a human sentence.
PHONE_INVALID = "PHONE_INVALID"

_BANGLA_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_PHONE_SEPARATORS = re.compile(r"[\s\-().]+")

PhoneStatus = Literal["valid", "possible", "invalid"]


def ascii_digits(value: str) -> str:
    """`value` with Bangla digits (০-৯) replaced by ASCII digits."""
    return value.translate(_BANGLA_DIGITS)


def _parse_phone(raw: object) -> phonenumbers.PhoneNumber | None:
    """Parse `raw` as typed by a person, or None when it cannot be parsed.

    Accepts Bangla digits, spaces/dashes/dots/parentheses and the "00"
    international prefix ("0044 7911 123456" is "+44 7911 123456"). Numbers
    without a country prefix are read as Bangladeshi.
    """
    if not isinstance(raw, str):
        return None
    text = ascii_digits(raw).strip()
    if not text:
        return None
    if _PHONE_SEPARATORS.sub("", text).startswith("00"):
        text = "+" + _PHONE_SEPARATORS.sub("", text)[2:]
    try:
        return phonenumbers.parse(text, DEFAULT_PHONE_REGION)
    except phonenumbers.NumberParseException:
        return None


def phone_status(raw: str) -> PhoneStatus:
    """"valid" (a real number for its country), "possible" (plausible length
    but not a recognised number) or "invalid" (cannot be a phone number)."""
    parsed = _parse_phone(raw)
    if parsed is None or not phonenumbers.is_possible_number(parsed):
        return "invalid"
    return "valid" if phonenumbers.is_valid_number(parsed) else "possible"


def normalize_mobile(mobile: str) -> str:
    """E.164 form (e.g. "+8801712345678") of any country's phone number.

    Raises ValueError(PHONE_INVALID) unless the number is at least *possible*.
    Possible-but-not-valid numbers are accepted on purpose (new mobile ranges
    appear faster than the phonenumbers metadata); use `phone_status` to tell
    them apart.
    """
    parsed = _parse_phone(mobile)
    if parsed is None or not phonenumbers.is_possible_number(parsed):
        raise ValueError(PHONE_INVALID)
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


def phone_tail_digits(value: str, n: int) -> str:
    """The last `n` ASCII digits of `value` (Bangla digits converted).

    Shorter than `n` digits returns all of them; used by admin search to match
    a number regardless of country code, trunk prefix or formatting.
    """
    if n <= 0:
        return ""
    return _NON_DIGITS.sub("", ascii_digits(value))[-n:]


def mobile_lookup_variants(e164_mobile: str) -> list[str]:
    """Every stored form a number may have, for duplicate lookups.

    Rows written before international support hold digits-only national
    numbers ("01712345678"); they are left as-is until the phone migration
    runs, so lookups must match both that legacy form and the E.164 form new
    rows are stored in.
    """
    parsed = phonenumbers.parse(e164_mobile)
    variants = {e164_mobile, _NON_DIGITS.sub("", e164_mobile)}
    if parsed.country_code == _BANGLADESH_COUNTRY_CODE:
        variants.add(f"0{parsed.national_number}")
    return sorted(variants)


def same_phone(stored: str | None, e164_mobile: str) -> bool:
    """True when `stored` (any legacy/hand-typed form) is the number `e164_mobile`."""
    if not stored:
        return False
    try:
        return normalize_mobile(stored) == e164_mobile
    except ValueError:
        return False


def normalize_email(email: str) -> str:
    return email.strip().lower()
