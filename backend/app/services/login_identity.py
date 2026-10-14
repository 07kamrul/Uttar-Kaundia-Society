"""Who is logging in? Resolve a typed identifier to member credentials (Batch 6).

`POST /api/login` accepts an admin email, a member ID, and - with the
`login_by_phone` flag - a mobile number or a member's registered email. This
module classifies the identifier, builds the canonical rate-limit key and finds
the credential candidates; the route verifies passwords.

It also holds the read-only duplicate report (`duplicate_groups`) behind
`GET /api/admin/login-readiness` and `scripts/report_duplicate_mobiles.py`:
the same number or email on two logins makes that identifier ambiguous.
"""

import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.credential import MemberCredential
from app.models.member import Member, MemberStatus
from app.services.normalization import ascii_digits, mobile_lookup_variants, normalize_mobile

IdentifierKind = Literal["email", "phone", "username"]

MIN_PHONE_DIGITS = 10
# A shared number/email can hold many accounts in theory; checking five passwords
# is enough to tell "ambiguous" from "wrong" without a bcrypt amplification.
MAX_CANDIDATES = 5

_PHONE_LIKE = re.compile(r"^[\d+\-\s().]+$")
_NON_DIGITS = re.compile(r"\D")


@dataclass(frozen=True)
class LoginIdentity:
    kind: IdentifierKind
    text: str  # trimmed, Bangla digits converted, lowercased (E.164 for phones)
    key: str  # canonical rate-limit key


def _clean(raw: str) -> str:
    return ascii_digits(raw).strip()


def _e164_or_none(text: str) -> str | None:
    try:
        return normalize_mobile(text)
    except ValueError:
        return None


def classify(raw: str) -> IdentifierKind:
    """"email" if it has an "@"; "phone" if it is phone-shaped with at least ten
    digits and parses (no "+" means Bangladesh, so foreign numbers need one);
    otherwise "username" (member IDs contain letters)."""
    text = _clean(raw)
    if "@" in text:
        return "email"
    if (
        _PHONE_LIKE.match(text)
        and len(_NON_DIGITS.sub("", text)) >= MIN_PHONE_DIGITS
        and _e164_or_none(text) is not None
    ):
        return "phone"
    return "username"


def resolve(raw: str, *, by_phone: bool) -> LoginIdentity:
    """With `by_phone` off this is today's behaviour: lowercased text, always a
    username lookup, rate-limited per raw identifier."""
    if not by_phone:
        text = raw.strip().lower()
        return LoginIdentity("username", text, text)
    kind = classify(raw)
    if kind == "phone":
        e164 = normalize_mobile(_clean(raw))
        return LoginIdentity("phone", e164, e164)
    text = _clean(raw).lower()
    return LoginIdentity(kind, text, text)


def login_key(raw: str) -> str:
    """Canonical rate-limit key: E.164 for phones, lowercased text otherwise, so
    one number typed in several formats shares a single failure bucket."""
    return resolve(raw, by_phone=True).key


def _with_credential(*conditions):
    return (
        select(MemberCredential)
        .join(Member, Member.id == MemberCredential.member_id)
        .where(Member.status != MemberStatus.REJECTED, *conditions)
        .order_by(MemberCredential.id)
        .limit(MAX_CANDIDATES)
    )


async def find_credentials(db: AsyncSession, identity: LoginIdentity) -> list[MemberCredential]:
    """Credentials an identifier may belong to (at most `MAX_CANDIDATES`)."""
    if identity.kind == "phone":
        statement = _with_credential(Member.mobile.in_(mobile_lookup_variants(identity.text)))
        return list((await db.execute(statement)).scalars().all())

    by_username = (
        await db.execute(select(MemberCredential).where(MemberCredential.username == identity.text))
    ).scalar_one_or_none()
    if by_username is not None or identity.kind == "username":
        return [] if by_username is None else [by_username]

    statement = _with_credential(func.lower(Member.email) == identity.text)
    return list((await db.execute(statement)).scalars().all())


# --- duplicate report (read-only) -----------------------------------------


@dataclass(frozen=True)
class GroupMember:
    id: int
    member_id: str | None
    full_name: str
    status: str
    has_login: bool


@dataclass(frozen=True)
class DuplicateGroup:
    key: str  # E.164 number, or lowercased email
    members: tuple[GroupMember, ...]

    @property
    def blocking(self) -> bool:
        """Two logins behind one identifier make that identifier ambiguous."""
        return sum(1 for m in self.members if m.has_login) >= 2


@dataclass(frozen=True)
class UnparseableMobile:
    id: int
    member_id: str | None
    raw: str


@dataclass(frozen=True)
class DuplicateReport:
    members_with_login: int
    mobile_groups: tuple[DuplicateGroup, ...]
    email_groups: tuple[DuplicateGroup, ...]
    unparseable_mobiles: tuple[UnparseableMobile, ...]

    @property
    def blocking_mobile_groups(self) -> tuple[DuplicateGroup, ...]:
        return tuple(g for g in self.mobile_groups if g.blocking)


def _groups(buckets: dict[str, list[GroupMember]]) -> tuple[DuplicateGroup, ...]:
    return tuple(
        DuplicateGroup(key, tuple(sorted(members, key=lambda m: m.id)))
        for key, members in sorted(buckets.items())
        if len(members) >= 2
    )


async def duplicate_groups(db: AsyncSession) -> DuplicateReport:
    """Group every non-rejected member by normalised mobile and by email.

    Normalising in Python makes `017...` and `+88017...` collide, which the
    exact-string unique index cannot see. Issues only SELECTs."""
    rows = (
        await db.execute(
            select(
                Member.id,
                Member.member_id,
                Member.full_name,
                Member.status,
                Member.mobile,
                Member.email,
                MemberCredential.id.is_not(None),
            )
            .outerjoin(MemberCredential, MemberCredential.member_id == Member.id)
            .where(Member.status != MemberStatus.REJECTED)
            .order_by(Member.id)
        )
    ).all()

    mobiles: dict[str, list[GroupMember]] = defaultdict(list)
    emails: dict[str, list[GroupMember]] = defaultdict(list)
    unparseable: list[UnparseableMobile] = []
    with_login = 0
    for pk, code, name, status, mobile, email, has_login in rows:
        member = GroupMember(pk, code, name, getattr(status, "value", str(status)), bool(has_login))
        with_login += member.has_login
        e164 = _e164_or_none(mobile or "")
        if e164 is None:
            unparseable.append(UnparseableMobile(pk, code, mobile or ""))
        else:
            mobiles[e164].append(member)
        if email and email.strip():
            emails[email.strip().lower()].append(member)

    return DuplicateReport(
        members_with_login=with_login,
        mobile_groups=_groups(mobiles),
        email_groups=_groups(emails),
        unparseable_mobiles=tuple(unparseable),
    )
