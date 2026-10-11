"""Module 4 — তহবিল নিয়ন্ত্রণ ও অডিট: income-source policy, two-person
expense approval, bank signatories, annual audit reports + reminder window,
and the সদস্যকল্যাণ তহবিল welfare-request flow (no auto-approval anywhere).
"""

from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select as sa_select

from app.api.routes import fund_controls as fund_controls_routes
from app.core.security import create_access_token, hash_password
from app.models.admin import AdminRole, AdminUser
from app.models.config_list_item import ConfigListItem
from app.models.fund_controls import BankSignatory, WelfareFundRequest
from app.models.member import Member, MemberStatus
from app.services.governance import (
    DEFAULT_EXPENSE_TWO_PERSON_THRESHOLD,
    audit_reminder_state,
    fiscal_year_for,
)

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture(autouse=True)
async def fast_email(monkeypatch):
    """Skip SMTP retries in every test."""
    sent = {"value": True}

    async def _instant_send(**kwargs):
        return True

    monkeypatch.setattr(fund_controls_routes, "send_email", _instant_send)
    return sent


async def _seed_categories(db_session) -> dict[str, ConfigListItem]:
    items = {}
    seeds = [
        ("finance_income_category", "চাঁদা"),
        ("finance_expense_category", "বিদ্যুৎ বিল"),
    ]
    for sort, (category, label) in enumerate(seeds):
        item = ConfigListItem(category=category, value=label, label=label, sort_order=sort)
        db_session.add(item)
        items[label] = item
    await db_session.commit()
    for item in items.values():
        await db_session.refresh(item)
    return items


_member_seq = {"n": 0}


async def _member(db_session, *, email="member@x.com") -> Member:
    _member_seq["n"] += 1
    member = Member(
        status=MemberStatus.APPROVED,
        member_id=f"UKAMKS-{90 + _member_seq['n']}",
        full_name="কামরুল হাসান",
        father_or_husband="Father",
        mother="Mother",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="Job",
        nid="1234567890",
        mobile="01758290411",
        gender="পুরুষ",
        email=email,
        admission_fee="500",
        subscription="100",
        receipt_no="R-1",
        payment_method="Cash",
        submission_date="2026-01-01",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)
    return member


async def _admin(db_session, *, email, role=AdminRole.EXECUTIVE_COMMITTEE) -> AdminUser:
    admin = AdminUser(
        email=email,
        password_hash=hash_password("pass12345"),
        name=f"Admin {email}",
        role=role,
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)
    return admin


def _headers(account_id: int | str, role: str) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(account_id), role)}"}


async def _create_txn(client, headers, categories, **overrides) -> dict:
    payload = {
        "txn_date": "2026-10-05",
        "type": "income",
        "category_id": categories["চাঁদা"].id,
        "amount": "20000.00",
        "description": "অক্টোবর মাসের চাঁদা",
    }
    payload.update(overrides)
    response = await client.post("/api/admin/finance/transactions", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def _attach_receipt(client, headers, txn_id: int) -> None:
    response = await client.put(
        f"/api/admin/finance/transactions/{txn_id}/attachment",
        files={"file": ("receipt.pdf", b"%PDF-1.4 receipt", "application/pdf")},
        headers=headers,
    )
    assert response.status_code == 200, response.text


# ---------------------------------------------------------------------------
# Income-source policy
# ---------------------------------------------------------------------------


async def test_unknown_income_source_is_409(client, db_session, admin_user):
    categories = await _seed_categories(db_session)
    headers = _headers(admin_user.id, "executive_committee")
    response = await client.post(
        "/api/admin/finance/transactions",
        json={
            "txn_date": "2026-10-05",
            "type": "income",
            "category_id": categories["চাঁদা"].id,
            "amount": "5000.00",
            "description": "চাঁদা",
            "income_source": "casino_profits",
        },
        headers=headers,
    )
    assert response.status_code == 409
    assert "income source" in response.json()["detail"].lower()


async def test_other_income_requires_justification(client, db_session, admin_user):
    categories = await _seed_categories(db_session)
    headers = _headers(admin_user.id, "executive_committee")
    base = {
        "txn_date": "2026-10-05",
        "type": "income",
        "category_id": categories["চাঁদা"].id,
        "amount": "5000.00",
        "description": "বিক্রির আয়",
        "income_source": "other_income",
    }
    blocked = await client.post("/api/admin/finance/transactions", json=base, headers=headers)
    assert blocked.status_code == 409
    assert "যুক্তি" in blocked.json()["detail"]

    ok = await client.post(
        "/api/admin/finance/transactions",
        json={**base, "income_justification": "পুরাতন চেয়ার বিক্রির আয়"},
        headers=headers,
    )
    assert ok.status_code == 201
    assert ok.json()["income_source"] == "other_income"

    # A plain constitutional source needs no justification.
    plain = await client.post(
        "/api/admin/finance/transactions",
        json={**base, "income_source": "subscription"},
        headers=headers,
    )
    assert plain.status_code == 201


async def test_foreign_funding_requires_government_approval_ref(client, db_session, admin_user):
    categories = await _seed_categories(db_session)
    headers = _headers(admin_user.id, "executive_committee")
    base = {
        "txn_date": "2026-10-05",
        "type": "income",
        "category_id": categories["চাঁদা"].id,
        "amount": "9000.00",
        "description": "বিদেশি অনুদান",
        "income_source": "donation",
        "is_foreign_funding": True,
    }
    blocked = await client.post("/api/admin/finance/transactions", json=base, headers=headers)
    assert blocked.status_code == 409
    assert "বিদেশি অর্থায়ন" in blocked.json()["detail"]

    allowed = await client.post(
        "/api/admin/finance/transactions",
        json={**base, "government_approval_ref": "GOV/2026/119"},
        headers=headers,
    )
    assert allowed.status_code == 201, allowed.text
    assert allowed.json()["government_approval_ref"] == "GOV/2026/119"

    # Non-foreign with a ref is fine (e.g. correcting the flag later).
    non_foreign = await client.post(
        "/api/admin/finance/transactions",
        json={**base, "is_foreign_funding": False, "government_approval_ref": "GOV/2026/120"},
        headers=headers,
    )
    assert non_foreign.status_code == 201

    # Flipping the flag on an existing income row via PATCH enforces the rule
    # against the merged row.
    txn = allowed.json()
    blocked_patch = await client.patch(
        f"/api/admin/finance/transactions/{txn['id']}",
        json={"government_approval_ref": None},
        headers=headers,
    )
    assert blocked_patch.status_code == 409


async def test_income_source_fields_rejected_on_expense(client, db_session, admin_user):
    categories = await _seed_categories(db_session)
    headers = _headers(admin_user.id, "executive_committee")
    response = await client.post(
        "/api/admin/finance/transactions",
        json={
            "txn_date": "2026-10-05",
            "type": "expense",
            "category_id": categories["বিদ্যুৎ বিল"].id,
            "amount": "1000.00",
            "description": "বিদ্যুৎ বিল",
            "income_source": "subscription",
        },
        headers=headers,
    )
    assert response.status_code == 422  # model validator rejects it


# ---------------------------------------------------------------------------
# Two-person expense approval
# ---------------------------------------------------------------------------


async def test_settings_default_threshold_and_update(client, db_session, admin_user):
    headers = _headers(admin_user.id, "executive_committee")
    body = (await client.get("/api/admin/fund-controls/settings", headers=headers)).json()
    assert Decimal(body["expense_two_person_threshold"]) == Decimal(
        str(DEFAULT_EXPENSE_TWO_PERSON_THRESHOLD)
    )
    assert body["threshold_is_default"] is True
    assert {src["key"] for src in body["income_sources"]} >= {"subscription", "other_income"}

    updated = await client.put(
        "/api/admin/fund-controls/settings",
        json={"expense_two_person_threshold": "25000.00"},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["expense_two_person_threshold"] == "25000.00"
    assert body["threshold_is_default"] is False

    invalid = await client.put(
        "/api/admin/fund-controls/settings",
        json={"expense_two_person_threshold": "0"},
        headers=headers,
    )
    assert invalid.status_code == 422


async def test_expense_below_threshold_one_approval_suffices(client, db_session, admin_user):
    categories = await _seed_categories(db_session)
    creator = await _admin(db_session, email="creator@x.com")
    approver = await _admin(db_session, email="approver@x.com")
    txn = await _create_txn(
        client,
        _headers(creator.id, "executive_committee"),
        categories,
        type="expense",
        category_id=categories["বিদ্যুৎ বিল"].id,
        amount="40000.00",
        description="ছোট ব্যয়",
    )
    await _attach_receipt(client, _headers(creator.id, "executive_committee"), txn["id"])
    approved = await client.post(
        f"/api/admin/finance/transactions/{txn['id']}/approve",
        headers=_headers(approver.id, "executive_committee"),
    )
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert body["status"] == "approved"
    assert body["requires_secondary"] is False


async def test_expense_above_threshold_needs_second_approval(client, db_session, admin_user):
    categories = await _seed_categories(db_session)
    creator = await _admin(db_session, email="creator@x.com")
    first = await _admin(db_session, email="first@x.com")
    second = await _admin(db_session, email="second@x.com")
    txn = await _create_txn(
        client,
        _headers(creator.id, "executive_committee"),
        categories,
        type="expense",
        category_id=categories["বিদ্যুৎ বিল"].id,
        amount="75000.00",
        description="বড় ব্যয়",
    )
    await _attach_receipt(client, _headers(creator.id, "executive_committee"), txn["id"])

    first_response = await client.post(
        f"/api/admin/finance/transactions/{txn['id']}/approve",
        headers=_headers(first.id, "executive_committee"),
    )
    assert first_response.status_code == 200, first_response.text
    body = first_response.json()
    assert body["status"] == "pending"
    assert body["requires_secondary"] is True
    assert body["approved_by_name"].startswith("Admin first")

    # The first approver cannot also sign as the second.
    same = await client.post(
        f"/api/admin/finance/transactions/{txn['id']}/secondary-approve",
        headers=_headers(first.id, "executive_committee"),
    )
    assert same.status_code == 409

    done = await client.post(
        f"/api/admin/finance/transactions/{txn['id']}/secondary-approve",
        headers=_headers(second.id, "executive_committee"),
    )
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["status"] == "approved"
    assert body["requires_secondary"] is False
    assert body["second_approved_by_name"].startswith("Admin second")

    # A fully approved row cannot be secondary-approved again.
    again = await client.post(
        f"/api/admin/finance/transactions/{txn['id']}/secondary-approve",
        headers=_headers(second.id, "executive_committee"),
    )
    assert again.status_code == 409


async def test_expense_approve_requires_receipt(client, db_session, admin_user):
    categories = await _seed_categories(db_session)
    creator = await _admin(db_session, email="creator@x.com")
    approver = await _admin(db_session, email="approver@x.com")
    txn = await _create_txn(
        client,
        _headers(creator.id, "executive_committee"),
        categories,
        type="expense",
        category_id=categories["বিদ্যুৎ বিল"].id,
        amount="3000.00",
    )
    blocked = await client.post(
        f"/api/admin/finance/transactions/{txn['id']}/approve",
        headers=_headers(approver.id, "executive_committee"),
    )
    assert blocked.status_code == 409
    assert "রসিদ/ভাউচার" in blocked.json()["detail"]

    # Income approvals never need a receipt.
    income = await _create_txn(client, _headers(creator.id, "executive_committee"), categories)
    approved = await client.post(
        f"/api/admin/finance/transactions/{income['id']}/approve",
        headers=_headers(approver.id, "executive_committee"),
    )
    assert approved.status_code == 200


async def test_secondary_approve_requires_permission(client, db_session, admin_user):
    categories = await _seed_categories(db_session)
    creator = await _admin(db_session, email="creator@x.com")
    first = await _admin(db_session, email="first@x.com")
    txn = await _create_txn(
        client,
        _headers(creator.id, "executive_committee"),
        categories,
        type="expense",
        category_id=categories["বিদ্যুৎ বিল"].id,
        amount="90000.00",
    )
    await _attach_receipt(client, _headers(creator.id, "executive_committee"), txn["id"])
    await client.post(
        f"/api/admin/finance/transactions/{txn['id']}/approve",
        headers=_headers(first.id, "executive_committee"),
    )
    # A plain member token has no admin-tier access to the endpoint at all.
    member = await _member(db_session)
    denied = await client.post(
        f"/api/admin/finance/transactions/{txn['id']}/secondary-approve",
        headers=_headers(member.id, "member"),
    )
    assert denied.status_code == 403


# ---------------------------------------------------------------------------
# Bank signatories
# ---------------------------------------------------------------------------


async def test_signatory_crud_masks_account_number(client, db_session, admin_user):
    member = await _member(db_session)
    headers = _headers(admin_user.id, "executive_committee")
    created = await client.post(
        "/api/admin/fund-controls/signatories",
        json={
            "member_id": member.id,
            "bank_name": "সোনালী ব্যাংক",
            "branch": "উত্তর কাউন্দিয়া শাখা",
            "account_name": "উত্তর কাউন্দিয়া আবাসন মালিক কল্যাণ সোসাইটি",
            "account_number_last4": "4521",
            "authority_scope": "joint - কোষাধ্যক্ষ ও সভাপতি",
            "valid_from": "2026-01-01",
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["account_number_masked"] == "4521"
    assert body["member_name"] == "কামরুল হাসান"

    row = (
        await db_session.execute(sa_select(BankSignatory).where(BankSignatory.id == body["id"]))
    ).scalar_one()
    # The full number is NEVER stored - the column only holds the last 4.
    assert row.account_number_masked == "4521"

    updated = await client.patch(
        f"/api/admin/fund-controls/signatories/{body['id']}",
        json={"branch": "নতুন শাখা"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["branch"] == "নতুন শাখা"

    listed = await client.get("/api/admin/fund-controls/signatories", headers=headers)
    assert any(item["id"] == body["id"] for item in listed.json())

    deactivated = await client.request(
        "DELETE",
        f"/api/admin/fund-controls/signatories/{body['id']}",
        json={"reason": "টেনিউর শেষ"},
        headers=headers,
    )
    assert deactivated.status_code == 204
    listed = await client.get("/api/admin/fund-controls/signatories", headers=headers)
    assert all(item["id"] != body["id"] for item in listed.json())
    listed = await client.get(
        "/api/admin/fund-controls/signatories?include_inactive=true", headers=headers
    )
    assert any(item["id"] == body["id"] and not item["is_active"] for item in listed.json())


async def test_signatory_member_read_and_bank_letter_pdf(client, db_session, admin_user):
    member = await _member(db_session)
    headers = _headers(admin_user.id, "executive_committee")
    await client.post(
        "/api/admin/fund-controls/signatories",
        json={
            "member_id": member.id,
            "bank_name": "সোনালী ব্যাংক",
            "branch": "উত্তর কাউন্দিয়া",
            "account_name": "উকামাকিসো",
            "account_number_last4": "7788",
            "valid_from": "2026-01-01",
        },
        headers=headers,
    )
    member_view = await client.get(
        "/api/member/fund-controls/signatories", headers=_headers(member.id, "member")
    )
    assert member_view.status_code == 200
    items = member_view.json()
    assert len(items) == 1
    assert items[0]["account_number_masked"] == "7788"

    letter = await client.get(
        "/api/admin/fund-controls/signatories/bank-letter.pdf", headers=headers
    )
    assert letter.status_code == 200
    assert letter.headers["content-type"] == "application/pdf"
    assert letter.content[:5] == b"%PDF-"


# ---------------------------------------------------------------------------
# Annual audit reports + reminder window
# ---------------------------------------------------------------------------


async def test_fiscal_year_helper():
    assert fiscal_year_for(date(2026, 7, 1)) == "2026-27"
    assert fiscal_year_for(date(2026, 6, 30)) == "2025-26"
    assert fiscal_year_for(date(2026, 10, 11)) == "2026-27"
    assert fiscal_year_for(date(2025, 12, 31)) == "2025-26"


async def test_audit_reminder_window_logic():
    # June (month 6): always active, for the FY closing this June 30.
    state = audit_reminder_state(date(2026, 6, 15), report_exists=True)
    assert state == {"fiscal_year": "2025-26", "reminder_window_active": True}
    state = audit_reminder_state(date(2026, 6, 15), report_exists=False)
    assert state["reminder_window_active"] is True

    # July onwards: active only while the just-ended FY lacks a report.
    state = audit_reminder_state(date(2026, 7, 5), report_exists=False)
    assert state == {"fiscal_year": "2025-26", "reminder_window_active": True}
    state = audit_reminder_state(date(2026, 10, 11), report_exists=False)
    assert state == {"fiscal_year": "2025-26", "reminder_window_active": True}
    state = audit_reminder_state(date(2026, 10, 11), report_exists=True)
    assert state["reminder_window_active"] is False

    # Jan-May: active only while the PREVIOUS June's FY lacks a report.
    state = audit_reminder_state(date(2027, 2, 1), report_exists=False)
    assert state == {"fiscal_year": "2025-26", "reminder_window_active": True}
    state = audit_reminder_state(date(2027, 2, 1), report_exists=True)
    assert state["reminder_window_active"] is False


async def test_audit_report_upload_publish_and_member_visibility(client, db_session, admin_user):
    member = await _member(db_session)
    headers = _headers(admin_user.id, "executive_committee")
    reminder = (await client.get("/api/admin/fund-controls/audit-reminder", headers=headers)).json()
    # Today (2026-10) is after the June 30 FY end; with no report the reminder
    # is active for the FY that ended this June.
    assert reminder["fiscal_year"] == "2025-26"
    assert reminder["current_fy_report_exists"] is False
    assert reminder["reminder_window_active"] is True

    upload = await client.post(
        "/api/admin/fund-controls/audit-reports",
        files={"file": ("audit-2025-26.pdf", b"%PDF-1.4 audit", "application/pdf")},
        data={
            "fiscal_year": "2025-26",
            "report_date": "2026-09-30",
            "summary_text": "হিসাব সঠিক পাওয়া গিয়েছে।",
        },
        headers=headers,
    )
    assert upload.status_code == 201, upload.text
    report = upload.json()
    assert report["fiscal_year"] == "2025-26"
    assert report["has_file"] is True

    # Re-upload replaces the file on the same row (one row per fiscal year).
    reupload = await client.post(
        "/api/admin/fund-controls/audit-reports",
        files={"file": ("audit-final.pdf", b"%PDF-1.4 final", "application/pdf")},
        data={"fiscal_year": "2025-26", "report_date": "2026-10-01"},
        headers=headers,
    )
    assert reupload.status_code == 201
    assert reupload.json()["id"] == report["id"]
    assert reupload.json()["original_name"] == "audit-final.pdf"

    # Not visible to members before publishing.
    member_list = await client.get(
        "/api/member/fund-controls/audit-reports", headers=_headers(member.id, "member")
    )
    assert member_list.json() == []

    publish_empty = await client.post(
        f"/api/admin/fund-controls/audit-reports/{report['id']}/publish", headers=headers
    )
    # A summary was supplied with the upload, so publish succeeds and creates
    # a member-visible notice.
    assert publish_empty.status_code == 200, publish_empty.text
    published = publish_empty.json()
    assert published["published_notice_id"] is not None

    member_list = await client.get(
        "/api/member/fund-controls/audit-reports", headers=_headers(member.id, "member")
    )
    assert [row["id"] for row in member_list.json()] == [report["id"]]

    download = await client.get(
        f"/api/member/fund-controls/audit-reports/{report['id']}/file",
        headers=_headers(member.id, "member"),
    )
    assert download.status_code == 200
    assert download.content[:5] == b"%PDF-"

    # With the report present, the October reminder goes quiet.
    reminder = (await client.get("/api/admin/fund-controls/audit-reminder", headers=headers)).json()
    assert reminder["current_fy_report_exists"] is False  # current FY is 2026-27
    assert reminder["reminder_window_active"] is False


# ---------------------------------------------------------------------------
# সদস্যকল্যাণ তহবিল — welfare requests
# ---------------------------------------------------------------------------


async def _apply(client, member, **overrides) -> dict:
    payload = {
        "request_type": "medical",
        "amount_requested": "5000.00",
        "reason": "জরুরি চিকিৎসা ব্যয়",
    }
    payload.update(overrides)
    response = await client.post(
        "/api/member/welfare-fund/requests", json=payload, headers=_headers(member.id, "member")
    )
    return response


async def test_welfare_request_full_flow(client, db_session, admin_user):
    member = await _member(db_session)
    reviewer = await _admin(db_session, email="reviewer@x.com")
    admin_headers = _headers(reviewer.id, "executive_committee")

    created = await _apply(client, member)
    assert created.status_code == 201, created.text
    request = created.json()
    assert request["request_no"].startswith("KRMF-WF-2026-")
    assert request["status"] == "submitted"

    # One open request at a time.
    duplicate = await _apply(client, member)
    assert duplicate.status_code == 409
    assert "একই সময়ে" in duplicate.json()["detail"]

    # Reason is mandatory on both decisions.
    no_reason = await client.post(
        f"/api/admin/fund-controls/welfare-requests/{request['id']}/decide",
        json={"decision": "approved", "committee_reason": "  ", "approved_amount": "4000.00"},
        headers=admin_headers,
    )
    assert no_reason.status_code == 409

    # Approving more than requested is blocked.
    too_much = await client.post(
        f"/api/admin/fund-controls/welfare-requests/{request['id']}/decide",
        json={"decision": "approved", "committee_reason": "কমিটির সিদ্ধান্ত", "approved_amount": "6000.00"},
        headers=admin_headers,
    )
    assert too_much.status_code == 409
    assert "বেশি হতে পারে না" in too_much.json()["detail"]

    # Approval without an amount is blocked.
    no_amount = await client.post(
        f"/api/admin/fund-controls/welfare-requests/{request['id']}/decide",
        json={"decision": "approved", "committee_reason": "কমিটির সিদ্ধান্ত"},
        headers=admin_headers,
    )
    assert no_amount.status_code == 409

    decided = await client.post(
        f"/api/admin/fund-controls/welfare-requests/{request['id']}/decide",
        json={"decision": "approved", "committee_reason": "কমিটি ৪০০০ টাকা অনুমোদন করেছে", "approved_amount": "4000.00"},
        headers=admin_headers,
    )
    assert decided.status_code == 200, decided.text
    body = decided.json()
    assert body["status"] == "approved"
    assert body["approved_amount"] == "4000.00"

    # No double decisions.
    again = await client.post(
        f"/api/admin/fund-controls/welfare-requests/{request['id']}/decide",
        json={"decision": "rejected", "committee_reason": "x"},
        headers=admin_headers,
    )
    assert again.status_code == 409

    # Disburse (optionally linking the payout ledger row).
    disbursed = await client.post(
        f"/api/admin/fund-controls/welfare-requests/{request['id']}/disburse",
        json={},
        headers=admin_headers,
    )
    assert disbursed.status_code == 200
    assert disbursed.json()["status"] == "disbursed"
    assert disbursed.json()["disbursed_at"] is not None

    # The decision letter PDF is available after a decision.
    letter = await client.get(
        f"/api/member/welfare-fund/requests/{request['id']}/decision-letter.pdf",
        headers=_headers(member.id, "member"),
    )
    assert letter.status_code == 200
    assert letter.content[:5] == b"%PDF-"


async def test_welfare_request_open_block_clears_after_rejection(client, db_session, admin_user):
    member = await _member(db_session)
    reviewer = await _admin(db_session, email="reviewer@x.com")
    admin_headers = _headers(reviewer.id, "executive_committee")

    first = await _apply(client, member, request_type="education")
    assert first.status_code == 201

    review = await client.post(
        f"/api/admin/fund-controls/welfare-requests/{first.json()['id']}/start-review",
        headers=admin_headers,
    )
    assert review.status_code == 200
    assert review.json()["status"] == "under_review"

    rejected = await client.post(
        f"/api/admin/fund-controls/welfare-requests/{first.json()['id']}/decide",
        json={"decision": "rejected", "committee_reason": "প্রয়োজনীয় কাগজপত্র অনুপস্থিত"},
        headers=admin_headers,
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"

    # The open block is cleared; a new application works.
    second = await _apply(client, member, request_type="emergency", amount_requested="2000.00")
    assert second.status_code == 201, second.text


async def test_welfare_request_privacy(client, db_session, admin_user):
    owner = await _member(db_session, email="owner@x.com")
    other = await _member(db_session, email="other@x.com")
    created = await _apply(client, owner)
    request_id = created.json()["id"]

    forbidden = await client.get(
        f"/api/member/welfare-fund/requests/{request_id}",
        headers=_headers(other.id, "member"),
    )
    assert forbidden.status_code == 403

    letter = await client.get(
        f"/api/member/welfare-fund/requests/{request_id}/decision-letter.pdf",
        headers=_headers(other.id, "member"),
    )
    assert letter.status_code == 403

    # Undecided requests have no decision letter yet.
    letter = await client.get(
        f"/api/member/welfare-fund/requests/{request_id}/decision-letter.pdf",
        headers=_headers(owner.id, "member"),
    )
    assert letter.status_code == 409


async def test_welfare_admin_list_filters_by_status(client, db_session, admin_user):
    member = await _member(db_session)
    reviewer = await _admin(db_session, email="reviewer@x.com")
    await _apply(client, member)
    listed = await client.get(
        "/api/admin/fund-controls/welfare-requests?status=submitted",
        headers=_headers(reviewer.id, "executive_committee"),
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["member_name"] == "কামরুল হাসান"
