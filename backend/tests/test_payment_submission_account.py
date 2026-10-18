"""Payments must reference an ACTIVE account that matches their method type,
and store id + snapshot so history survives later edits/deactivation."""

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.admin import AdminRole, AdminUser
from app.models.installment import Installment, InstallmentStatus
from app.models.installment_payment import InstallmentPayment
from app.models.member import Member
from app.models.payment_account import PaymentAccount
from app.services.payment_accounts import account_snapshot

pytestmark = pytest.mark.asyncio


async def _seed_admin_headers(db_session: AsyncSession) -> dict[str, str]:
    admin = AdminUser(
        email="approver@example.com",
        password_hash=hash_password("pass12345"),
        name="Admin",
        role=AdminRole.SUPER_ADMIN,
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)
    return {"Authorization": f"Bearer {create_access_token(str(admin.id), 'super_admin')}"}


async def _seed_member(db_session: AsyncSession, email: str = "payer@example.com") -> tuple[Member, dict[str, str]]:
    member = Member(
        status="approved",
        full_name="Payer",
        father_or_husband="father",
        mother="mother",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="job",
        nid="1234567890",
        mobile="01700000001",
        gender="male",
        email=email,
        admission_fee="500",
        subscription="100",
        receipt_no="r",
        payment_method="cash",
        submission_date="2026-01-01",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)
    return member, {"Authorization": f"Bearer {create_access_token(str(member.id), 'member')}"}


async def _seed_bank_account(db_session: AsyncSession, *, active: bool = True) -> PaymentAccount:
    account = PaymentAccount(
        type="bank",
        status="active" if active else "inactive",
        display_order=0,
        label="Seed bank",
        bank_name="ABC Bank",
        branch_name="Main",
        account_name="Society",
        account_number="987654321",
        routing_number="060276537",
    )
    db_session.add(account)
    await db_session.commit()
    await db_session.refresh(account)
    return account


async def _seed_due_installment(db_session: AsyncSession, member: Member) -> Installment:
    installment = Installment(
        member_id=member.id,
        year=2026,
        month=1,
        amount=100,
        status=InstallmentStatus.DUE,
    )
    db_session.add(installment)
    await db_session.commit()
    await db_session.refresh(installment)
    return installment


async def _submit_bank_payment(
    client: AsyncClient, headers: dict[str, str], installment_id: int, account_id: int | None, ref: str
) -> AsyncClient:
    data: dict[str, str] = {
        "installment_ids": str(installment_id),
        "method": "bank",
        "transaction_ref": ref,
        "paid_on": date.today().isoformat(),
    }
    if account_id is not None:
        data["payment_account_id"] = str(account_id)
    return await client.post("/api/member/installment-payments", headers=headers, data=data)


async def test_submission_with_inactive_account_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    member, headers = await _seed_member(db_session)
    installment = await _seed_due_installment(db_session, member)
    account = await _seed_bank_account(db_session, active=False)
    response = await _submit_bank_payment(client, headers, installment.id, account.id, "TRXINACT1")
    assert response.status_code == 422
    assert "PAYMENT_ACCOUNT_INACTIVE" in str(response.json())


async def test_submission_with_mismatched_type_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    member, headers = await _seed_member(db_session)
    installment = await _seed_due_installment(db_session, member)
    account = await _seed_bank_account(db_session)
    # The member names a bank account while claiming the mobile-banking method.
    data = {
        "installment_ids": str(installment.id),
        "method": "bkash",
        "transaction_ref": "TRXMISMATCH",
        "paid_on": date.today().isoformat(),
        "payment_account_id": str(account.id),
    }
    response = await client.post("/api/member/installment-payments", headers=headers, data=data)
    assert response.status_code == 422
    assert "PAYMENT_ACCOUNT_TYPE_MISMATCH" in str(response.json())


async def test_submission_without_account_rejected_when_method_needs_one(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Bank/MFS payments without any account to pay into are rejected rather
    than silently accepted with no destination."""
    member, headers = await _seed_member(db_session)
    installment = await _seed_due_installment(db_session, member)
    await _seed_bank_account(db_session)  # an active bank account exists
    response = await _submit_bank_payment(client, headers, installment.id, None, "TRXNOACCT")
    assert response.status_code == 422
    assert "PAYMENT_ACCOUNT_REQUIRED" in str(response.json())


async def test_valid_submission_stores_account_id_and_snapshot(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    member, headers = await _seed_member(db_session)
    installment = await _seed_due_installment(db_session, member)
    account = await _seed_bank_account(db_session)

    response = await _submit_bank_payment(client, headers, installment.id, account.id, "TRXSNAP1")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["payment_account_snapshot"] == account_snapshot(account)

    stored = await db_session.get(InstallmentPayment, body["id"])
    assert stored.payment_account_id == account.id
    assert stored.payment_account_snapshot == account_snapshot(account)


async def test_editing_account_does_not_change_old_snapshot(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    member, headers = await _seed_member(db_session)
    installment = await _seed_due_installment(db_session, member)
    account = await _seed_bank_account(db_session)

    created = await _submit_bank_payment(client, headers, installment.id, account.id, "TRXEDIT1")
    assert created.status_code == 201
    snapshot_at_submission = created.json()["payment_account_snapshot"]

    admin_headers = await _seed_admin_headers(db_session)
    updated = await client.put(
        f"/api/admin/payment-accounts/{account.id}",
        headers=admin_headers,
        json={"bank_name": "Renamed Bank", "account_number": "987654999"},
    )
    assert updated.status_code == 200, updated.text

    stored = await db_session.get(InstallmentPayment, created.json()["id"])
    # History is frozen: the edit must not touch the stored snapshot.
    assert stored.payment_account_snapshot == snapshot_at_submission
