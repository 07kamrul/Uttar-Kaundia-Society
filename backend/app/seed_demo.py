"""FAKE-DATA-ONLY seed for STAGING screenshots and usability testing.

Never run this against production. Every record is obviously fake: emails end
in @demo.invalid, mobiles are 0170000xxxx, NIDs start with 99999 and names are
prefixed "ডেমো". The demo login password comes from DEMO_PASSWORD (never
hardcoded). The seed is idempotent (a second run is a no-op) and never
updates or deletes existing rows.

Run with:
    DEMO_PASSWORD=... python -m app.seed_demo --confirm-staging
"""
import argparse
import asyncio
import os
from collections.abc import Mapping, Sequence
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.admin import AdminRole, AdminUser
from app.models.complaint import Complaint
from app.models.config_list_item import ConfigListItem
from app.models.event import Event
from app.models.fee_payment import FeePayment
from app.models.installment import Installment, InstallmentStatus
from app.models.installment_payment import (
    PAYMENT_STATUS_APPROVED,
    PAYMENT_STATUS_PENDING,
    InstallmentPayment,
)
from app.models.member import Member, MemberStatus
from app.models.member_id_sequence import MemberIdSequence
from app.models.nominee import Nominee
from app.models.notice import Notice
from app.models.picnic_payment import PicnicPayment
from app.models.property import CoOwner, Property
from app.models.rbac import Role
from app.models.credential import MemberCredential
from app.models.society_cost import (
    PAYMENT_SOURCE_MEMBER_BILLED,
    SHARE_PAID,
    SHARE_UNPAID,
    SPLIT_METHOD_EQUAL,
    CostSplit,
    CostSplitShare,
    SocietyCost,
)

DEMO_EMAIL_DOMAIN = "@demo.invalid"
ALLOWED_ENVS = frozenset({"staging", "development", "dev", "local", "test", "testing"})
MIN_PASSWORD_LEN = 8
MEMBER_ID_PREFIX = "UKAMKS-"
MONTHLY_AMOUNT = Decimal("100.00")
DEMO_MEMBER_USERNAMES = ("demo_member1", "demo_member2")  # the two approved members

ADMINS = (
    ("demo-ec@demo.invalid", "ডেমো কার্যনির্বাহী সদস্য", AdminRole.EXECUTIVE_COMMITTEE),
    ("demo-administrator@demo.invalid", "ডেমো প্রশাসক", AdminRole.ADMINISTRATOR),
)


def _username(idx: int) -> str:
    return f"demo_member{idx}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _month_back(today: date, back: int) -> tuple[int, int]:
    index = today.year * 12 + (today.month - 1) - back
    return index // 12, index % 12 + 1


def check_environment(app_env: str) -> None:
    if app_env.strip().lower() not in ALLOWED_ENVS:
        raise SystemExit(
            f"Refusing to seed demo data: APP_ENV={app_env!r} is not one of "
            f"{sorted(ALLOWED_ENVS)}. This script is for staging/dev only."
        )


def check_password(password: str | None) -> str:
    if not password:
        raise SystemExit("Refusing to seed demo data: set the DEMO_PASSWORD environment variable.")
    if len(password) < MIN_PASSWORD_LEN:
        raise SystemExit(f"DEMO_PASSWORD must be at least {MIN_PASSWORD_LEN} characters.")
    return password


async def _count_demo_members(db: AsyncSession) -> int:
    stmt = select(func.count(Member.id)).where(Member.email.like(f"%{DEMO_EMAIL_DOMAIN}"))
    return await db.scalar(stmt) or 0


async def _count_real_members(db: AsyncSession) -> int:
    stmt = select(func.count(Member.id)).where(~Member.email.like(f"%{DEMO_EMAIL_DOMAIN}"))
    return await db.scalar(stmt) or 0


async def _next_member_id(db: AsyncSession) -> str:
    seq = (await db.execute(select(MemberIdSequence).where(MemberIdSequence.id == 1))).scalar_one_or_none()
    if seq is None:
        seq = MemberIdSequence(id=1, value=0)
        db.add(seq)
        await db.flush()
    seq.value += 1
    return f"{MEMBER_ID_PREFIX}{seq.value}"


async def _create_admins(db: AsyncSession, password_hash: str) -> dict[AdminRole, AdminUser]:
    admins: dict[AdminRole, AdminUser] = {}
    for email, name, role in ADMINS:
        role_row = (await db.execute(select(Role).where(Role.name == role.value))).scalar_one_or_none()
        admin = AdminUser(
            email=email, name=name, password_hash=password_hash, role=role,
            role_id=role_row.id if role_row is not None else None,
        )
        db.add(admin)
        admins[role] = admin
    await db.flush()
    return admins


def _build_member(idx: int, name: str, status: MemberStatus, **extra) -> Member:
    joint = extra.pop("joint", False)
    return Member(
        status=status,
        full_name=f"ডেমো {name}",
        father_or_husband="ডেমো পিতা",
        mother="ডেমো মাতা",
        dob="1980-01-15",
        nationality="বাংলাদেশী",
        occupation="ব্যবসায়ী",
        nid=f"99999{idx:08d}",
        mobile=f"0170000{idx:04d}",
        gender="পুরুষ" if idx % 2 else "মহিলা",
        email=f"demo-member{idx}{DEMO_EMAIL_DOMAIN}",
        permanent_district="গাজীপুর",
        permanent_division="ঢাকা",
        current_house=f"ডেমো বাড়ি {idx}",
        current_district="গাজীপুর",
        current_division="ঢাকা",
        urgent_contact_name="ডেমো জরুরি যোগাযোগ",
        urgent_contact_relation="ভাই",
        urgent_contact_mobile=f"0170001{idx:04d}",
        admission_fee="500",
        subscription=str(MONTHLY_AMOUNT),
        receipt_no=f"DEMO-RCPT-{idx:03d}",
        payment_method="Cash",
        submission_date=date.today().isoformat(),
        properties=[_build_property(idx, joint=joint)],
        nominees=[Nominee(
            name="ডেমো নমিনি", relation="পুত্র", mobile=f"0170002{idx:04d}", address="ডেমো ঠিকানা"
        )],
        **extra,
    )


def _build_property(idx: int, *, joint: bool) -> Property:
    prop = Property(
        property_type=["কৃষি জমি"], khatian_no=f"{100 + idx}", dag_no_cs=f"{4000 + idx}",
        dag_no_rs=f"{6000 + idx}", land_quantity=f"{10 + idx}", my_share_quantity=f"{5 + idx}",
        ownership="যৌথ" if joint else "একক", joint_owner_count=2 if joint else None,
    )
    if joint:
        prop.co_owners = [CoOwner(owner_name="ডেমো সহ-মালিক", owner_phone=f"0170003{idx:04d}")]
    return prop


async def _create_members(db: AsyncSession, admins: dict[AdminRole, AdminUser], password_hash: str):
    reviewer = admins[AdminRole.EXECUTIVE_COMMITTEE].id
    now = _now()
    specs = (
        (1, "রহিম উদ্দিন", MemberStatus.APPROVED, {"member_class": "founder", "joint": True,
            "created_at": now - timedelta(days=730)}),
        (2, "করিম মিয়া", MemberStatus.APPROVED, {"member_class": "general"}),
        (3, "সালমা বেগম", MemberStatus.PENDING, {}),
        (4, "জাহিদ হাসান", MemberStatus.PENDING, {}),
        (5, "নাসির আহমেদ", MemberStatus.REJECTED, {
            "rejection_reason": "ডেমো: রশিদ অস্পষ্ট, পুনরায় জমা দিন", "reviewed_by": reviewer,
            "reviewed_at": now}),
    )
    members: list[Member] = []
    for idx, name, status, extra in specs:
        member = _build_member(idx, name, status, **extra)
        if status == MemberStatus.APPROVED:
            member.member_id = await _next_member_id(db)
            member.reviewed_by, member.reviewed_at = reviewer, now
            member.credential = MemberCredential(
                username=_username(idx), password_hash=password_hash, must_change_password=False
            )
        db.add(member)
        members.append(member)
    await db.flush()
    return members


def _make_installments(member: Member, total: int, paid: int) -> list[Installment]:
    today = date.today()
    rows = []
    for back in range(total - 1, -1, -1):
        year, month = _month_back(today, back)
        is_paid = (total - 1 - back) < paid
        rows.append(Installment(
            member_id=member.id, year=year, month=month, amount=MONTHLY_AMOUNT,
            status=InstallmentStatus.PAID if is_paid else InstallmentStatus.DUE,
            paid_at=_now() if is_paid else None,
        ))
    return rows


async def _create_installments(db: AsyncSession, members: list[Member], admins) -> int:
    older, newer = members[0], members[1]
    older_rows = _make_installments(older, total=12, paid=9)
    newer_rows = _make_installments(newer, total=6, paid=3)
    db.add_all(older_rows + newer_rows)
    await db.flush()
    reviewer = admins[AdminRole.EXECUTIVE_COMMITTEE].id
    db.add_all([
        InstallmentPayment(
            member_id=older.id, method="bkash", transaction_ref="DEMO-TXN-0001", amount=MONTHLY_AMOUNT,
            paid_on=date.today(), status=PAYMENT_STATUS_APPROVED, reviewed_by=reviewer, reviewed_at=_now(),
            installments=[older_rows[8]], note="ডেমো অনুমোদিত পেমেন্ট",
        ),
        InstallmentPayment(
            member_id=newer.id, method="nagad", transaction_ref="DEMO-TXN-0002", amount=MONTHLY_AMOUNT,
            paid_on=date.today(), status=PAYMENT_STATUS_PENDING, installments=[newer_rows[3]],
            sender_account="01700000002", note="ডেমো যাচাইয়ের অপেক্ষায়",
        ),
    ])
    return len(older_rows) + len(newer_rows)


def _create_other_fees(db: AsyncSession, members: list[Member]) -> None:
    older, newer = members[0], members[1]
    today = date.today()
    db.add_all([
        PicnicPayment(
            member_id=older.id, head_price=500, additional_price=300, additional_count=2, total=1100,
            additional_heads=[{"name": "ডেমো অতিথি ১", "relation": "স্ত্রী"},
                              {"name": "ডেমো অতিথি ২", "relation": "পুত্র"}],
            payment_date=today, receipt_no="DEMO-PICNIC-001", payment_method="Cash",
        ),
        FeePayment(member_id=older.id, fee_type="picnic", amount=1100, payment_date=today,
                   receipt_no="DEMO-FEE-001", payment_method="Cash", note="ডেমো পিকনিক ফি"),
        FeePayment(member_id=newer.id, fee_type="development", amount=2000, payment_date=today,
                   receipt_no="DEMO-FEE-002", payment_method="bkash", note="ডেমো উন্নয়ন ফি"),
    ])


async def _create_cost_share(db: AsyncSession, members: list[Member], admins) -> None:
    admin_id = admins[AdminRole.EXECUTIVE_COMMITTEE].id
    older, newer = members[0], members[1]
    cost = SocietyCost(
        title="ডেমো: মসজিদ সংস্কার খরচ", description="ডেমো খরচের বিবরণ", total_amount=Decimal("4000.00"),
        incurred_date=date.today(), payment_source=PAYMENT_SOURCE_MEMBER_BILLED, created_by=admin_id,
    )
    cost.split = CostSplit(split_method=SPLIT_METHOD_EQUAL, created_by=admin_id, shares=[
        CostSplitShare(member_id=older.id, amount_due=Decimal("2000.00"), amount_paid=Decimal("2000.00"),
                       status=SHARE_PAID, paid_at=_now(), receipt_no="DEMO-COST-001"),
        CostSplitShare(member_id=newer.id, amount_due=Decimal("2000.00"), status=SHARE_UNPAID),
    ])
    db.add(cost)


async def _category_id(db: AsyncSession, category: str) -> int | None:
    stmt = select(ConfigListItem.id).where(ConfigListItem.category == category).order_by(ConfigListItem.id)
    return (await db.execute(stmt.limit(1))).scalar_one_or_none()


async def _create_content(db: AsyncSession, admins, members: list[Member]) -> None:
    admin_id = admins[AdminRole.EXECUTIVE_COMMITTEE].id
    notice_cat = await _category_id(db, "notice_category")
    event_cat = await _category_id(db, "event_category")
    now = _now()
    db.add_all([
        Notice(title=f"ডেমো নোটিশ {n}", body=f"এটি একটি ডেমো নোটিশ ({n})। সম্পূর্ণ কাল্পনিক তথ্য।",
               category_id=notice_cat, is_published=True, publish_at=now - timedelta(days=n),
               created_by=admin_id)
        for n in (1, 2, 3)
    ])
    db.add_all([
        Event(title=f"ডেমো অনুষ্ঠান {n}", description="ডেমো অনুষ্ঠানের বিবরণ", location="ডেমো মিলনায়তন",
              category_id=event_cat, start_at=now + timedelta(days=7 * n), is_published=True,
              created_by=admin_id)
        for n in (1, 2)
    ])
    year = date.today().year
    prefix = f"KRMF-AB-{year}-"
    count = await db.scalar(select(func.count(Complaint.id)).where(Complaint.complaint_no.like(f"{prefix}%")))
    db.add(Complaint(
        complaint_no=f"{prefix}{(count or 0) + 1:04d}", complainant_member_id=members[1].id,
        category="general", subject="ডেমো অভিযোগ", details="এটি একটি ডেমো অভিযোগ। কাল্পনিক তথ্য।",
        sla_ack_due=date.today() + timedelta(days=3), sla_update_due=date.today() + timedelta(days=21),
    ))


async def seed_demo(db: AsyncSession, *, allow_existing_data: bool, password: str) -> dict[str, int]:
    """Create the demo dataset in one transaction. Returns created counts, or
    an empty dict when demo data already exists (no-op)."""
    password = check_password(password)
    if await _count_demo_members(db) > 0:
        print("Demo data already exists; nothing to do.")
        return {}
    if await _count_real_members(db) > 0 and not allow_existing_data:
        raise SystemExit(
            "Refusing to seed: the database already contains non-demo members. "
            "Pass --allow-existing-data if you really want demo rows added alongside them."
        )
    password_hash = hash_password(password)
    try:
        admins = await _create_admins(db, password_hash)
        members = await _create_members(db, admins, password_hash)
        installments = await _create_installments(db, members, admins)
        _create_other_fees(db, members)
        await _create_cost_share(db, members, admins)
        await _create_content(db, admins, members)
        await db.flush()
        counts = {"admins": len(admins), "members": len(members), "installments": installments}
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    print("Demo admin logins: " + ", ".join(email for email, _, _ in ADMINS))
    print("Demo member logins (username): " + ", ".join(DEMO_MEMBER_USERNAMES))
    return counts


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed FAKE demo data (staging only).")
    parser.add_argument("--confirm-staging", action="store_true", help="required acknowledgement")
    parser.add_argument("--allow-existing-data", action="store_true",
                        help="allow seeding when non-demo members already exist")
    return parser.parse_args(argv)


async def _run(allow_existing_data: bool, password: str) -> None:
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        await seed_demo(db, allow_existing_data=allow_existing_data, password=password)


def main(argv: Sequence[str] | None = None, environ: Mapping[str, str] | None = None) -> None:
    args = _parse_args(argv)
    if not args.confirm_staging:
        raise SystemExit("Refusing to seed demo data: pass --confirm-staging to acknowledge this is NOT production.")
    check_environment(get_settings().app_env)
    password = check_password((environ if environ is not None else os.environ).get("DEMO_PASSWORD"))
    asyncio.run(_run(args.allow_existing_data, password))


if __name__ == "__main__":
    main()
