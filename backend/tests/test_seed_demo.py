"""Guards and behaviour of the staging-only demo seed (app/seed_demo.py)."""
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select

from app import seed_demo as sd
from app.core.security import verify_password
from app.models.admin import AdminRole, AdminUser
from app.models.complaint import Complaint
from app.models.credential import MemberCredential
from app.models.event import Event
from app.models.fee_payment import FeePayment
from app.models.installment import Installment, InstallmentStatus
from app.models.installment_payment import PAYMENT_STATUS_PENDING, InstallmentPayment
from app.models.member import Member, MemberStatus
from app.models.notice import Notice
from app.models.picnic_payment import PicnicPayment
from app.models.property import Property
from app.models.society_cost import CostSplitShare

PASSWORD = "demo-pass-12345"  # test-only value, never used outside the in-memory test DB


def _use_env(monkeypatch, app_env: str) -> None:
    monkeypatch.setattr(sd, "get_settings", lambda: SimpleNamespace(app_env=app_env))


async def _count(db, model) -> int:
    return await db.scalar(select(func.count()).select_from(model))


def _real_member(**overrides) -> Member:
    fields = dict(
        status=MemberStatus.APPROVED, full_name="Real Person", father_or_husband="F", mother="M",
        dob="1990-01-01", nationality="BD", occupation="x", nid="1234567890", mobile="01811111111",
        gender="M", email="real@example.com", admission_fee="500", subscription="100",
        receipt_no="R1", payment_method="Cash", submission_date="2026-01-01",
    )
    return Member(**{**fields, **overrides})


# --- CLI guards (these never reach the database) -------------------------------------------


def test_refuses_without_confirm_flag(monkeypatch):
    _use_env(monkeypatch, "staging")
    with pytest.raises(SystemExit, match="--confirm-staging"):
        sd.main([], environ={"DEMO_PASSWORD": PASSWORD})


@pytest.mark.parametrize("env", ["production", "prod", "", "something-else"])
def test_refuses_non_allowlisted_environment(monkeypatch, env):
    _use_env(monkeypatch, env)
    with pytest.raises(SystemExit, match="Refusing to seed demo data"):
        sd.main(["--confirm-staging"], environ={"DEMO_PASSWORD": PASSWORD})


@pytest.mark.parametrize("password", [None, "", "short"])
def test_refuses_missing_or_short_password(monkeypatch, password):
    _use_env(monkeypatch, "staging")
    environ = {} if password is None else {"DEMO_PASSWORD": password}
    with pytest.raises(SystemExit, match="DEMO_PASSWORD"):
        sd.main(["--confirm-staging"], environ=environ)


@pytest.mark.parametrize("env", ["staging", "Staging", "development", "dev", "local", "test", "testing"])
def test_allowlisted_environments_pass_check(env):
    sd.check_environment(env)


# --- seed_demo on the fixture session ------------------------------------------------------


async def test_seed_demo_refuses_empty_password(db_session):
    with pytest.raises(SystemExit, match="DEMO_PASSWORD"):
        await sd.seed_demo(db_session, allow_existing_data=False, password="")
    assert await _count(db_session, Member) == 0


async def test_existing_non_demo_member_blocks_without_flag(db_session):
    db_session.add(_real_member())
    await db_session.commit()

    with pytest.raises(SystemExit, match="non-demo members"):
        await sd.seed_demo(db_session, allow_existing_data=False, password=PASSWORD)

    assert await _count(db_session, Member) == 1
    assert await _count(db_session, AdminUser) == 0


async def test_allow_existing_data_adds_demo_without_touching_real_rows(db_session):
    db_session.add(_real_member())
    await db_session.commit()

    result = await sd.seed_demo(db_session, allow_existing_data=True, password=PASSWORD)

    assert result["members"] == 5
    real = (await db_session.execute(select(Member).where(Member.email == "real@example.com"))).scalar_one()
    assert (real.full_name, real.status, real.member_id) == ("Real Person", MemberStatus.APPROVED, None)
    assert await _count(db_session, Member) == 6


async def test_happy_path_creates_expected_records(db_session):
    result = await sd.seed_demo(db_session, allow_existing_data=False, password=PASSWORD)

    assert result == {"admins": 2, "members": 5, "installments": 18}
    roles = set((await db_session.execute(select(AdminUser.role))).scalars())
    assert roles == {AdminRole.EXECUTIVE_COMMITTEE, AdminRole.ADMINISTRATOR}
    statuses = sorted(s.value for s in (await db_session.execute(select(Member.status))).scalars())
    assert statuses == ["approved", "approved", "pending", "pending", "rejected"]
    assert await _count(db_session, MemberCredential) == 2
    assert await _count(db_session, Notice) == 3
    assert await _count(db_session, Event) == 2
    assert await _count(db_session, Complaint) == 1
    assert await _count(db_session, PicnicPayment) == 1
    assert await _count(db_session, FeePayment) == 2
    assert await _count(db_session, CostSplitShare) == 2
    assert await _count(db_session, Property) == 5


async def test_demo_data_is_obviously_fake(db_session):
    await sd.seed_demo(db_session, allow_existing_data=False, password=PASSWORD)

    members = (await db_session.execute(select(Member))).scalars().all()
    for member in members:
        assert member.email.endswith("@demo.invalid")
        assert member.mobile.startswith("0170000")
        assert member.nid.startswith("99999")
        assert member.full_name.startswith("ডেমো")
    admin_emails = (await db_session.execute(select(AdminUser.email))).scalars().all()
    assert all(email.endswith("@demo.invalid") for email in admin_emails)


async def test_demo_logins_use_supplied_password_and_ids_are_assigned(db_session):
    await sd.seed_demo(db_session, allow_existing_data=False, password=PASSWORD)

    creds = (await db_session.execute(select(MemberCredential))).scalars().all()
    assert all(verify_password(PASSWORD, c.password_hash) for c in creds)
    approved = (
        await db_session.execute(select(Member).where(Member.status == MemberStatus.APPROVED))
    ).scalars().all()
    assert sorted(m.member_id for m in approved) == ["UKAMKS-1", "UKAMKS-2"]
    assert {m.member_class for m in approved} == {"founder", "general"}


async def test_joint_ownership_and_installment_states(db_session):
    await sd.seed_demo(db_session, allow_existing_data=False, password=PASSWORD)

    joint = (await db_session.execute(select(Property).where(Property.ownership == "যৌথ"))).scalars().all()
    assert len(joint) == 1 and joint[0].joint_owner_count == 2
    paid = await db_session.scalar(
        select(func.count()).select_from(Installment).where(Installment.status == InstallmentStatus.PAID)
    )
    due = await db_session.scalar(
        select(func.count()).select_from(Installment).where(Installment.status == InstallmentStatus.DUE)
    )
    assert (paid, due) == (12, 6)
    pending = (
        await db_session.execute(
            select(InstallmentPayment).where(InstallmentPayment.status == PAYMENT_STATUS_PENDING)
        )
    ).scalars().all()
    assert len(pending) == 1 and len(pending[0].installments) == 1


async def test_second_run_is_a_noop(db_session, capsys):
    await sd.seed_demo(db_session, allow_existing_data=False, password=PASSWORD)
    before = {m: await _count(db_session, m) for m in (Member, AdminUser, Installment, Notice, Complaint)}

    result = await sd.seed_demo(db_session, allow_existing_data=False, password=PASSWORD)

    assert result == {}
    assert "already exists" in capsys.readouterr().out
    after = {m: await _count(db_session, m) for m in before}
    assert after == before


async def test_prints_login_identifiers_but_never_the_password(db_session, capsys):
    await sd.seed_demo(db_session, allow_existing_data=False, password=PASSWORD)

    out = capsys.readouterr().out
    assert "demo_member1" in out and "demo-ec@demo.invalid" in out
    assert PASSWORD not in out


def test_source_has_no_delete_statements():
    source = Path(sd.__file__).read_text(encoding="utf-8")
    assert "delete(" not in source.lower()
    assert "DELETE" not in source
