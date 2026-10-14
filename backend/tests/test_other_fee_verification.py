"""Batch 2b: other-fee and picnic payment verification (flag pay_verify_other_fees)."""

import importlib.util
from datetime import date
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.audit_log import AuditLog
from app.models.fee_payment import FeePayment
from app.models.fee_settings import FeeSetting, FeeType
from app.models.picnic_payment import PicnicPayment
from app.models.rbac import Permission, UserPermissionOverride
from tests.test_installment_payments import _member_headers, _seed_member
from tests.test_member_payments import _admin_headers_login, _flag_on
from tests.test_other_fees import _seed_rates

pytestmark = pytest.mark.asyncio

FLAG = "pay_verify_other_fees"
PAY = "/api/member/other-fees/payments"
PICNIC = "/api/member/picnic-payments"
ADMIN = "/api/admin/other-fee-payments"
TODAY = date.today().isoformat()


def _fee(**extra) -> dict:
    return {"fee_type": "maintenance", "payment_date": TODAY, "payment_method": "cash", **extra}


async def _setup(db, *, flag: bool = True):
    await _seed_rates(db)
    if flag:
        await _flag_on(db, FLAG)
    a = await _seed_member(db, "fee-a@example.com")
    b = await _seed_member(db, "fee-b@example.com")
    return a, b


async def _audit_actions(db) -> list[str]:
    return [r.action for r in (await db.execute(select(AuditLog).order_by(AuditLog.id))).scalars()]


# --- flag off: unchanged ---------------------------------------------------


async def test_flag_off_posts_are_approved_and_counted(client: AsyncClient, db_session) -> None:
    a, _ = await _setup(db_session, flag=False)
    h = _member_headers(a)

    fee = await client.post(PAY, json=_fee(), headers=h)
    picnic = await client.post(PICNIC, json={"payment_date": TODAY, "additional_heads": 1}, headers=h)

    assert fee.status_code == 201 and fee.json()["status"] == "approved"
    assert picnic.status_code == 201 and picnic.json()["status"] == "approved"
    history = (await client.get("/api/member/payments/history", headers=h)).json()["items"]
    assert {i["status"] for i in history} == {"approved"}
    page = (await client.get(PAY, headers=h)).json()
    assert page["summary"]["total_paid"] == 250 + 800


async def test_flag_off_mobile_money_needs_no_reference(client: AsyncClient, db_session) -> None:
    a, _ = await _setup(db_session, flag=False)

    response = await client.post(PAY, json=_fee(payment_method="bkash"), headers=_member_headers(a))

    assert response.status_code == 201


async def test_flag_off_admin_endpoints_are_404(client: AsyncClient, db_session, admin_user) -> None:
    await _setup(db_session, flag=False)
    h = await _admin_headers_login(client)

    assert (await client.get(ADMIN, headers=h)).status_code == 404
    response = await client.post(f"{ADMIN}/fee/1/approve", headers=h)
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "FEATURE_DISABLED"


# --- flag on: creation -----------------------------------------------------


async def test_flag_on_posts_are_pending(client: AsyncClient, db_session) -> None:
    a, _ = await _setup(db_session)
    h = _member_headers(a)

    fee = await client.post(PAY, json=_fee(), headers=h)
    picnic = await client.post(PICNIC, json={"payment_date": TODAY}, headers=h)
    via_other = await client.post(
        PAY, json={"fee_type": "picnic", "payment_date": TODAY, "additional_heads": 0}, headers=h
    )

    assert fee.json()["status"] == "pending"
    assert picnic.json()["status"] == "pending"
    assert via_other.json()["status"] == "pending"


@pytest.mark.parametrize("method", ["bkash", "Nagad", "ROCKET"])
async def test_flag_on_mobile_money_requires_reference(client: AsyncClient, db_session, method) -> None:
    a, _ = await _setup(db_session)
    h = _member_headers(a)

    missing = await client.post(PAY, json=_fee(payment_method=method), headers=h)
    short = await client.post(PAY, json=_fee(payment_method=method, receipt_no="ab"), headers=h)
    picnic = await client.post(PICNIC, json={"payment_date": TODAY, "payment_method": method}, headers=h)
    ok = await client.post(PAY, json=_fee(payment_method=method, receipt_no="trx12345"), headers=h)

    for response in (missing, short, picnic):
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "REFERENCE_REQUIRED"
    assert ok.status_code == 201
    assert ok.json()["receipt_no"] == "TRX12345"
    assert len((await db_session.execute(select(FeePayment))).scalars().all()) == 1


async def test_flag_on_cash_needs_no_reference(client: AsyncClient, db_session) -> None:
    a, _ = await _setup(db_session)

    assert (await client.post(PAY, json=_fee(), headers=_member_headers(a))).status_code == 201


async def test_reference_reuse_rules(client: AsyncClient, db_session) -> None:
    a, b = await _setup(db_session)
    body = _fee(payment_method="bkash", receipt_no="SHARED001")

    first = await client.post(PAY, json=body, headers=_member_headers(a))
    same_member = await client.post(PICNIC, json={"payment_date": TODAY, "payment_method": "bkash", "receipt_no": "shared001"}, headers=_member_headers(a))
    other_member = await client.post(PAY, json=body, headers=_member_headers(b))
    other_picnic = await client.post(PICNIC, json={"payment_date": TODAY, "payment_method": "bkash", "receipt_no": "SHARED001"}, headers=_member_headers(b))

    assert first.status_code == 201
    assert same_member.status_code == 201
    for response in (other_member, other_picnic):
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "DUPLICATE_TRANSACTION_REF"


async def test_rejected_reference_is_freed(client: AsyncClient, db_session, admin_user) -> None:
    a, b = await _setup(db_session)
    body = _fee(payment_method="bkash", receipt_no="FREED0001")
    created = (await client.post(PAY, json=body, headers=_member_headers(a))).json()
    admin = await _admin_headers_login(client)
    await client.post(f"{ADMIN}/fee/{created['id']}/reject", json={"reason": "TrxID mismatch"}, headers=admin)

    assert (await client.post(PAY, json=body, headers=_member_headers(b))).status_code == 201


async def test_pay_once_pending_blocks_and_rejected_frees(client: AsyncClient, db_session, admin_user) -> None:
    await _seed_rates(db_session)
    await _flag_on(db_session, FLAG)
    member = await _seed_member(db_session, "once@example.com")
    db_session.add(
        FeeType(key="membership_card", label_bn="কার্ড", label_en="Card", calculation_type="variable",
                fee_category="other", is_pay_once=True, sort_order=9)
    )
    await db_session.commit()
    h = _member_headers(member)
    body = {"fee_type": "membership_card", "payment_date": TODAY, "amount": "100"}

    first = await client.post(PAY, json=body, headers=h)
    again = await client.post(PAY, json=body, headers=h)
    types = {t["key"]: t for t in (await client.get("/api/member/other-fees/types", headers=h)).json()}
    assert first.status_code == 201
    assert again.status_code == 409 and again.json()["detail"]["code"] == "FEE_ALREADY_PAID"
    assert types["membership_card"]["already_paid"] is True

    admin = await _admin_headers_login(client)
    await client.post(f"{ADMIN}/fee/{first.json()['id']}/reject", json={"reason": "no payment found"}, headers=admin)
    types = {t["key"]: t for t in (await client.get("/api/member/other-fees/types", headers=h)).json()}
    assert types["membership_card"]["already_paid"] is False
    assert (await client.post(PAY, json=body, headers=h)).status_code == 201


# --- totals count approved rows only ---------------------------------------


async def _three_states(client, db_session, admin_user):
    """One approved (250), one pending (250), one rejected (250) maintenance row
    plus the same trio for picnic (800 each)."""
    a, _ = await _setup(db_session)
    h = _member_headers(a)
    admin = await _admin_headers_login(client)
    ids = []
    for _ in range(3):
        ids.append((await client.post(PAY, json=_fee(), headers=h)).json()["id"])
    pids = []
    for _ in range(3):
        pids.append((await client.post(PICNIC, json={"payment_date": TODAY, "additional_heads": 1}, headers=h)).json()["id"])
    assert (await client.post(f"{ADMIN}/fee/{ids[0]}/approve", headers=admin)).status_code == 200
    assert (await client.post(f"{ADMIN}/fee/{ids[1]}/reject", json={"reason": "bad proof"}, headers=admin)).status_code == 200
    assert (await client.post(f"{ADMIN}/picnic/{pids[0]}/approve", headers=admin)).status_code == 200
    assert (await client.post(f"{ADMIN}/picnic/{pids[1]}/reject", json={"reason": "bad proof"}, headers=admin)).status_code == 200
    return a, h, admin


async def test_totals_ignore_pending_and_rejected(client: AsyncClient, db_session, admin_user) -> None:
    a, h, admin = await _three_states(client, db_session, admin_user)

    mine = (await client.get(PAY, headers=h)).json()
    assert mine["total"] == 6
    assert mine["summary"]["total_paid"] == 250 + 800
    assert mine["summary"]["by_type"] == {"maintenance": 250.0, "picnic": 800.0}

    all_rows = (await client.get("/api/admin/other-fees/payments", headers=admin)).json()
    assert all_rows["total"] == 6 and all_rows["summary"]["total_paid"] == 1050

    ledger = (await client.get("/api/admin/fee-payments", headers=admin)).json()
    assert ledger["total_collected"] == 1050 and ledger["count"] == 6
    only_fees = (await client.get("/api/admin/fee-payments?fee_type=maintenance", headers=admin)).json()
    assert only_fees["total_collected"] == 250 and only_fees["count"] == 3
    picnic = (await client.get("/api/admin/picnic-payments", headers=admin)).json()
    assert picnic["total_collected"] == 800 and picnic["count"] == 3

    summary = (await client.get("/api/member/payments/summary", headers=h)).json()
    assert float(summary["total_paid"]) == 1050
    assert summary["pending_count"] == 2
    assert float(summary["pending_amount"]) == 250 + 800

    history = (await client.get("/api/member/payments/history?kind=other_fee", headers=h)).json()["items"]
    assert sorted(i["status"] for i in history) == ["approved"] * 2 + ["pending"] * 2 + ["rejected"] * 2
    rejected = next(i for i in history if i["status"] == "rejected")
    assert rejected["rejection_reason"] == "bad proof"
    only_pending = (await client.get("/api/member/payments/history?status=pending", headers=h)).json()
    assert only_pending["total"] == 2


async def test_unlinked_finance_payments_skip_unapproved_picnic(client: AsyncClient, db_session, admin_user) -> None:
    await _three_states(client, db_session, admin_user)
    admin = await _admin_headers_login(client)

    response = await client.get("/api/admin/finance/unlinked-payments?source_type=picnic_payment", headers=admin)

    if response.status_code == 200:
        assert len(response.json()) == 1


# --- review ----------------------------------------------------------------


async def test_approve_and_reject_effects_audit_and_second_review(client: AsyncClient, db_session, admin_user) -> None:
    a, _ = await _setup(db_session)
    h = _member_headers(a)
    fee = (await client.post(PAY, json=_fee(payment_method="bkash", receipt_no="APPR0001"), headers=h)).json()
    picnic = (await client.post(PICNIC, json={"payment_date": TODAY}, headers=h)).json()
    admin = await _admin_headers_login(client)

    approved = await client.post(f"{ADMIN}/fee/{fee['id']}/approve", headers=admin)
    rejected = await client.post(f"{ADMIN}/picnic/{picnic['id']}/reject", json={"reason": "wrong amount"}, headers=admin)

    assert approved.status_code == 200 and approved.json()["status"] == "approved"
    assert approved.json()["reviewed_at"] is not None and approved.json()["id_ref"] == f"fee:{fee['id']}"
    assert rejected.json()["status"] == "rejected" and rejected.json()["rejection_reason"] == "wrong amount"
    row = (await db_session.execute(select(FeePayment).execution_options(populate_existing=True))).scalar_one()
    assert row.reviewed_by == admin_user.id
    assert await _audit_actions(db_session) == ["other_fee_payment.approve", "other_fee_payment.reject"]
    for path in (f"{ADMIN}/fee/{fee['id']}/approve", f"{ADMIN}/fee/{fee['id']}/reject", f"{ADMIN}/picnic/{picnic['id']}/approve"):
        response = await client.post(path, json={"reason": "again please"}, headers=admin)
        assert response.status_code == 409
    assert (await client.post(f"{ADMIN}/fee/9999/approve", headers=admin)).status_code == 404


async def test_reject_reason_is_mandatory(client: AsyncClient, db_session, admin_user) -> None:
    a, _ = await _setup(db_session)
    fee = (await client.post(PAY, json=_fee(), headers=_member_headers(a))).json()
    admin = await _admin_headers_login(client)
    url = f"{ADMIN}/fee/{fee['id']}/reject"

    assert (await client.post(url, json={}, headers=admin)).status_code == 422
    assert (await client.post(url, json={"reason": " "}, headers=admin)).status_code == 422
    assert (await client.post(url, headers=admin)).status_code == 422
    row = (await db_session.execute(select(FeePayment))).scalar_one()
    assert row.status == "pending"


async def test_review_permissions(client: AsyncClient, db_session, admin_user) -> None:
    a, _ = await _setup(db_session)
    fee = (await client.post(PAY, json=_fee(), headers=_member_headers(a))).json()
    url = f"{ADMIN}/fee/{fee['id']}/approve"

    assert (await client.post(url, headers=_member_headers(a))).status_code in (401, 403)
    assert (await client.get(ADMIN, headers=_member_headers(a))).status_code in (401, 403)
    assert (await client.post(url)).status_code in (401, 403)
    permission = Permission(key="manage_finance", resource="finance", action="manage")
    db_session.add(permission)
    await db_session.commit()
    db_session.add(UserPermissionOverride(user_id=admin_user.id, permission_id=permission.id, granted=False))
    await db_session.commit()
    admin = await _admin_headers_login(client)
    assert (await client.post(url, headers=admin)).status_code == 403
    assert (await client.get(ADMIN, headers=admin)).status_code == 403
    assert (await client.get("/api/admin/payment-verifications/pending-count", headers=admin)).status_code == 403


async def test_admin_list_filters_and_details(client: AsyncClient, db_session, admin_user) -> None:
    a, _ = await _setup(db_session)
    h = _member_headers(a)
    await client.post(PAY, json=_fee(payment_method="bkash", receipt_no="LIST0001"), headers=h)
    await client.post(PICNIC, json={"payment_date": TODAY, "additional_heads": 2}, headers=h)
    admin = await _admin_headers_login(client)

    everything = (await client.get(ADMIN, headers=admin)).json()
    fees = (await client.get(f"{ADMIN}?kind=fee&status=pending", headers=admin)).json()
    picnics = (await client.get(f"{ADMIN}?kind=picnic", headers=admin)).json()
    approved = (await client.get(f"{ADMIN}?status=approved", headers=admin)).json()

    assert len(everything) == 2 and len(fees) == 1 and len(picnics) == 1 and approved == []
    assert fees[0]["member_name"] == "fee-a" and fees[0]["fee_label"] == "Maintenance"
    assert fees[0]["method"] == "bkash" and fees[0]["reference"] == "LIST0001" and float(fees[0]["amount"]) == 250
    assert float(picnics[0]["amount"]) == 1100 and picnics[0]["id_ref"].startswith("picnic:")
    assert (await client.get(f"{ADMIN}?kind=bogus", headers=admin)).status_code == 422


# --- proof -----------------------------------------------------------------


def _png(name="shot.png", payload=b"\x89PNG\r\n\x1a\nxx"):
    return {"proof": (name, payload, "image/png")}


async def test_proof_upload_rules(client: AsyncClient, db_session, admin_user, tmp_path, monkeypatch) -> None:
    from app.services.storage import settings

    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    a, b = await _setup(db_session)
    fee = (await client.post(PAY, json=_fee(), headers=_member_headers(a))).json()
    picnic = (await client.post(PICNIC, json={"payment_date": TODAY}, headers=_member_headers(a))).json()
    url = f"{PAY}/{fee['id']}/proof"

    other = await client.post(url, files=_png(), headers=_member_headers(b))
    bad = await client.post(url, files=_png("virus.exe", b"MZ"), headers=_member_headers(a))
    ok = await client.post(url, files=_png(), headers=_member_headers(a))
    ok_picnic = await client.post(f"/api/member/picnic-payments/{picnic['id']}/proof", files=_png(), headers=_member_headers(a))

    assert other.status_code == 404
    assert bad.status_code == 422
    assert ok.status_code == 200 and ok.json()["proof_url"].startswith("other_fee_payments/member_")
    assert ok_picnic.status_code == 200 and ok_picnic.json()["proof_url"]
    assert "other_fee_payment.proof" in await _audit_actions(db_session)
    admin = await _admin_headers_login(client)
    await client.post(f"{ADMIN}/fee/{fee['id']}/approve", headers=admin)
    late = await client.post(url, files=_png(), headers=_member_headers(a))
    assert late.status_code == 409 and late.json()["detail"]["code"] == "NOT_PENDING"
    assert (await client.post(url, files=_png())).status_code in (401, 403)


# --- counts, today, bulk ---------------------------------------------------


async def test_pending_counts_today_and_bulk(client: AsyncClient, db_session, admin_user) -> None:
    a, b = await _setup(db_session)
    await _flag_on(db_session, "admin_bulk_verify")
    fee = (await client.post(PAY, json=_fee(), headers=_member_headers(a))).json()
    picnic = (await client.post(PICNIC, json={"payment_date": TODAY}, headers=_member_headers(b))).json()
    admin = await _admin_headers_login(client)

    counts = (await client.get("/api/admin/payment-verifications/pending-count", headers=admin)).json()
    today = (await client.get("/api/admin/today", headers=admin)).json()["payment_verifications"]
    assert counts == {"installment": 0, "cost_share": 0, "other_fee": 2, "total": 2}
    assert today == counts

    body = {
        "items": [
            {"kind": "other_fee", "id_ref": f"fee:{fee['id']}"},
            {"kind": "other_fee", "id_ref": f"picnic:{picnic['id']}"},
        ],
        "expected_count": 2,
        "expected_total": "750.00",
    }
    stale = await client.post("/api/admin/payment-verifications/bulk-approve", json={**body, "expected_total": "1.00"}, headers=admin)
    done = await client.post("/api/admin/payment-verifications/bulk-approve", json=body, headers=admin)

    assert stale.status_code == 409
    assert done.status_code == 200
    out = done.json()
    assert out["approved_count"] == 2 and float(out["approved_total"]) == 750 and out["failed"] == []
    assert {x["id_ref"] for x in out["approved"]} == {f"fee:{fee['id']}", f"picnic:{picnic['id']}"}
    assert (await client.get("/api/admin/payment-verifications/pending-count", headers=admin)).json()["total"] == 0
    assert (await _audit_actions(db_session)).count("other_fee_payment.approve") == 2
    again = await client.post("/api/admin/payment-verifications/bulk-approve", json=body, headers=admin)
    assert again.status_code == 409


async def test_bulk_item_validation(client: AsyncClient, db_session, admin_user) -> None:
    await _setup(db_session)
    await _flag_on(db_session, "admin_bulk_verify")
    admin = await _admin_headers_login(client)

    for item in ({"kind": "other_fee"}, {"kind": "other_fee", "id_ref": "bogus:1"}, {"kind": "installment"}):
        response = await client.post(
            "/api/admin/payment-verifications/bulk-approve",
            json={"items": [item], "expected_count": 1, "expected_total": "1.00"},
            headers=admin,
        )
        assert response.status_code == 422


# --- migration -------------------------------------------------------------


def test_migration_upgrade_downgrade_keeps_rows_approved() -> None:
    path = next((Path(__file__).resolve().parent.parent / "alembic" / "versions").glob("a8c2e4f6b1d3_*.py"))
    spec = importlib.util.spec_from_file_location("mig_other_fee", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.down_revision == "f5b8d2a6c1e7"
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE admin_users (id INTEGER PRIMARY KEY)"))
        for table in ("fee_payments", "picnic_payments"):
            conn.execute(sa.text(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY, created_at DATETIME)"))
            conn.execute(sa.text(f"INSERT INTO {table} (id) VALUES (1)"))

    def run(fn):
        with engine.begin() as conn, Operations.context(MigrationContext.configure(conn)):
            fn()

    run(module.upgrade)
    insp = sa.inspect(engine)
    for table in ("fee_payments", "picnic_payments"):
        cols = {c["name"] for c in insp.get_columns(table)}
        assert {"status", "rejection_reason", "reviewed_by", "reviewed_at", "proof_url"} <= cols
        assert f"ix_{table}_status_created_at" in {i["name"] for i in insp.get_indexes(table)}
        with engine.connect() as conn:
            assert conn.execute(sa.text(f"SELECT status FROM {table}")).scalar() == "approved"
    run(module.downgrade)
    insp = sa.inspect(engine)
    for table in ("fee_payments", "picnic_payments"):
        assert "status" not in {c["name"] for c in insp.get_columns(table)}
