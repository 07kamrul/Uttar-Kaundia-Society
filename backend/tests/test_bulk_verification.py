"""Batch 5: `POST /api/admin/payment-verifications/bulk-approve`.

Per-item results (each payment in its own SAVEPOINT, one commit at the end), a
stale-selection guard that writes nothing, one audit row per approved payment
suffixed ` bulk=<batch_id>`, and notifications for approved items only."""

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.audit_log import AuditLog
from app.models.cost_share_payment import CostSharePayment
from app.models.installment import Installment, InstallmentStatus
from app.models.installment_payment import InstallmentPayment
from app.models.rbac import Permission, UserPermissionOverride
from app.models.society_cost import CostSplitShare
from tests.test_installment_payments import _member_headers, _seed_accounts, _seed_due, _seed_member
from tests.test_member_payments import (
    INST,
    SUBMIT,
    _admin_headers_login,
    _flag_on,
    _form,
    _inst_form,
    _seed_share,
)

pytestmark = pytest.mark.asyncio

URL = "/api/admin/payment-verifications/bulk-approve"


class _World:
    """Three pending payments: A's installment (200) and cost share (500), B's installment (200)."""

    def __init__(self) -> None:
        self.member_a = self.member_b = None
        self.due_a = self.due_b = None
        self.share_a = None
        self.inst_a = self.cost_a = self.inst_b = 0


async def _world(client: AsyncClient, db, *, bulk_flag: bool = True) -> _World:
    w = _World()
    await _seed_accounts(db)
    await _flag_on(db)  # pay_merged_page: cost-share submissions
    if bulk_flag:
        await _flag_on(db, "admin_bulk_verify")
    w.member_a = await _seed_member(db, "bulk-a@example.com")
    w.member_b = await _seed_member(db, "bulk-b@example.com")
    w.due_a = (await _seed_due(db, w.member_a, [1], amount=200))[0]
    w.due_b = (await _seed_due(db, w.member_b, [3], amount=200))[0]
    w.share_a = await _seed_share(db, w.member_a, due="1000")
    a, b = _member_headers(w.member_a), _member_headers(w.member_b)
    w.inst_a = (await client.post(INST, data=_inst_form(w.due_a.id, "BULKI001"), headers=a)).json()["id"]
    w.cost_a = (
        await client.post(SUBMIT, data=_form(w.share_a.id, amount="500", ref="BULKC001"), headers=a)
    ).json()["id"]
    w.inst_b = (await client.post(INST, data=_inst_form(w.due_b.id, "BULKI002"), headers=b)).json()["id"]
    return w


def _body(items, count=None, total=None) -> dict:
    return {
        "items": [{"kind": kind, "id": ident} for kind, ident in items],
        "expected_count": len(items) if count is None else count,
        "expected_total": total,
    }


async def _statuses(db) -> dict[str, str]:
    inst = (
        await db.execute(select(InstallmentPayment).execution_options(populate_existing=True))
    ).scalars().unique().all()
    cost = (
        await db.execute(select(CostSharePayment).execution_options(populate_existing=True))
    ).scalars().unique().all()
    return {f"installment:{p.id}": p.status for p in inst} | {f"cost_share:{p.id}": p.status for p in cost}


async def _audit(db) -> list[AuditLog]:
    return list((await db.execute(select(AuditLog).order_by(AuditLog.id))).scalars())


async def _post(client, headers, body):
    return await client.post(URL, json=body, headers=headers)


# --- flag and permission ---------------------------------------------------


async def test_flag_off_the_endpoint_is_a_404(client: AsyncClient, db_session, admin_user) -> None:
    w = await _world(client, db_session, bulk_flag=False)
    headers = await _admin_headers_login(client)

    response = await _post(client, headers, _body([("installment", w.inst_a)], total="200.00"))

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "FEATURE_DISABLED"
    assert set((await _statuses(db_session)).values()) == {"pending"}


async def test_requires_manage_finance(client: AsyncClient, db_session, admin_user) -> None:
    w = await _world(client, db_session)
    permission = Permission(key="manage_finance", resource="finance", action="manage")
    db_session.add(permission)
    await db_session.commit()
    db_session.add(UserPermissionOverride(user_id=admin_user.id, permission_id=permission.id, granted=False))
    await db_session.commit()
    body = _body([("installment", w.inst_a)], total="200.00")

    assert (await _post(client, await _admin_headers_login(client), body)).status_code == 403
    assert (await client.post(URL, json=body)).status_code in (401, 403)
    member = {"Authorization": f"Bearer {create_access_token(str(w.member_a.id), 'member')}"}
    assert (await _post(client, member, body)).status_code in (401, 403)
    assert set((await _statuses(db_session)).values()) == {"pending"}


# --- happy path ------------------------------------------------------------


async def test_mixed_kinds_are_approved_with_one_audit_row_per_payment(
    client: AsyncClient, db_session, admin_user
) -> None:
    w = await _world(client, db_session)
    headers = await _admin_headers_login(client)

    response = await _post(
        client, headers, _body([("installment", w.inst_a), ("cost_share", w.cost_a), ("installment", w.inst_b)], total="900.00")
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["batch_id"]) == 8
    assert body["approved_count"] == 3
    assert body["approved_total"] == "900.00"
    assert body["failed"] == []
    assert {(a["kind"], a["id"], a["amount"]) for a in body["approved"]} == {
        ("installment", w.inst_a, "200.00"), ("cost_share", w.cost_a, "500.00"), ("installment", w.inst_b, "200.00"),
    }
    assert set((await _statuses(db_session)).values()) == {"approved"}
    share = (
        await db_session.execute(select(CostSplitShare).execution_options(populate_existing=True))
    ).scalars().one()
    assert share.amount_paid == Decimal("500") and share.status == "partial"
    installments = (
        await db_session.execute(select(Installment).execution_options(populate_existing=True))
    ).scalars().all()
    assert all(i.status == InstallmentStatus.PAID for i in installments)

    audits = await _audit(db_session)
    suffix = f" bulk={body['batch_id']}"
    assert sorted(a.action for a in audits) == sorted(
        ["installment_payment.approve", "installment_payment.approve", "cost_share_payment.approve", "society_cost.payment"]
    )
    assert all(a.detail.endswith(suffix) for a in audits)
    assert all(a.actor_admin_id == admin_user.id for a in audits)
    assert not [a for a in audits if a.action.startswith("bulk")]  # no batch-level row


async def test_approved_members_are_notified_after_the_commit(
    client: AsyncClient, db_session, admin_user, monkeypatch
) -> None:
    w = await _world(client, db_session)
    sent: list[str] = []

    async def fake_send(to, *_args, **_kwargs):
        sent.append(to)

    monkeypatch.setattr("app.api.routes.installment_payments.send_email", fake_send)
    monkeypatch.setattr("app.api.routes.member_payments.send_email", fake_send)

    response = await _post(
        client, await _admin_headers_login(client),
        _body([("installment", w.inst_a), ("cost_share", w.cost_a)], total="700.00"),
    )

    assert response.status_code == 200
    assert sorted(sent) == ["bulk-a@example.com", "bulk-a@example.com"]


# --- stale guard -----------------------------------------------------------


@pytest.mark.parametrize(
    "expected_count,expected_total,extra_unknown_item",
    [
        pytest.param(3, "700.00", False, id="count-differs"),
        pytest.param(2, "699.99", False, id="total-differs"),
        pytest.param(3, "700.00", True, id="unknown-id"),
    ],
)
async def test_stale_selection_is_a_409_and_writes_nothing(
    client: AsyncClient, db_session, admin_user, expected_count, expected_total, extra_unknown_item
) -> None:
    w = await _world(client, db_session)
    items = [("installment", w.inst_a), ("cost_share", w.cost_a)]
    if extra_unknown_item:
        items.append(("installment", 99999))
    body = _body(items, count=expected_count, total=expected_total)

    response = await _post(client, await _admin_headers_login(client), body)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "BULK_SELECTION_STALE"
    assert set((await _statuses(db_session)).values()) == {"pending"}
    assert await _audit(db_session) == []


async def test_an_item_reviewed_in_the_meantime_makes_the_whole_batch_stale(
    client: AsyncClient, db_session, admin_user
) -> None:
    w = await _world(client, db_session)
    headers = await _admin_headers_login(client)
    assert (await client.post(f"/api/admin/installment-payments/{w.inst_b}/approve", headers=headers)).status_code == 200
    audits_before = len(await _audit(db_session))

    response = await _post(
        client, headers, _body([("installment", w.inst_a), ("installment", w.inst_b)], total="400.00")
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "BULK_SELECTION_STALE"
    assert (await _statuses(db_session))[f"installment:{w.inst_a}"] == "pending"
    assert len(await _audit(db_session)) == audits_before


# --- per-item failures -----------------------------------------------------


async def test_one_item_no_longer_due_fails_alone_while_the_rest_are_approved(
    client: AsyncClient, db_session, admin_user, monkeypatch
) -> None:
    w = await _world(client, db_session)
    sent: list[str] = []

    async def fake_send(to, *_args, **_kwargs):
        sent.append(to)

    monkeypatch.setattr("app.api.routes.installment_payments.send_email", fake_send)
    monkeypatch.setattr("app.api.routes.member_payments.send_email", fake_send)
    # B's month got marked paid by other means after B reported the payment.
    due_b = await db_session.get(Installment, w.due_b.id)
    due_b.status = InstallmentStatus.PAID
    due_b.paid_at = datetime(2026, 1, 5, tzinfo=timezone.utc)
    await db_session.commit()

    response = await _post(
        client, await _admin_headers_login(client),
        _body([("installment", w.inst_b), ("installment", w.inst_a), ("cost_share", w.cost_a)], total="900.00"),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["approved_count"] == 2
    assert body["approved_total"] == "700.00"
    assert body["failed"] == [{"kind": "installment", "id": w.inst_b, "code": "NO_LONGER_DUE"}]
    statuses = await _statuses(db_session)
    assert statuses[f"installment:{w.inst_b}"] == "pending"
    assert statuses[f"installment:{w.inst_a}"] == "approved"
    assert statuses[f"cost_share:{w.cost_a}"] == "approved"
    audits = await _audit(db_session)
    assert not any(a.entity_id == str(w.inst_b) and a.entity_type == "installment_payment" for a in audits)
    assert len(audits) == 3  # inst A + (cost share + share) - none for the failed one
    assert sent == ["bulk-a@example.com", "bulk-a@example.com"]  # nothing for B


async def test_cost_share_that_would_overpay_fails_with_amount_exceeds_remaining(
    client: AsyncClient, db_session, admin_user
) -> None:
    w = await _world(client, db_session)
    share = await db_session.get(CostSplitShare, w.share_a.id)
    share.amount_paid = Decimal("700")  # recorded by hand after the member reported 500
    await db_session.commit()

    response = await _post(
        client, await _admin_headers_login(client),
        _body([("cost_share", w.cost_a), ("installment", w.inst_b)], total="700.00"),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["failed"] == [{"kind": "cost_share", "id": w.cost_a, "code": "AMOUNT_EXCEEDS_REMAINING"}]
    assert [(a["kind"], a["id"]) for a in body["approved"]] == [("installment", w.inst_b)]
    assert (await _statuses(db_session))[f"cost_share:{w.cost_a}"] == "pending"


async def test_races_after_the_guard_map_to_already_reviewed_and_not_found(
    client: AsyncClient, db_session, admin_user, monkeypatch
) -> None:
    from app.services import bulk_verification

    w = await _world(client, db_session)
    real_load = bulk_verification._load_fresh

    async def vanishing_load(db, kind, payment_id):
        if (kind, payment_id) == ("installment", w.inst_b):
            return None
        return await real_load(db, kind, payment_id)

    async def reviewed_elsewhere(db, payment, admin_id):
        from app.services.installment_payment import PaymentConflict

        raise PaymentConflict("This payment has already been reviewed.", code="ALREADY_REVIEWED")

    monkeypatch.setattr(bulk_verification, "_load_fresh", vanishing_load)
    monkeypatch.setattr("app.services.installment_payment.approve_payment", reviewed_elsewhere)

    response = await _post(
        client, await _admin_headers_login(client),
        _body([("installment", w.inst_a), ("installment", w.inst_b), ("cost_share", w.cost_a)], total="900.00"),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert {(f["id"], f["code"]) for f in body["failed"]} == {
        (w.inst_a, "ALREADY_REVIEWED"), (w.inst_b, "NOT_FOUND"),
    }
    assert [(a["kind"], a["id"]) for a in body["approved"]] == [("cost_share", w.cost_a)]


# --- request validation ----------------------------------------------------


async def test_between_one_and_fifty_unique_items(client: AsyncClient, db_session, admin_user) -> None:
    w = await _world(client, db_session)
    headers = await _admin_headers_login(client)

    too_many = _body([("installment", i) for i in range(1, 52)], total="1.00")
    empty = _body([], total="0.00")
    duplicate = _body([("installment", w.inst_a), ("installment", w.inst_a)], total="400.00")
    bad_kind = {"items": [{"kind": "picnic", "id": 1}], "expected_count": 1, "expected_total": "1.00"}
    no_total = {"items": [{"kind": "installment", "id": w.inst_a}], "expected_count": 1}

    for body in (too_many, empty, duplicate, bad_kind, no_total):
        assert (await _post(client, headers, body)).status_code == 422, body
    assert set((await _statuses(db_session)).values()) == {"pending"}


async def test_exactly_fifty_unique_items_pass_validation(client: AsyncClient, db_session, admin_user) -> None:
    await _world(client, db_session)

    response = await _post(
        client, await _admin_headers_login(client), _body([("installment", i) for i in range(1000, 1050)], total="1.00")
    )

    # Valid shape; the ids do not exist, so the selection is stale rather than invalid.
    assert response.status_code == 409

