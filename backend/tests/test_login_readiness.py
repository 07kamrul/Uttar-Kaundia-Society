"""Batch 6: `GET /api/admin/login-readiness` and the read-only CLI
`scripts/report_duplicate_mobiles.py` - the go/no-go check before turning
`login_by_phone` on."""

import pytest
from httpx import AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import create_access_token
from app.models.credential import MemberCredential
from app.models.feature_flag import FeatureFlag
from app.models.member import Member, MemberStatus
from app.models.phone_fix import PhoneFixQueue
from app.models.rbac import Permission, UserPermissionOverride
from app.services.login_identity import duplicate_groups

pytestmark = pytest.mark.asyncio

URL = "/api/admin/login-readiness"
_SEQ = {"n": 0}


async def _member(
    db: AsyncSession,
    *,
    mobile: str,
    email: str | None = None,
    status: MemberStatus = MemberStatus.APPROVED,
    with_login: bool = True,
) -> Member:
    _SEQ["n"] += 1
    n = _SEQ["n"]
    member = Member(
        member_id=f"UKAMKS-{400 + n}",
        status=status,
        full_name=f"Readiness {n}",
        father_or_husband="F",
        mother="M",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="Job",
        nid=f"80000000{n:02d}",
        mobile=mobile,
        gender="male",
        email=email or f"ready{n}@example.com",
        admission_fee="500",
        subscription="100",
        receipt_no=f"R-{n}",
        payment_method="Cash",
        submission_date="2026-01-01",
    )
    db.add(member)
    await db.flush()
    if with_login:
        db.add(MemberCredential(member_id=member.id, username=f"ukamks-{400 + n}", password_hash="x"))
    await db.commit()
    await db.refresh(member)
    return member


def _admin(admin_user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(admin_user.id), 'executive_committee')}"}


async def _get(client: AsyncClient, admin_user) -> dict:
    response = await client.get(URL, headers=_admin(admin_user))
    assert response.status_code == 200, response.text
    return response.json()


# --- service ---------------------------------------------------------------


async def test_formats_of_one_number_collide(db_session: AsyncSession) -> None:
    a = await _member(db_session, mobile="+8801712345678")
    b = await _member(db_session, mobile="01712345678")
    c = await _member(db_session, mobile="8801712345678", with_login=False)
    await _member(db_session, mobile="+8801812345678")

    report = await duplicate_groups(db_session)

    assert [g.key for g in report.mobile_groups] == ["+8801712345678"]
    group = report.mobile_groups[0]
    assert [m.id for m in group.members] == [a.id, b.id, c.id]
    assert [m.has_login for m in group.members] == [True, True, False]
    assert group.blocking is True
    assert report.members_with_login == 3


async def test_group_with_a_single_login_is_informational_only(db_session: AsyncSession) -> None:
    await _member(db_session, mobile="+8801712345678")
    await _member(db_session, mobile="01712345678", with_login=False)

    report = await duplicate_groups(db_session)

    assert len(report.mobile_groups) == 1
    assert report.mobile_groups[0].blocking is False
    assert report.blocking_mobile_groups == ()


async def test_rejected_members_are_left_out(db_session: AsyncSession) -> None:
    await _member(db_session, mobile="+8801712345678")
    await _member(db_session, mobile="01712345678", status=MemberStatus.REJECTED)

    report = await duplicate_groups(db_session)

    assert report.mobile_groups == ()
    assert report.members_with_login == 1


async def test_unparseable_mobiles_are_listed(db_session: AsyncSession) -> None:
    bad = await _member(db_session, mobile="01-7")

    report = await duplicate_groups(db_session)

    assert [(u.id, u.member_id, u.raw) for u in report.unparseable_mobiles] == [(bad.id, bad.member_id, "01-7")]
    assert report.mobile_groups == ()


async def test_email_groups_ignore_case_and_spacing(db_session: AsyncSession) -> None:
    await _member(db_session, mobile="+8801712345671", email="family@example.com")
    await _member(db_session, mobile="+8801712345672", email=" Family@Example.com")

    report = await duplicate_groups(db_session)

    assert [g.key for g in report.email_groups] == ["family@example.com"]
    assert report.email_groups[0].blocking is True


# --- endpoint --------------------------------------------------------------


async def test_endpoint_shape_and_counts(client: AsyncClient, db_session: AsyncSession, admin_user) -> None:
    a = await _member(db_session, mobile="+8801712345678")
    await _member(db_session, mobile="01712345678")
    bad = await _member(db_session, mobile="01-7", with_login=False)
    db_session.add_all(
        [
            PhoneFixQueue(entity_type="member", entity_id=bad.id, field="mobile", raw_value="01-7"),
            PhoneFixQueue(entity_type="member", entity_id=a.id, field="mobile", raw_value="x"),
        ]
    )
    await db_session.commit()
    fix = (await db_session.get(PhoneFixQueue, 2))
    from datetime import datetime, timezone

    fix.resolved_at = datetime.now(timezone.utc)
    await db_session.commit()

    body = await _get(client, admin_user)

    assert set(body) == {
        "login_by_phone_enabled",
        "members_with_login",
        "duplicate_mobile_groups",
        "duplicate_group_count",
        "blocking_group_count",
        "unparseable_mobiles",
        "open_phone_fixes",
        "duplicate_email_groups",
    }
    assert body["login_by_phone_enabled"] is False
    assert body["members_with_login"] == 2
    assert body["duplicate_group_count"] == 1
    assert body["blocking_group_count"] == 1
    group = body["duplicate_mobile_groups"][0]
    assert group["mobile"] == "+8801712345678"
    assert group["blocking"] is True
    assert set(group["members"][0]) == {"id", "member_id", "full_name", "status", "has_login"}
    assert group["members"][0]["status"] == "approved"
    assert body["unparseable_mobiles"] == [{"id": bad.id, "member_id": bad.member_id, "raw": "01-7"}]
    assert body["open_phone_fixes"] == 1
    assert body["duplicate_email_groups"] == []


async def test_endpoint_reports_the_flag(client: AsyncClient, db_session: AsyncSession, admin_user) -> None:
    db_session.add(FeatureFlag(key="login_by_phone", enabled=True))
    await db_session.commit()

    assert (await _get(client, admin_user))["login_by_phone_enabled"] is True


async def test_endpoint_requires_manage_system_config(
    client: AsyncClient, db_session: AsyncSession, admin_user
) -> None:
    permission = Permission(key="manage_system_config", resource="system", action="manage")
    db_session.add(permission)
    await db_session.commit()
    db_session.add(UserPermissionOverride(user_id=admin_user.id, permission_id=permission.id, granted=False))
    await db_session.commit()

    assert (await client.get(URL, headers=_admin(admin_user))).status_code == 403
    assert (await client.get(URL)).status_code in (401, 403)


async def test_members_cannot_read_the_report(client: AsyncClient, db_session: AsyncSession) -> None:
    member = await _member(db_session, mobile="+8801712345678")
    headers = {"Authorization": f"Bearer {create_access_token(str(member.id), 'member')}"}

    assert (await client.get(URL, headers=headers)).status_code in (401, 403)


# --- CLI -------------------------------------------------------------------


def _factory(db_session: AsyncSession) -> async_sessionmaker:
    return async_sessionmaker(bind=db_session.bind, expire_on_commit=False)


async def test_cli_exits_1_and_prints_blocking_groups(db_session: AsyncSession, capsys) -> None:
    from scripts.report_duplicate_mobiles import run

    a = await _member(db_session, mobile="+8801712345678")
    await _member(db_session, mobile="01712345678")

    code = await run(_factory(db_session))

    out = capsys.readouterr().out
    assert code == 1
    assert "+8801712345678" in out
    assert a.member_id in out


async def test_cli_exits_0_when_nothing_blocks(db_session: AsyncSession, capsys) -> None:
    from scripts.report_duplicate_mobiles import run

    await _member(db_session, mobile="+8801712345678")
    await _member(db_session, mobile="01712345678", with_login=False)  # informational only

    code = await run(_factory(db_session))

    assert code == 0
    assert "+8801712345678" in capsys.readouterr().out


async def test_cli_only_issues_selects(db_session: AsyncSession) -> None:
    from scripts.report_duplicate_mobiles import run

    await _member(db_session, mobile="+8801712345678")
    await _member(db_session, mobile="01712345678")
    statements: list[str] = []

    def record(_conn, _cursor, statement, *_rest) -> None:
        statements.append(statement.lstrip().upper())

    engine = db_session.bind.sync_engine
    event.listen(engine, "before_cursor_execute", record)
    try:
        await run(_factory(db_session))
    finally:
        event.remove(engine, "before_cursor_execute", record)

    assert statements, "the report should have queried the database"
    assert all(s.startswith("SELECT") for s in statements), statements
