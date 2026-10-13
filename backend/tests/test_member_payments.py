"""Batch 2: merged payments (summary, history, cost-share self-payment, verification)."""

from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.fee_payment import FeePayment
from app.models.feature_flag import FeatureFlag
from app.models.picnic_payment import PicnicPayment
from app.models.rbac import Permission, UserPermissionOverride
from app.models.society_cost import CostSplit, CostSplitShare, SocietyCost
from tests.test_installment_payments import (
    _member_headers,
    _seed_accounts,
    _seed_due,
    _seed_member,
)

pytestmark = pytest.mark.asyncio

SUMMARY = "/api/member/payments/summary"
HISTORY = "/api/member/payments/history"
SUBMIT = "/api/member/payments/cost-shares"
INST = "/api/member/installment-payments"


async def _admin_headers_login(client):
    r = await client.post("/api/admin/login", json={"email": "admin@example.com", "password": "adminpass123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _flag_on(db, key="pay_merged_page"):
    db.add(FeatureFlag(key=key, enabled=True))
    await db.commit()


async def _seed_share(db, member, due="1000", paid="0", title="রাস্তা") -> CostSplitShare:
    cost = SocietyCost(title=title, total_amount=Decimal(due), incurred_date=date(2026, 1, 1))
    db.add(cost)
    await db.flush()
    split = CostSplit(society_cost_id=cost.id, split_method="manual")
    db.add(split)
    await db.flush()
    share = CostSplitShare(
        cost_split_id=split.id,
        member_id=member.id,
        amount_due=Decimal(due),
        amount_paid=Decimal(paid),
        status="partial" if Decimal(paid) > 0 else "unpaid",
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)
    return share


def _form(share_id, amount="500", ref="CS123456", method="bkash", **extra):
    return {
        "share_id": str(share_id),
        "amount": amount,
        "method": method,
        "transaction_ref": ref,
        "paid_on": date.today().isoformat(),
        **extra,
    }


def _inst_form(installment_id, ref):
    return {
        "installment_ids": str(installment_id),
        "method": "bkash",
        "transaction_ref": ref,
        "paid_on": date.today().isoformat(),
    }


async def _setup(db):
    await _seed_accounts(db)
    await _flag_on(db)
    return await _seed_member(db, "pm@example.com")


async def test_summary_totals_across_sources(client: AsyncClient, db_session) -> None:
    member = await _setup(db_session)
    due = await _seed_due(db_session, member, [1, 2, 3], amount=100)
    await _seed_share(db_session, member, due="1000", paid="200")
    db_session.add(FeePayment(member_id=member.id, fee_type="donation", amount=300, payment_date=date.today()))
    db_session.add(
        PicnicPayment(
            member_id=member.id, head_price=100, additional_price=0, additional_count=0, total=150,
            payment_date=date.today(),
        )
    )
    await db_session.commit()
    r = await client.post(INST, data=_inst_form(due[0].id, "IP123456"), headers=_member_headers(member))
    assert r.status_code == 201

    body = (await client.get(SUMMARY, headers=_member_headers(member))).json()

    assert body["currency"] == "BDT"
    assert Decimal(body["total_due"]) == Decimal("200") + Decimal("800")
    assert Decimal(body["total_paid"]) == Decimal("300") + Decimal("150") + Decimal("200")
    assert body["pending_count"] == 1
    assert Decimal(body["pending_amount"]) == Decimal("100")
    kinds = sorted((d["kind"], d["pending"]) for d in body["dues"])
    assert kinds == [("cost_share", False), ("installment", False), ("installment", False), ("installment", True)]
    assert {a["method"] for a in body["accounts"]} == {"bKash", "Bank"}
    assert any(t["key"] == "picnic" for t in body["payable_fee_types"])
    assert all(not (t["pay_once"] and t["already_paid"]) for t in body["payable_fee_types"])


async def test_summary_approved_installment_payment_counts_as_paid(client: AsyncClient, db_session, admin_user) -> None:
    member = await _setup(db_session)
    due = await _seed_due(db_session, member, [1], amount=100)
    pid = (await client.post(INST, data=_inst_form(due[0].id, "IP123456"), headers=_member_headers(member))).json()["id"]
    headers = await _admin_headers_login(client)
    assert (await client.post(f"/api/admin/installment-payments/{pid}/approve", headers=headers)).status_code == 200

    body = (await client.get(SUMMARY, headers=_member_headers(member))).json()

    assert Decimal(body["total_paid"]) == Decimal("100")
    assert Decimal(body["total_due"]) == 0 and body["pending_count"] == 0


async def test_summary_forbidden_for_admin(client: AsyncClient, db_session, admin_user) -> None:
    headers = await _admin_headers_login(client)
    assert (await client.get(SUMMARY, headers=headers)).status_code == 403
    assert (await client.get(HISTORY, headers=headers)).status_code == 403


async def test_history_merges_filters_paginates_and_isolates(client: AsyncClient, db_session) -> None:
    member = await _setup(db_session)
    other = await _seed_member(db_session, "other@example.com")
    due = await _seed_due(db_session, member, [1])
    share = await _seed_share(db_session, member)
    await _seed_share(db_session, other)
    db_session.add(FeePayment(member_id=member.id, fee_type="donation", amount=300, payment_date=date.today()))
    db_session.add(FeePayment(member_id=other.id, fee_type="donation", amount=999, payment_date=date.today()))
    await db_session.commit()
    headers = _member_headers(member)
    await client.post(INST, data=_inst_form(due[0].id, "IP123456"), headers=headers)
    await client.post(SUBMIT, data=_form(share.id), headers=headers)

    allr = (await client.get(HISTORY, headers=headers)).json()
    assert allr["total"] == 3
    assert {i["kind"] for i in allr["items"]} == {"installment", "other_fee", "cost_share"}
    assert set(allr["items"][0]) >= {
        "kind", "id", "title", "amount", "method", "reference", "date", "status", "rejection_reason", "proof_url",
    }

    only = (await client.get(HISTORY, params={"kind": "other_fee"}, headers=headers)).json()
    assert only["total"] == 1 and only["items"][0]["status"] == "recorded"
    rec = (await client.get(HISTORY, params={"status": "recorded"}, headers=headers)).json()
    assert rec["total"] == 1
    pend = (await client.get(HISTORY, params={"status": "pending"}, headers=headers)).json()
    assert {i["kind"] for i in pend["items"]} == {"installment", "cost_share"}

    page = (await client.get(HISTORY, params={"page": 2, "page_size": 2}, headers=headers)).json()
    assert page["total"] == 3 and len(page["items"]) == 1 and page["page"] == 2

    assert (await client.get(HISTORY, params={"kind": "nope"}, headers=headers)).status_code == 422


async def test_submit_flag_off_returns_feature_disabled(client: AsyncClient, db_session) -> None:
    await _seed_accounts(db_session)
    member = await _seed_member(db_session, "off@example.com")
    share = await _seed_share(db_session, member)

    r = await client.post(SUBMIT, data=_form(share.id), headers=_member_headers(member))

    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "FEATURE_DISABLED"
    assert (await client.get(SUMMARY, headers=_member_headers(member))).status_code == 200
    assert (await client.get(HISTORY, headers=_member_headers(member))).status_code == 200


async def test_submit_happy_path_creates_pending_row(client: AsyncClient, db_session) -> None:
    member = await _setup(db_session)
    share = await _seed_share(db_session, member)

    r = await client.post(SUBMIT, data=_form(share.id, ref="ab12cd"), headers=_member_headers(member))

    assert r.status_code == 201, r.text
    body = r.json()
    assert body["kind"] == "cost_share" and body["status"] == "pending"
    assert Decimal(body["amount"]) == 500 and body["reference"] == "AB12CD"
    assert body["title"] == "রাস্তা"


async def test_submit_errors(client: AsyncClient, db_session) -> None:
    member = await _setup(db_session)
    other = await _seed_member(db_session, "o2@example.com")
    share = await _seed_share(db_session, member)
    foreign = await _seed_share(db_session, other)
    paid = await _seed_share(db_session, member, due="300", paid="300", title="paid")
    headers = _member_headers(member)

    r = await client.post(SUBMIT, data=_form(foreign.id), headers=headers)
    assert (r.status_code, r.json()["detail"]["code"]) == (404, "SHARE_NOT_FOUND")
    r = await client.post(SUBMIT, data=_form(99999), headers=headers)
    assert (r.status_code, r.json()["detail"]["code"]) == (404, "SHARE_NOT_FOUND")
    r = await client.post(SUBMIT, data=_form(paid.id, amount="10"), headers=headers)
    assert (r.status_code, r.json()["detail"]["code"]) == (409, "SHARE_ALREADY_PAID")
    for amount in ("1000.01", "0", "-5"):
        r = await client.post(SUBMIT, data=_form(share.id, amount=amount), headers=headers)
        assert (r.status_code, r.json()["detail"]["code"]) == (422, "AMOUNT_EXCEEDS_REMAINING"), amount

    assert (await client.post(SUBMIT, data=_form(share.id, amount="600"), headers=headers)).status_code == 201
    r = await client.post(SUBMIT, data=_form(share.id, amount="500", ref="CS999999"), headers=headers)
    assert (r.status_code, r.json()["detail"]["code"]) == (422, "AMOUNT_EXCEEDS_REMAINING")


async def test_same_share_same_reference_twice_is_duplicate(client: AsyncClient, db_session) -> None:
    member = await _setup(db_session)
    share = await _seed_share(db_session, member)
    headers = _member_headers(member)

    assert (
        await client.post(SUBMIT, data=_form(share.id, amount="100", ref="DUP12345"), headers=headers)
    ).status_code == 201
    r = await client.post(SUBMIT, data=_form(share.id, amount="100", ref="dup12345"), headers=headers)

    assert (r.status_code, r.json()["detail"]["code"]) == (409, "DUPLICATE_TRANSACTION_REF")


async def test_one_transfer_can_pay_an_installment_and_several_shares(
    client: AsyncClient, db_session
) -> None:
    """One bKash/bank transfer often covers an installment plus several cost
    shares, so the same member may reuse one live reference across both tables
    and across shares."""
    member = await _setup(db_session)
    share_a = await _seed_share(db_session, member, title="রাস্তা")
    share_b = await _seed_share(db_session, member, title="ড্রেন")
    due = await _seed_due(db_session, member, [1])
    headers = _member_headers(member)

    first = await client.post(SUBMIT, data=_form(share_a.id, amount="100", ref="ONE12345"), headers=headers)
    second = await client.post(SUBMIT, data=_form(share_b.id, amount="200", ref="ONE12345"), headers=headers)
    third = await client.post(INST, data=_inst_form(due[0].id, "one12345"), headers=headers)

    assert (first.status_code, second.status_code, third.status_code) == (201, 201, 201), (
        first.text, second.text, third.text,
    )


async def test_installment_first_then_shares_with_one_reference(client: AsyncClient, db_session) -> None:
    member = await _setup(db_session)
    share_a = await _seed_share(db_session, member, title="রাস্তা")
    share_b = await _seed_share(db_session, member, title="ড্রেন")
    due = await _seed_due(db_session, member, [1])
    headers = _member_headers(member)

    assert (await client.post(INST, data=_inst_form(due[0].id, "ONE54321"), headers=headers)).status_code == 201
    for share in (share_a, share_b):
        r = await client.post(SUBMIT, data=_form(share.id, amount="100", ref="ONE54321"), headers=headers)
        assert r.status_code == 201, r.text


async def test_reference_held_live_by_another_member_is_duplicate(client: AsyncClient, db_session) -> None:
    owner = await _setup(db_session)
    other = await _seed_member(db_session, "other-ref@example.com")
    owner_share = await _seed_share(db_session, owner)
    other_share = await _seed_share(db_session, other)
    owner_due = await _seed_due(db_session, owner, [1])
    other_due = await _seed_due(db_session, other, [2])
    owner_headers, other_headers = _member_headers(owner), _member_headers(other)
    assert (
        await client.post(SUBMIT, data=_form(owner_share.id, amount="100", ref="OWN12345"), headers=owner_headers)
    ).status_code == 201
    assert (
        await client.post(INST, data=_inst_form(owner_due[0].id, "OWN54321"), headers=owner_headers)
    ).status_code == 201

    # A cost-share ref blocks the other member in both tables ...
    r = await client.post(SUBMIT, data=_form(other_share.id, amount="100", ref="OWN12345"), headers=other_headers)
    assert (r.status_code, r.json()["detail"]["code"]) == (409, "DUPLICATE_TRANSACTION_REF")
    r = await client.post(INST, data=_inst_form(other_due[0].id, "OWN12345"), headers=other_headers)
    assert (r.status_code, r.json()["detail"]["code"]) == (409, "DUPLICATE_TRANSACTION_REF")
    # ... and so does an installment ref.
    r = await client.post(SUBMIT, data=_form(other_share.id, amount="100", ref="OWN54321"), headers=other_headers)
    assert (r.status_code, r.json()["detail"]["code"]) == (409, "DUPLICATE_TRANSACTION_REF")
    r = await client.post(INST, data=_inst_form(other_due[0].id, "OWN54321"), headers=other_headers)
    assert r.status_code == 409


async def test_installment_reference_stays_unique_among_installment_payments(
    client: AsyncClient, db_session
) -> None:
    member = await _setup(db_session)
    due = await _seed_due(db_session, member, [1, 2])
    headers = _member_headers(member)

    assert (await client.post(INST, data=_inst_form(due[0].id, "INS12345"), headers=headers)).status_code == 201
    r = await client.post(INST, data=_inst_form(due[1].id, "INS12345"), headers=headers)

    assert r.status_code == 409


async def test_rejected_shared_reference_is_released(client: AsyncClient, db_session, admin_user) -> None:
    member = await _setup(db_session)
    share = await _seed_share(db_session, member)
    other = await _seed_member(db_session, "released@example.com")
    other_share = await _seed_share(db_session, other)
    headers = _member_headers(member)
    pid = (
        await client.post(SUBMIT, data=_form(share.id, amount="100", ref="REL12345"), headers=headers)
    ).json()["id"]
    admin_headers = await _admin_headers_login(client)
    await client.post(
        f"/api/admin/cost-share-payments/{pid}/reject", json={"reason": "no such trx"}, headers=admin_headers
    )

    r = await client.post(
        SUBMIT, data=_form(other_share.id, amount="100", ref="REL12345"), headers=_member_headers(other)
    )

    assert r.status_code == 201, r.text


async def test_admin_account_cannot_submit(client: AsyncClient, db_session, admin_user) -> None:
    await _flag_on(db_session)
    r = await client.post(SUBMIT, data=_form(1), headers=await _admin_headers_login(client))
    assert r.status_code == 403


async def _submitted(client, db, ref="CS123456", amount="500", due="1000"):
    member = await _setup(db)
    share = await _seed_share(db, member, due=due)
    r = await client.post(SUBMIT, data=_form(share.id, amount=amount, ref=ref), headers=_member_headers(member))
    assert r.status_code == 201, r.text
    return member, share, r.json()["id"]


async def test_admin_approve_updates_share_audits_and_counts(client: AsyncClient, db_session, admin_user) -> None:
    member, share, pid = await _submitted(client, db_session)
    headers = await _admin_headers_login(client)

    listing = (
        await client.get("/api/admin/cost-share-payments", params={"status": "pending"}, headers=headers)
    ).json()
    assert len(listing) == 1
    assert listing[0]["member_name"] and listing[0]["cost_title"] == "রাস্তা"
    assert Decimal(str(listing[0]["remaining"])) == Decimal("1000")
    assert (await client.get("/api/admin/cost-share-payments/pending-count", headers=headers)).json() == {"count": 1}
    assert (await client.get("/api/admin/payment-verifications/pending-count", headers=headers)).json() == {
        "installment": 0, "cost_share": 1, "total": 1}

    r = await client.post(f"/api/admin/cost-share-payments/{pid}/approve", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"
    await db_session.refresh(share)
    assert share.amount_paid == Decimal("500") and share.status == "partial"
    assert share.paid_at is not None and share.receipt_no == "CS123456"
    actions = {a.action for a in (await db_session.execute(select(AuditLog))).scalars()}
    assert {"cost_share_payment.approve", "society_cost.payment"} <= actions
    assert (await client.post(f"/api/admin/cost-share-payments/{pid}/approve", headers=headers)).status_code == 409
    assert (await client.get("/api/admin/payment-verifications/pending-count", headers=headers)).json()["total"] == 0

    r2 = await client.post(SUBMIT, data=_form(share.id, amount="500", ref="CS777777"), headers=_member_headers(member))
    await client.post(f"/api/admin/cost-share-payments/{r2.json()['id']}/approve", headers=headers)
    await db_session.refresh(share)
    assert share.status == "paid" and share.amount_paid == Decimal("1000")


async def test_admin_reject_keeps_share_and_frees_reference(client: AsyncClient, db_session, admin_user) -> None:
    member, share, pid = await _submitted(client, db_session)
    headers = await _admin_headers_login(client)

    r = await client.post(f"/api/admin/cost-share-payments/{pid}/reject", json={"reason": "x"}, headers=headers)
    assert r.status_code == 422
    r = await client.post(
        f"/api/admin/cost-share-payments/{pid}/reject", json={"reason": "no such trx"}, headers=headers
    )
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    await db_session.refresh(share)
    assert share.amount_paid == 0 and share.status == "unpaid"
    actions = {a.action for a in (await db_session.execute(select(AuditLog))).scalars()}
    assert "cost_share_payment.reject" in actions
    hist = (await client.get(HISTORY, params={"status": "rejected"}, headers=_member_headers(member))).json()
    assert hist["items"][0]["rejection_reason"] == "no such trx"
    again = await client.post(SUBMIT, data=_form(share.id), headers=_member_headers(member))
    assert again.status_code == 201


async def test_admin_endpoints_permission(client: AsyncClient, db_session, admin_user) -> None:
    member, share, pid = await _submitted(client, db_session)
    perm = Permission(key="manage_finance", resource="finance", action="manage")
    db_session.add(perm)
    await db_session.commit()
    db_session.add(UserPermissionOverride(user_id=admin_user.id, permission_id=perm.id, granted=False))
    await db_session.commit()
    headers = await _admin_headers_login(client)
    for method, url in (
        ("get", "/api/admin/cost-share-payments"),
        ("get", "/api/admin/cost-share-payments/pending-count"),
        ("get", "/api/admin/payment-verifications/pending-count"),
        ("post", f"/api/admin/cost-share-payments/{pid}/approve"),
    ):
        assert (await getattr(client, method)(url, headers=headers)).status_code == 403, url
    r = await client.get("/api/admin/cost-share-payments", headers=_member_headers(member))
    assert r.status_code in (401, 403)


async def test_installment_pending_included_in_combined_count(client: AsyncClient, db_session, admin_user) -> None:
    member, share, pid = await _submitted(client, db_session)
    due = await _seed_due(db_session, member, [5])
    await client.post(INST, data=_inst_form(due[0].id, "IP555555"), headers=_member_headers(member))
    headers = await _admin_headers_login(client)
    assert (await client.get("/api/admin/payment-verifications/pending-count", headers=headers)).json() == {
        "installment": 1, "cost_share": 1, "total": 2}
