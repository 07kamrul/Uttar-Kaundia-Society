"""Limited login for rejected applicants (the correction / resubmission loop).

A rejected applicant gets a MemberCredential whose username is their email,
and signs in with role ``applicant`` until final approval mints their member
ID. Approval then swaps the username to the member ID (see
``promote_applicant_credential``) so members sign in with their member ID.
"""

from __future__ import annotations

import html
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import generate_temp_password, hash_password_async
from app.models.application_review import ApplicationReview
from app.models.credential import MemberCredential
from app.models.member import Member, MemberStatus

APPLICANT_ROLE = "applicant"
MEMBER_ROLE = "member"
APPLICANT_PERMISSIONS = sorted(["application.view", "application.edit"])

# Form sections an admin can flag for correction when rejecting. Keys are
# stable API values; the frontend maps each to its wizard step and label.
CORRECTION_FIELDS: tuple[str, ...] = (
    "personal_info",
    "photo",
    "nid",
    "contact",
    "address",
    "properties",
    "documents",
    "nominees",
    "urgent_contact",
    "payment",
    "signature",
)

_CORRECTION_LABELS: dict[str, str] = {
    "personal_info": "ব্যক্তিগত তথ্য / Personal information",
    "photo": "ছবি / Photo",
    "nid": "জাতীয় পরিচয়পত্র / NID",
    "contact": "মোবাইল ও ইমেইল / Mobile & email",
    "address": "ঠিকানা / Address",
    "properties": "জমির তথ্য / Land details",
    "documents": "কাগজপত্র / Documents",
    "nominees": "নমিনি / Nominee",
    "urgent_contact": "জরুরি যোগাযোগ / Emergency contact",
    "payment": "পেমেন্ট / Payment",
    "signature": "স্বাক্ষর / Signature",
}

# Usernames are member IDs (UKAMKS-N, lower-cased) or applicant emails.
_USERNAME_MAX_LENGTH = 64


def is_applicant(member_code: str | None, status: MemberStatus | str | None) -> bool:
    """Still in the application loop: never approved (no member ID) and not
    approved now. Approved rows without an ID (legacy data) are members."""
    return not member_code and status != MemberStatus.APPROVED


def token_role_for(member_code: str | None, status: MemberStatus | str | None) -> str:
    """Full member session once approved; the limited one before that."""
    return APPLICANT_ROLE if is_applicant(member_code, status) else MEMBER_ROLE


def can_reset_password(member: Member) -> bool:
    """Approved members and applicants (no member ID yet) may reset; a member
    re-queued or rejected after approval may not, as before."""
    return member.status == MemberStatus.APPROVED or is_applicant(member.member_id, member.status)


@dataclass(frozen=True)
class IssuedLogin:
    username: str
    # Plain text only when a new password was set; None when unchanged.
    temp_password: str | None


async def _username_taken(db: AsyncSession, username: str, member_pk: int) -> bool:
    owner = (
        await db.execute(
            select(MemberCredential.member_id).where(MemberCredential.username == username)
        )
    ).scalar_one_or_none()
    return owner is not None and owner != member_pk


async def _applicant_username(db: AsyncSession, member: Member) -> str:
    """The applicant's email, unless another login already uses it (then a
    stable fallback; email login still resolves through Member.email)."""
    email = (member.email or "").strip().lower()
    if email and len(email) <= _USERNAME_MAX_LENGTH and not await _username_taken(
        db, email, member.id
    ):
        return email
    return f"applicant-{member.id}"


async def find_credential(db: AsyncSession, member_pk: int) -> MemberCredential | None:
    return (
        await db.execute(select(MemberCredential).where(MemberCredential.member_id == member_pk))
    ).scalar_one_or_none()


async def ensure_applicant_login(db: AsyncSession, member: Member) -> IssuedLogin:
    """Create the applicant's login on first rejection. A repeat rejection
    keeps the existing password (the applicant may already have changed it).
    Does not commit."""
    credential = await find_credential(db, member.id)
    if credential is not None:
        return IssuedLogin(username=credential.username, temp_password=None)

    temp_password = generate_temp_password()
    username = await _applicant_username(db, member)
    db.add(
        MemberCredential(
            member_id=member.id,
            username=username,
            password_hash=await hash_password_async(temp_password),
            must_change_password=True,
        )
    )
    return IssuedLogin(username=username, temp_password=temp_password)


async def rotate_temp_password(credential: MemberCredential) -> str:
    """New temporary password; revokes every open session. Does not commit."""
    temp_password = generate_temp_password()
    credential.password_hash = await hash_password_async(temp_password)
    credential.must_change_password = True
    credential.token_version += 1
    return temp_password


async def promote_applicant_credential(credential: MemberCredential, member_code: str) -> str:
    """Final approval of an applicant: sign in with the member ID from now on,
    with a fresh temporary password. Revokes the applicant session."""
    credential.username = member_code.lower()
    return await rotate_temp_password(credential)


def login_url() -> str:
    return get_settings().frontend_base_url.rstrip("/") + "/login"


def correction_labels(fields: list[str] | None) -> list[str]:
    return [_CORRECTION_LABELS[f] for f in fields or [] if f in _CORRECTION_LABELS]


def _correction_list_html(fields: list[str] | None) -> str:
    labels = correction_labels(fields)
    if not labels:
        return ""
    items = "".join(f"<li>{html.escape(label)}</li>" for label in labels)
    return f"<p><b>সংশোধন করতে হবে / Please correct:</b></p><ul>{items}</ul>"


def _login_block_html(login: IssuedLogin) -> str:
    url = html.escape(login_url())
    username = html.escape(login.username)
    password = (
        f"অস্থায়ী পাসওয়ার্ড / Temporary password: <b>{html.escape(login.temp_password)}</b><br/>"
        if login.temp_password
        else "পাসওয়ার্ড / Password: আগের পাসওয়ার্ডটি ব্যবহার করুন / use your existing password<br/>"
    )
    return (
        "<p><b>আবেদন সংশোধনের লগইন / Login to correct your application</b><br/>"
        f'ওয়েবসাইট / Website: <a href="{url}">{url}</a><br/>'
        f"ইউজারনেম / Username: <b>{username}</b><br/>"
        f"{password}</p>"
    )


def rejection_email_body(
    full_name: str, reason: str, fields: list[str] | None, login: IssuedLogin | None
) -> str:
    """Bilingual rejection notice with the correction list and, for an
    applicant, the login to fix and resubmit. Every value is HTML-escaped."""
    name = html.escape(full_name)
    safe_reason = html.escape(reason)
    contact = html.escape(get_settings().smtp_from)
    login_html = _login_block_html(login) if login is not None else ""
    next_step_bn = (
        "লগইন করে আবেদনটি সংশোধন করুন এবং পুনরায় জমা দিন।"
        if login is not None
        else "প্রয়োজনীয় সংশোধন করে আপনি নতুন করে আবেদন করতে পারবেন।"
    )
    next_step_en = (
        "Log in, correct your application and resubmit it - no new application is needed."
        if login is not None
        else "You may correct the issue and submit a new application."
    )
    return (
        f"<p>প্রিয় {name},</p>"
        "<p>আপনার সদস্যপদের আবেদনটি অনুমোদিত হয়নি।</p>"
        f"<p><b>কারণ:</b> {safe_reason}</p>"
        f"<p>{next_step_bn}</p>"
        "<hr/>"
        f"<p>Dear {name},</p>"
        "<p>Your membership application was not approved.</p>"
        f"<p><b>Reason:</b> {safe_reason}</p>"
        f"<p>{next_step_en}</p>"
        f"{_correction_list_html(fields)}"
        f"{login_html}"
        f"<p>Contact: {contact}</p>"
    )


def resubmission_received_email_body(full_name: str) -> str:
    name = html.escape(full_name)
    return (
        f"<p>প্রিয় {name},</p>"
        "<p>আপনার সংশোধিত আবেদনটি পুনরায় জমা হয়েছে এবং পর্যালোচনার অপেক্ষায় আছে।</p>"
        "<hr/>"
        f"<p>Dear {name},</p>"
        "<p>Your corrected application was resubmitted and is waiting for review.</p>"
    )


async def review_history(db: AsyncSession, member_pk: int) -> list[ApplicationReview]:
    """Review rounds of one application, oldest first."""
    result = await db.execute(
        select(ApplicationReview)
        .where(ApplicationReview.member_id == member_pk)
        .order_by(ApplicationReview.id)
    )
    return list(result.scalars().all())
