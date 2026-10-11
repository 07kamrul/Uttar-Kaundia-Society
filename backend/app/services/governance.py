"""Shared governance foundation: working-day arithmetic, SLA status,
election eligibility, quorum and constitutional constants.

Later governance modules (elections, meetings, petitions, complaints,
amendments, funds) must import their SLA/quorum numbers from here instead of
hardcoding them in module code or in the frontend.
"""

import math
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

# --- Module 4 — তহবিল নিয়ন্ত্রণ (fund controls) ------------------------------
#
# The two-person expense threshold is a *versioned* FeeSetting (key below) so
# the committee can tune it without a code change; when no version exists the
# constitution-level default applies. The frontend always reads the resolved
# value from GET /api/admin/fund-controls/settings.
EXPENSE_TWO_PERSON_THRESHOLD_KEY = "expense_two_person_threshold"
DEFAULT_EXPENSE_TWO_PERSON_THRESHOLD = 50000

WELFARE_REQUEST_TYPES: tuple[dict, ...] = (
    {"key": "medical", "bn": "চিকিৎসা", "en": "Medical"},
    {"key": "emergency", "bn": "জরুরি", "en": "Emergency"},
    {"key": "education", "bn": "শিক্ষা", "en": "Education"},
    {"key": "other", "bn": "অন্যান্য", "en": "Other"},
)
WELFARE_REQUEST_TYPE_KEYS: frozenset[str] = frozenset(t["key"] for t in WELFARE_REQUEST_TYPES)

WELFARE_REQUEST_STATUSES: tuple[str, ...] = (
    "submitted",       # জমা দেওয়া হয়েছে
    "under_review",    # পর্যালোচনাধীন
    "approved",        # অনুমোদিত
    "rejected",        # প্রত্যাখ্যাত
    "disbursed",       # পরিশোধিত
)
# A request blocks a member from opening another one while it is still live.
WELFARE_OPEN_STATUSES: frozenset[str] = frozenset(("submitted", "under_review"))

ASSET_CONDITIONS: tuple[dict, ...] = (
    {"key": "good", "bn": "ভালো", "en": "Good"},
    {"key": "fair", "bn": "মোটামুটি", "en": "Fair"},
    {"key": "poor", "bn": "নষ্টপ্রায়", "en": "Poor"},
    {"key": "lost", "bn": "হারানো", "en": "Lost"},
)
ASSET_CONDITION_KEYS: frozenset[str] = frozenset(c["key"] for c in ASSET_CONDITIONS)

WELFARE_ACTIVITY_TYPES: tuple[dict, ...] = (
    {"key": "training", "bn": "প্রশিক্ষণ", "en": "Training"},
    {"key": "welfare", "bn": "কল্যাণমূলক", "en": "Welfare"},
    {"key": "other", "bn": "অন্যান্য", "en": "Other"},
)
WELFARE_ACTIVITY_TYPE_KEYS: frozenset[str] = frozenset(t["key"] for t in WELFARE_ACTIVITY_TYPES)


def fiscal_year_for(day: date) -> str:
    """Bangladesh fiscal year label ("2025-26") for a date: the FY runs
    July 1 - June 30, so a July-December date belongs to `<y>-<y+1>` and a
    January-June date to `<y-1>-<y>`."""
    start_year = day.year if day.month >= 7 else day.year - 1
    return f"{start_year}-{(start_year + 1) % 100:02d}"


def audit_reminder_state(today: date, *, report_exists: bool) -> dict:
    """Annual-audit reminder for the management dashboard.

    Window rules (fund-controls module): active through June (month 6, the FY
    closing month), and on ANY later date while the fiscal year that has
    already ended still has no report. Earlier in the FY (Jul-May) with a
    report filed, or Jan-May with the previous FY reported, it is silent."""
    if today.month == 6:
        fiscal_year = fiscal_year_for(today)  # the FY closing this June 30
        return {"fiscal_year": fiscal_year, "reminder_window_active": True}
    # After this year's June 30 the "just ended" FY is the one that closed on
    # it; before that (Jan-May) it is the previous one.
    cutoff = date(today.year, 6, 30)
    just_ended = fiscal_year_for(cutoff if today > cutoff else date(today.year - 1, 6, 30))
    return {
        "fiscal_year": just_ended,
        "reminder_window_active": not report_exists,
    }


# --- Module 6 — গঠনতন্ত্র সংশোধনী (amendments) --------------------------------

AMENDMENT_STATUSES: tuple[str, ...] = (
    "draft",       # খসড়া (admin-created, not yet submitted)
    "submitted",   # জমা দেওয়া হয়েছে
    "scheduled",   # সভায় উত্থাপনের জন্য নির্ধারিত
    "adopted",     # গৃহীত
    "rejected",    # বাতিল
    "withdrawn",   # প্রস্তাবক প্রত্যাহার করেছেন
)
MAJORITY_SIMPLE = "simple"
MAJORITY_FOUR_FIFTHS = "four_fifths"
MAJORITY_TYPES: tuple[str, ...] = (MAJORITY_SIMPLE, MAJORITY_FOUR_FIFTHS)

# Dissolution (বিলুপ্তি) proposals may be created and voted on, but the system
# never executes a dissolution: the recorded result only feeds the manual,
# legally-advised process. This notice is returned wherever the restriction
# applies (creation, adoption) so the frontend never hardcodes it.
DISSOLUTION_NOTICE_BN = (
    "বিলুপ্তি প্রক্রিয়া আইনগত পরামর্শে ম্যানুয়ালি সম্পন্ন হবে; "
    "এই সিস্টেমে স্বয়ংক্রিয় বিলুপ্তি হয় না"
)


def simple_majority_met(votes_for: int, votes_against: int, votes_abstain: int) -> bool:
    """গঠনতন্ত্রের সাধারণ সংখ্যাগরিষ্ঠতা: votes_for > votes_against AND
    votes_for >= floor(total/2) + 1, where total counts every vote cast
    (for + against + abstain)."""
    total = votes_for + votes_against + votes_abstain
    return votes_for > votes_against and votes_for >= total // 2 + 1


def four_fifths_majority_met(votes_for: int, votes_against: int) -> bool:
    """চার-পঞ্চমাংশ: votes_for >= ceil(0.8 × (for + against)). Abstentions do
    not count towards the denominator."""
    total = votes_for + votes_against
    return votes_for >= math.ceil(0.8 * total)


def majority_met(majority: str, votes_for: int, votes_against: int, votes_abstain: int) -> bool:
    if majority == MAJORITY_FOUR_FIFTHS:
        return four_fifths_majority_met(votes_for, votes_against)
    if majority == MAJORITY_SIMPLE:
        return simple_majority_met(votes_for, votes_against, votes_abstain)
    raise ValueError(f"Unknown majority type: {majority!r}")


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
        # Module 4/6/7 vocabularies the frontend renders without hardcoding.
        "expense_two_person_threshold_default": DEFAULT_EXPENSE_TWO_PERSON_THRESHOLD,
        "welfare_request_types": list(WELFARE_REQUEST_TYPES),
        "asset_conditions": list(ASSET_CONDITIONS),
        "welfare_activity_types": list(WELFARE_ACTIVITY_TYPES),
        "dissolution_notice_bn": DISSOLUTION_NOTICE_BN,
    }
