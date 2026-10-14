"""Batch 5: `GET /api/admin/today` - the COUNT-only "today's work" summary.

Every section is null unless the caller holds its permission; the rules for each
count (complaint due-soon vs overdue, expiring vs expired terms, needs_dag, ...)
are pinned here against a fixed clock."""

from datetime import date, datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.admin import AdminRole, AdminUser
from app.models.committee_election import CommitteeTerm
from app.models.complaint import Complaint
from app.models.cost_share_payment import CostSharePayment
from app.models.installment_payment import InstallmentPayment
from app.models.member import Member, MemberStatus
from app.models.membership_appeal import MembershipApplication
from app.models.phone_fix import PhoneFixQueue
from app.models.plot_boundary import PlotBoundary
from app.models.property import Property
from app.models.property_change_request import (
    PropertyChangeAction,
    PropertyChangeRequest,
    PropertyChangeStatus,
)
from app.services.admin_today import COMMITTEE_WINDOW_DAYS, build_today
from app.core.permissions import PERMISSION_KEYS
from tests.test_finance_payment_permissions import _admin_with_permissions

pytestmark = pytest.mark.asyncio

URL = "/api/admin/today"
NOW = datetime(2026, 10, 13, 8, 0, tzinfo=timezone.utc)
_SEQ = {"n": 0}


# --- seed helpers ----------------------------------------------------------


async def _member(db: AsyncSession, status=MemberStatus.PENDING, properties=()) -> Member:
    _SEQ["n"] += 1
    n = _SEQ["n"]
    member = Member(
        status=status,
        full_name=f"Today {n}",
        father_or_husband="F",
        mother="M",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="Job",
        nid=f"70000000{n:02d}",
        mobile=f"+88017000{n:05d}",
        gender="male",
        email=f"today{n}@example.com",
        admission_fee="500",
        subscription="100",
        receipt_no=f"R-{n}",
        payment_method="Cash",
        submission_date="2026-01-01",
        properties=[Property(property_type=["জমি"], **p) for p in properties],
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


def _complaint(n: int, *, ack_due, update_due, status="submitted", acknowledged=False, updated=False) -> Complaint:
    return Complaint(
        complaint_no=f"C-{n}",
        complainant_member_id=1,
        category="other",
        subject="s",
        details="d",
        status=status,
        sla_ack_due=ack_due,
        sla_update_due=update_due,
        acknowledged_at=NOW if acknowledged else None,
        first_update_at=NOW if updated else None,
    )


def _term(post: str, end: date, *, caretaker=False, replaced_by=None) -> CommitteeTerm:
    return CommitteeTerm(
        post_key=post,
        term_start=date(2023, 1, 1),
        term_end=end,
        is_caretaker=caretaker,
        replaced_by_term_id=replaced_by,
    )


def _application(n: int, status: str) -> MembershipApplication:
    return MembershipApplication(
        application_no=f"APP-T{n}", full_name="A", father_name="F", mother_name="M", mobile="+8801712000000",
        email=f"a{n}@example.com", ownership_type="owner", status=status, sla_due_at=date(2026, 12, 1),
    )


def _installment_payment(n: int, status: str) -> InstallmentPayment:
    return InstallmentPayment(
        member_id=1, method="bKash", transaction_ref=f"TI{n:06d}", amount=100, paid_on=date(2026, 10, 1), status=status
    )


def _cost_share_payment(n: int, status: str) -> CostSharePayment:
    return CostSharePayment(
        member_id=1, share_id=n, method="bKash", transaction_ref=f"TC{n:06d}", amount=100,
        paid_on=date(2026, 10, 1), status=status,
    )


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


async def _seed_everything(db: AsyncSession) -> None:
    today = _utc_today()
    await _member(db, properties=[{"dag_no_cs": "", "dag_no_rs": None, "dag_unknown": True}])
    await _member(db, properties=[{"dag_no_cs": "1", "dag_no_rs": "2", "dag_unknown": False}])
    db.add_all(
        [
            _application(1, "received"), _application(2, "under_review"), _application(3, "approved"),
            _installment_payment(1, "pending"), _installment_payment(2, "pending"),
            _installment_payment(3, "approved"), _cost_share_payment(1, "pending"),
            _cost_share_payment(2, "rejected"),
            _complaint(1, ack_due=today - timedelta(days=1), update_due=today + timedelta(days=40)),
            _complaint(2, ack_due=today + timedelta(days=1), update_due=today + timedelta(days=40)),
            PropertyChangeRequest(
                member_id=1, action=PropertyChangeAction.ADD, payload={}, status=PropertyChangeStatus.PENDING
            ),
            PropertyChangeRequest(
                member_id=1, action=PropertyChangeAction.ADD, payload={}, status=PropertyChangeStatus.APPROVED
            ),
            PlotBoundary(property_id=1, member_id=1, geom={}, pending_version_id=99, is_deleted=False),
            _term("president", today - timedelta(days=12)),
            _term("treasurer", today + timedelta(days=19)),
            PhoneFixQueue(entity_type="member", entity_id=1, field="mobile", raw_value="x"),
            PhoneFixQueue(entity_type="member", entity_id=2, field="mobile", raw_value="y", resolved_at=NOW),
        ]
    )
    await db.commit()


def _super_admin_headers(admin: AdminUser) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(admin.id), 'super_admin')}"}


async def _super_admin(db: AsyncSession) -> AdminUser:
    admin = AdminUser(
        email="root@example.com", password_hash=hash_password("rootpass123"), name="Root", role=AdminRole.SUPER_ADMIN
    )
    db.add(admin)
    await db.commit()
    await db.refresh(admin)
    return admin


# --- endpoint --------------------------------------------------------------


async def test_super_admin_sees_every_section(client: AsyncClient, db_session: AsyncSession) -> None:
    admin = await _super_admin(db_session)
    await _seed_everything(db_session)

    response = await client.get(URL, headers=_super_admin_headers(admin))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body.pop("as_of").endswith("Z")
    assert body == {
        "applications": {"registrations_pending": 2, "membership_applications_open": 2, "total": 4},
        "needs_dag": 1,
        "payment_verifications": {"installment": 2, "cost_share": 1, "other_fee": 0, "total": 3},
        "complaints": {"open": 2, "due_soon": 1, "overdue": 1},
        "property_requests": {"pending": 1},
        "boundaries": {"pending": 1},
        "committee_terms": {"expiring_soon": 1, "expired": 1, "window_days": 60},
        "phone_fixes": {"open": 1},
    }


async def test_finance_only_admin_sees_only_payments(client: AsyncClient, db_session: AsyncSession) -> None:
    await _seed_everything(db_session)
    headers = await _admin_with_permissions(client, db_session, "treasurer@example.com", ("manage_finance",))

    response = await client.get(URL, headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["payment_verifications"] == {"installment": 2, "cost_share": 1, "other_fee": 0, "total": 3}
    for hidden in (
        "applications", "needs_dag", "complaints", "property_requests", "boundaries", "committee_terms",
        "phone_fixes",
    ):
        assert body[hidden] is None, hidden


async def test_applications_section_keeps_only_the_permitted_half(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _seed_everything(db_session)
    only_applications = await _admin_with_permissions(
        client, db_session, "apps@example.com", ("membership_application.manage",)
    )
    only_review = await _admin_with_permissions(client, db_session, "review@example.com", ("membership.review",))

    apps = (await client.get(URL, headers=only_applications)).json()
    review = (await client.get(URL, headers=only_review)).json()

    assert apps["applications"] == {"registrations_pending": None, "membership_applications_open": 2, "total": 2}
    assert apps["needs_dag"] is None
    assert review["applications"] == {"registrations_pending": 2, "membership_applications_open": None, "total": 2}
    assert review["needs_dag"] == 1


async def test_admin_without_any_dashboard_permission_gets_all_nulls(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_with_permissions(client, db_session, "none@example.com", ("report.view",))

    body = (await client.get(URL, headers=headers)).json()

    assert {k: v for k, v in body.items() if k != "as_of"} == {
        "applications": None, "needs_dag": None, "payment_verifications": None, "complaints": None,
        "property_requests": None, "boundaries": None, "committee_terms": None, "phone_fixes": None,
    }


async def test_requires_an_admin_account(client: AsyncClient, db_session: AsyncSession) -> None:
    member = await _member(db_session, MemberStatus.APPROVED)
    member_headers = {"Authorization": f"Bearer {create_access_token(str(member.id), 'member')}"}

    assert (await client.get(URL)).status_code in (401, 403)
    assert (await client.get(URL, headers=member_headers)).status_code in (401, 403)


async def test_not_cached_new_work_shows_up_immediately(client: AsyncClient, db_session: AsyncSession) -> None:
    admin = await _super_admin(db_session)
    headers = _super_admin_headers(admin)
    assert (await client.get(URL, headers=headers)).json()["phone_fixes"] == {"open": 0}

    db_session.add(PhoneFixQueue(entity_type="member", entity_id=1, field="mobile", raw_value="x"))
    await db_session.commit()

    assert (await client.get(URL, headers=headers)).json()["phone_fixes"] == {"open": 1}


async def test_query_count_stays_within_twelve_selects(client: AsyncClient, db_session: AsyncSession) -> None:
    admin = await _super_admin(db_session)
    await _seed_everything(db_session)
    statements: list[str] = []

    def record(_conn, _cursor, statement, *_rest) -> None:
        statements.append(statement.lstrip().upper())

    engine = db_session.bind.sync_engine
    event.listen(engine, "before_cursor_execute", record)
    try:
        response = await client.get(URL, headers=_super_admin_headers(admin))
    finally:
        event.remove(engine, "before_cursor_execute", record)

    assert response.status_code == 200
    assert len(statements) <= 12, statements
    assert all(s.startswith("SELECT") for s in statements), statements


# --- count rules (service, fixed clock) ------------------------------------


async def _today(db: AsyncSession, *keys: str) -> dict:
    return await build_today(db, set(keys) if keys else set(PERMISSION_KEYS), now=NOW)


async def test_complaint_due_soon_and_overdue_boundaries(db_session: AsyncSession) -> None:
    far = date(2026, 12, 31)
    db_session.add_all(
        [
            # ack deadline yesterday, not acknowledged -> overdue
            _complaint(1, ack_due=date(2026, 10, 12), update_due=far),
            # due today -> due soon, not overdue
            _complaint(2, ack_due=date(2026, 10, 13), update_due=far),
            # today + 3 (the window edge) -> due soon
            _complaint(3, ack_due=date(2026, 10, 16), update_due=far),
            # today + 4 -> neither
            _complaint(4, ack_due=date(2026, 10, 17), update_due=far),
            # acknowledged, but the first update is a day late -> overdue
            _complaint(5, ack_due=date(2026, 9, 1), update_due=date(2026, 10, 12), status="acknowledged", acknowledged=True),
            # both deadlines met -> neither
            _complaint(6, ack_due=date(2026, 9, 1), update_due=date(2026, 9, 2), status="investigating", acknowledged=True, updated=True),
            # closed complaints are not open work, however late
            _complaint(7, ack_due=date(2026, 9, 1), update_due=date(2026, 9, 2), status="resolved"),
            # acknowledged, first update due within the window -> due soon
            _complaint(8, ack_due=date(2026, 9, 1), update_due=date(2026, 10, 16), status="acknowledged", acknowledged=True),
            # both deadlines unmet: overdue wins over due soon and counts once
            _complaint(9, ack_due=date(2026, 10, 12), update_due=date(2026, 10, 14)),
        ]
    )
    await db_session.commit()

    result = await _today(db_session, "complaint.manage")

    assert result["complaints"] == {"open": 8, "due_soon": 3, "overdue": 3}


async def test_committee_terms_expiring_and_expired(db_session: AsyncSession) -> None:
    db_session.add_all(
        [
            _term("president", date(2026, 10, 12)),  # expired yesterday
            _term("treasurer", date(2026, 10, 13)),  # ends today: still active, expiring soon
            _term("secretary", date(2026, 12, 12)),  # today + 60: inside the window
            _term("joint_secretary", date(2026, 12, 13)),  # today + 61: outside
            _term("vice_president", date(2026, 1, 1), caretaker=True),  # caretakers never count
        ]
    )
    await db_session.commit()
    replaced = _term("publicity_secretary", date(2026, 1, 1))
    db_session.add(replaced)
    await db_session.commit()
    replacement = _term("publicity_secretary", date(2029, 1, 1))
    db_session.add(replacement)
    await db_session.commit()
    replaced.replaced_by_term_id = replacement.id  # replaced terms never count
    await db_session.commit()

    result = await _today(db_session, "committee_registry.manage")

    assert COMMITTEE_WINDOW_DAYS == 60
    assert result["committee_terms"] == {"expiring_soon": 2, "expired": 1, "window_days": 60}


async def test_needs_dag_counts_pending_members_once(db_session: AsyncSession) -> None:
    unknown = {"dag_no_cs": "", "dag_no_rs": None, "dag_unknown": True}
    known = {"dag_no_cs": "1", "dag_no_rs": "2", "dag_unknown": False}
    await _member(db_session, properties=[unknown])
    await _member(db_session, properties=[unknown, unknown])  # two properties, one member
    await _member(db_session, properties=[known])
    await _member(db_session, properties=[])
    await _member(db_session, MemberStatus.APPROVED, properties=[unknown])  # not a pending registration
    await _member(db_session, MemberStatus.REJECTED, properties=[unknown])

    result = await _today(db_session, "membership.review")

    assert result["needs_dag"] == 2
    assert result["applications"] == {"registrations_pending": 4, "membership_applications_open": None, "total": 4}


async def test_open_applications_are_received_and_under_review_only(db_session: AsyncSession) -> None:
    db_session.add_all(
        [_application(1, "received"), _application(2, "under_review"), _application(3, "approved"), _application(4, "rejected")]
    )
    await db_session.commit()

    result = await _today(db_session, "membership_application.manage")

    assert result["applications"] == {
        "registrations_pending": None, "membership_applications_open": 2, "total": 2,
    }


async def test_payment_phone_boundary_and_property_counts_ignore_finished_work(db_session: AsyncSession) -> None:
    db_session.add_all(
        [
            _installment_payment(1, "pending"), _installment_payment(2, "approved"), _installment_payment(3, "rejected"),
            _cost_share_payment(1, "pending"), _cost_share_payment(2, "pending"), _cost_share_payment(3, "approved"),
            PhoneFixQueue(entity_type="member", entity_id=1, field="mobile", raw_value="a"),
            PhoneFixQueue(entity_type="member", entity_id=2, field="mobile", raw_value="b", resolved_at=NOW),
            PlotBoundary(property_id=1, member_id=1, geom={}, pending_version_id=5, is_deleted=False),
            PlotBoundary(property_id=2, member_id=1, geom={}, pending_version_id=6, is_deleted=True),
            PlotBoundary(property_id=3, member_id=1, geom={}, pending_version_id=None, is_deleted=False),
            PropertyChangeRequest(member_id=1, action=PropertyChangeAction.EDIT, payload={}, status=PropertyChangeStatus.PENDING),
            PropertyChangeRequest(member_id=1, action=PropertyChangeAction.EDIT, payload={}, status=PropertyChangeStatus.CANCELLED),
        ]
    )
    await db_session.commit()

    result = await _today(db_session, "manage_finance", "member.manage", "boundary.review", "property.review")

    assert result["payment_verifications"] == {"installment": 1, "cost_share": 2, "other_fee": 0, "total": 3}
    assert result["phone_fixes"] == {"open": 1}
    assert result["boundaries"] == {"pending": 1}
    assert result["property_requests"] == {"pending": 1}


async def test_as_of_is_the_injected_clock_in_utc(db_session: AsyncSession) -> None:
    assert (await _today(db_session))["as_of"] == "2026-10-13T08:00:00Z"
