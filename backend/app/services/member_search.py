"""Free-text search over members for the admin list endpoints.

Behaviour (`GET /api/admin/members?search=` and `/api/admin/submissions?search=`):

* The term is trimmed; blank means "no filter".
* Name, member id and email are matched case-insensitively as substrings
  (`%`/`_` in the term are literal).
* If the term looks like a phone number (only digits - Bangla digits allowed -
  plus `+ - . ( )` and spaces) and has at least 7 digits, `members.mobile` is
  also matched by its *ending*: the last 9 digits of the term (or all of them
  when fewer than 9 were typed, minimum 7) must end the stored number. This
  finds the same person whether the row holds `+8801712345678` or the legacy
  `01712345678`, and whether the term was typed with `+880`, `0`, `00`, spaces
  or dashes. Seven or eight digits can therefore match several people; nine
  digits are practically unique within a country.
"""

import re

from sqlalchemy import ColumnElement, or_
from sqlalchemy.orm import InstrumentedAttribute

from app.models.member import Member
from app.models.membership_appeal import MembershipApplication
from app.services.normalization import ascii_digits, phone_tail_digits

SEARCH_MAX_LENGTH = 100
PHONE_SEARCH_MIN_DIGITS = 7
PHONE_SEARCH_TAIL_DIGITS = 9

_PHONE_LIKE_TERM = re.compile(r"^[\d+\-\s().]+$")
_LIKE_ESCAPE = "\\"


def _escape_like(term: str) -> str:
    return (
        term.replace(_LIKE_ESCAPE, _LIKE_ESCAPE * 2)
        .replace("%", f"{_LIKE_ESCAPE}%")
        .replace("_", f"{_LIKE_ESCAPE}_")
    )


def phone_tail_clause(column: InstrumentedAttribute, term: str) -> ColumnElement[bool] | None:
    """`column LIKE '%<tail>'` when `term` looks like a phone number with enough
    digits (see the module docstring), else None. Shared by every search that
    must find one person under `+880...`, `01...` or Bangla digits."""
    text = term.strip()
    if not _PHONE_LIKE_TERM.match(ascii_digits(text)):
        return None
    tail = phone_tail_digits(text, PHONE_SEARCH_TAIL_DIGITS)
    if len(tail) < PHONE_SEARCH_MIN_DIGITS:
        return None
    return column.like(f"%{tail}")


def member_search_clause(term: str | None) -> ColumnElement[bool] | None:
    """WHERE clause for `term`, or None when there is nothing to filter on."""
    if term is None or not term.strip():
        return None
    text = term.strip()
    pattern = f"%{_escape_like(text)}%"
    clauses = [
        Member.full_name.ilike(pattern, escape=_LIKE_ESCAPE),
        Member.member_id.ilike(pattern, escape=_LIKE_ESCAPE),
        Member.email.ilike(pattern, escape=_LIKE_ESCAPE),
    ]
    if (phone := phone_tail_clause(Member.mobile, text)) is not None:
        clauses.append(phone)
    return or_(*clauses)


def application_search_clause(term: str | None) -> ColumnElement[bool] | None:
    """Membership-application search: the applicant's name (case-insensitive
    substring, `%`/`_` literal) or a phone number matched by its ending."""
    if term is None or not term.strip():
        return None
    text = term.strip()
    clauses = [
        MembershipApplication.full_name.ilike(f"%{_escape_like(text)}%", escape=_LIKE_ESCAPE)
    ]
    if (phone := phone_tail_clause(MembershipApplication.mobile, text)) is not None:
        clauses.append(phone)
    return or_(*clauses)
