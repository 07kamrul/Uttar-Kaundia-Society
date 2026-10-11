"""Shared governance foundation: working-day arithmetic, SLA status,
election eligibility, quorum and constitutional constants.

Later governance modules (elections, meetings, petitions, complaints,
amendments, funds) must import their SLA/quorum numbers from here instead of
hardcoding them in module code or in the frontend.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from app.models.member import (
    GOVERNANCE_STATUS_SUSPENDED,
    MEMBER_CLASS_FOUNDER,
    MEMBER_CLASS_GENERAL,
    MemberStatus,
)

# --- Constitutional constants (গঠনতন্ত্র) -----------------------------------
#
# Notice periods and response windows, in (working) days.
AGM_NOTICE_DAYS = 15
EMERGENCY_MEETING_NOTICE_DAYS = 3
APPEAL_WINDOW_DAYS = 30
PETITION_RESPONSE_DAYS = 30
COMPLAINT_ACK_WORKING_DAYS = 3
COMPLAINT_UPDATE_WORKING_DAYS = 15
MEMBERSHIP_SLA_WORKING_DAYS = 20

# গঠনতন্ত্র: নির্বাহী পরিষদ ১১ সদস্যের (একটি পদ স্থায়ী পরিষদ সদস্য)।
EXECUTIVE_COUNCIL_SIZE = 11

# Quorum: executive council needs 6 of 11 present; the standing council
# (স্থায়ী পরিষদ) needs a strict majority - floor(11/2) + 1 = 6.
_QUORUM_FLOOR = {"executive": EXECUTIVE_COUNCIL_SIZE // 2 + 1, "standing": EXECUTIVE_COUNCIL_SIZE // 2 + 1}

# The 11 council posts defined by the constitution, as structured data so the
# frontend never hardcodes them.
COUNCIL_POSTS: tuple[dict, ...] = (
    {"key": "president", "bn": "সভাপতি", "en": "President", "council": "executive"},
    {"key": "vice_president", "bn": "সহ-সভাপতি", "en": "Vice President", "council": "executive"},
    {"key": "general_secretary", "bn": "সাধারণ সম্পাদক", "en": "General Secretary", "council": "executive"},
    {"key": "joint_secretary", "bn": "যুগ্ম সম্পাদক", "en": "Joint Secretary", "council": "executive"},
    {"key": "organizing_secretary", "bn": "সাংগঠনিক সম্পাদক", "en": "Organizing Secretary", "council": "executive"},
    {"key": "treasurer", "bn": "কোষাধ্যক্ষ", "en": "Treasurer", "council": "executive"},
    {"key": "sports_culture_secretary", "bn": "ক্রীড়া ও সাংস্কৃতিক সম্পাদক", "en": "Sports & Cultural Secretary", "council": "executive"},
    {"key": "religion_welfare_secretary", "bn": "ধর্মীয় ও সমাজকল্যাণ সম্পাদক", "en": "Religious & Social Welfare Secretary", "council": "executive"},
    {"key": "publicity_secretary", "bn": "প্রচার সম্পাদক", "en": "Publicity Secretary", "council": "executive"},
    {"key": "executive_member", "bn": "কার্যকরী সদস্য (২)", "en": "Executive Member (2)", "council": "executive"},
    {"key": "standing_council_member", "bn": "স্থায়ী পরিষদ সদস্য", "en": "Standing Council Member", "council": "standing"},
)

POST_KEYS: frozenset[str] = frozenset(post["key"] for post in COUNCIL_POSTS)

# Constitutionally allowed income sources. `other_income` requires a written
# justification; any source outside this list (notably foreign funding) is
# blocked unless a government-approval reference is recorded.
INCOME_SOURCES: tuple[dict, ...] = (
    {"key": "admission_fee", "bn": "ভর্তি ফি", "en": "Admission fee", "requires_justification": False},
    {"key": "subscription", "bn": "মাসিক চাঁদা", "en": "Monthly subscription", "requires_justification": False},
    {"key": "donation", "bn": "দান/অনুদান", "en": "Donation", "requires_justification": False},
    {"key": "welfare_fund", "bn": "সদস্যকল্যাণ তহবিল", "en": "Member welfare fund", "requires_justification": False},
    {"key": "government_grant", "bn": "সরকারি অনুদান", "en": "Government grant", "requires_justification": False},
    {"key": "other_income", "bn": "অন্যান্য", "en": "Other", "requires_justification": True},
)

FOREIGN_FUNDING_KEY = "foreign_funding"  # never in INCOME_SOURCES; needs gov approval ref


# --- Working days (Bangladesh weekend: Friday + Saturday off) ---------------


def is_working_day(day: date) -> bool:
    """Friday (4) and Saturday (5) are the Bangladesh weekend."""
    return day.weekday() not in (4, 5)


def add_working_days(start: date, days: int) -> date:
    """`days` working days after `start` (start itself not counted)."""
    remaining = days
    current = start
    while remaining > 0:
        current += timedelta(days=1)
        if is_working_day(current):
            remaining -= 1
    return current


def working_days_between(a: date, b: date) -> int:
    """Signed count of working days in [min(a, b), max(a, b)); negative when
    b < a, 0 for the same day or a weekend-only span."""
    if a == b:
        return 0
    sign = 1 if b > a else -1
    count = 0
    current = min(a, b)
    end = max(a, b)
    while current < end:
        if is_working_day(current):
            count += 1
        current += timedelta(days=1)
    return sign * count


# --- SLA tracking -----------------------------------------------------------


@dataclass(frozen=True)
class SlaStatus:
    state: str  # 'on_track' | 'due_soon' | 'overdue' | 'met'
    days_remaining: int


DUE_SOON_WINDOW_DAYS = 3


def sla_status(
    *,
    due: datetime | date,
    acknowledged: datetime | None = None,
    now: datetime | None = None,
) -> dict:
    """Where a deadline stands. `acknowledged` set before/after the deadline
    yields state 'met' (on time) / 'overdue' (late, still flagged met-late via
    days_remaining sign). Without acknowledgement: on_track -> due_soon
    (within DUE_SOON_WINDOW_DAYS) -> overdue."""
    now = now or datetime.now(timezone.utc)
    now_date = now.date() if isinstance(now, datetime) else now
    due_date = due.date() if isinstance(due, datetime) else due

    if acknowledged is not None:
        ack_date = acknowledged.date() if isinstance(acknowledged, datetime) else acknowledged
        return SlaStatus(
            state="met" if ack_date <= due_date else "overdue",
            days_remaining=(due_date - ack_date).days,
        ).__dict__

    days_remaining = (due_date - now_date).days
    if days_remaining < 0:
        state = "overdue"
    elif days_remaining <= DUE_SOON_WINDOW_DAYS:
        state = "due_soon"
    else:
        state = "on_track"
    return SlaStatus(state=state, days_remaining=days_remaining).__dict__


# --- Eligibility & quorum ---------------------------------------------------


def is_election_eligible(member) -> bool:
    """Founder or general class, approved, and not suspended."""
    if getattr(member, "status", None) != MemberStatus.APPROVED:
        return False
    if getattr(member, "governance_status", None) == GOVERNANCE_STATUS_SUSPENDED:
        return False
    return getattr(member, "member_class", None) in (MEMBER_CLASS_FOUNDER, MEMBER_CLASS_GENERAL)


def quorum_met(present: int, body: str) -> bool:
    """`body` is 'executive' or 'standing' (স্থায়ী পরিষদ); both need 6 of 11
    (strict majority of EXECUTIVE_COUNCIL_SIZE)."""
    floor = _QUORUM_FLOOR.get(body)
    if floor is None:
        raise ValueError(f"Unknown body: {body!r} (expected 'executive' or 'standing')")
    return present >= floor


def public_constants() -> dict:
    """Everything the frontend needs to render governance rules without
    hardcoding numbers or Bengali labels."""
    return {
        "notice_periods": {
            "agm_notice_days": AGM_NOTICE_DAYS,
            "emergency_meeting_notice_days": EMERGENCY_MEETING_NOTICE_DAYS,
            "appeal_window_days": APPEAL_WINDOW_DAYS,
            "petition_response_days": PETITION_RESPONSE_DAYS,
            "complaint_ack_working_days": COMPLAINT_ACK_WORKING_DAYS,
            "complaint_update_working_days": COMPLAINT_UPDATE_WORKING_DAYS,
            "membership_sla_working_days": MEMBERSHIP_SLA_WORKING_DAYS,
        },
        "council_size": EXECUTIVE_COUNCIL_SIZE,
        "quorum": {body: EXECUTIVE_COUNCIL_SIZE // 2 + 1 for body in ("executive", "standing")},
        "council_posts": list(COUNCIL_POSTS),
        "income_sources": list(INCOME_SOURCES),
        "foreign_funding_blocked": True,
        "weekend_days": [4, 5],  # Friday, Saturday
    }
