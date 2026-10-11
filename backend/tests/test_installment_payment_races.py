"""Approval must not overwrite installments paid meanwhile."""

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment import Installment, InstallmentStatus
from tests.test_installment_payments import (
    URL,
    _admin_headers,
    _form,
    _seed_accounts,
    _seed_admin,
    _seed_due,
    _seed_member,
)

pytestmark = pytest.mark.asyncio


async def test_approve_conflicts_when_installment_paid_meanwhile(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _seed_accounts(db_session)
    admin = await _seed_admin(db_session)
    member = await _seed_member(db_session, "race1@example.com")
    due = await _seed_due(db_session, member, [3, 4])
    from tests.test_installment_payments import _member_headers

    created = await client.post(URL, data=_form([d.id for d in due]), headers=_member_headers(member))
    manual_paid_at = datetime(2026, 1, 5, tzinfo=timezone.utc)
    row = await db_session.get(Installment, due[0].id)
    row.status = InstallmentStatus.PAID
    row.paid_at = manual_paid_at
    await db_session.commit()

    response = await client.post(
        f"/api/admin/installment-payments/{created.json()['id']}/approve", headers=_admin_headers(admin)
    )

    assert response.status_code == 409
    rows = {
        r.id: r
        for r in (
            await db_session.execute(
                select(Installment)
                .where(Installment.member_id == member.id)
                .execution_options(populate_existing=True)
            )
        ).scalars()
    }
    assert rows[due[1].id].status == InstallmentStatus.DUE
    assert rows[due[0].id].paid_at.replace(tzinfo=timezone.utc) == manual_paid_at


async def test_rejected_payment_reference_can_be_resubmitted(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from tests.test_installment_payments import _member_headers

    await _seed_accounts(db_session)
    admin = await _seed_admin(db_session)
    member = await _seed_member(db_session, "reuse@example.com")
    due = await _seed_due(db_session, member, [6])
    first = await client.post(URL, data=_form([due[0].id], ref="TRXREUSE1"), headers=_member_headers(member))
    await client.post(
        f"/api/admin/installment-payments/{first.json()['id']}/reject",
        json={"reason": "Wrong amount"},
        headers=_admin_headers(admin),
    )

    resubmit = await client.post(URL, data=_form([due[0].id], ref="TRXREUSE1"), headers=_member_headers(member))
    duplicate = await client.post(URL, data=_form([due[0].id], ref="TRXREUSE1"), headers=_member_headers(member))

    assert resubmit.status_code == 201
    # A live (pending/approved) payment still blocks the same reference.
    assert duplicate.status_code == 409
