"""Password policy for new passwords (reset and change).

v1 (default, flag ``password_policy_v2`` off): at least 8 characters including a
digit. v2 (flag on): at least 8 characters, not a very common password, no forced
digit. Both refuse a "new" password equal to the current one.

Failures carry a machine ``code`` next to the human message. The clients map the
code to their own copy; the blocklist stays on the server so it can change
without an app release.
"""

from dataclasses import dataclass

from app.services.normalization import ascii_digits

MIN_PASSWORD_LENGTH = 8

# v2 codes (the clients map these).
PASSWORD_TOO_SHORT = "PASSWORD_TOO_SHORT"
PASSWORD_TOO_COMMON = "PASSWORD_TOO_COMMON"
PASSWORD_SAME_AS_CURRENT = "PASSWORD_SAME_AS_CURRENT"
# v1 only: "too short OR no digit" is one message, so it cannot be reported as
# PASSWORD_TOO_SHORT (a 10-character password without a digit is not too short).
PASSWORD_TOO_WEAK = "PASSWORD_TOO_WEAK"

V1_MESSAGE = f"Password must be at least {MIN_PASSWORD_LENGTH} characters and include a number"
TOO_SHORT_MESSAGE = f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
TOO_COMMON_MESSAGE = "This password is too common. Choose a different one"
SAME_AS_CURRENT_MESSAGE = "New password must be different from the current password"

# Lowercase, ASCII digits only: the check normalises its input the same way.
COMMON_PASSWORDS: frozenset[str] = frozenset(
    {
        # digit runs and patterns
        "12345678", "123456789", "1234567890", "12345678910", "11111111", "22222222",
        "33333333", "44444444", "55555555", "66666666", "77777777", "88888888",
        "99999999", "00000000", "87654321", "98765432", "987654321", "01234567",
        "012345678", "0123456789", "12341234", "11223344", "12121212", "123123123",
        "123454321", "147258369", "13572468", "1q2w3e4r", "1q2w3e4r5t", "1qaz2wsx",
        "q1w2e3r4",
        # keyboard walks and generic words
        "password", "password1", "password12", "password123", "password1234", "passw0rd",
        "p@ssw0rd", "p@ssword", "pass1234", "pass12345", "passpass", "qwertyui",
        "qwertyuiop", "qwerty12", "qwerty123", "qwerty1234", "qwerty12345", "asdfghjk",
        "asdfghjkl", "asdf1234", "asdfasdf", "zxcvbnm1", "zxcvbnm123", "abcd1234",
        "abcd12345", "abc12345", "abc123456", "abcdefg1", "abcdefgh1",
        "iloveyou", "iloveyou1", "iloveyou123", "admin123", "admin1234", "adminadmin",
        "administrator", "welcome1", "welcome123", "letmein1", "letmein123", "changeme",
        "changeme1", "changeme123", "football", "football1", "baseball", "monkey123",
        "dragon123", "master123", "sunshine", "princess", "superman", "shadow123",
        "trustno1", "login123", "user1234", "test1234", "testtest", "test12345",
        "secret123", "secret12", "mypassword", "mypass123",
        # local (Bangladesh / the society)
        "bangladesh", "bangladesh1", "bangladesh12", "bangladesh123", "bangla123",
        "dhaka123", "dhaka1234", "dhakacity", "bd123456", "bd1234567", "kaundia",
        "kaundia1", "kaundia12", "kaundia123", "kaundia1234", "ukamks123", "ukamks1234",
        "ukamks12", "bismillah", "bismillah1", "allah1234", "allahuakbar", "islam1234",
        "muhammad1", "mohammad1", "rahman123",
    }
)


@dataclass(frozen=True)
class PasswordIssue:
    """Why a proposed password was refused."""

    code: str
    message: str


def _blocklist_form(password: str) -> str:
    return ascii_digits(password).strip().lower()


def is_common_password(password: str) -> bool:
    """Case-insensitive, Bangla-digit-insensitive, whitespace-trimmed lookup."""
    return _blocklist_form(password) in COMMON_PASSWORDS


def check_new_password(
    current_password: str, new_password: str, *, policy_v2: bool = False
) -> PasswordIssue | None:
    """The first rule `new_password` breaks, or None when it is acceptable.

    Pass ``current_password=""`` when there is no current password (reset)."""
    if policy_v2:
        if len(new_password) < MIN_PASSWORD_LENGTH:
            return PasswordIssue(PASSWORD_TOO_SHORT, TOO_SHORT_MESSAGE)
        if is_common_password(new_password):
            return PasswordIssue(PASSWORD_TOO_COMMON, TOO_COMMON_MESSAGE)
    elif len(new_password) < MIN_PASSWORD_LENGTH or not any(c.isdigit() for c in new_password):
        return PasswordIssue(PASSWORD_TOO_WEAK, V1_MESSAGE)
    if new_password == current_password:
        return PasswordIssue(PASSWORD_SAME_AS_CURRENT, SAME_AS_CURRENT_MESSAGE)
    return None
