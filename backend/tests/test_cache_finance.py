"""Finance summary cache: HIT on repeat, and fresh totals right after any
committed change - including writes that never call the explicit
invalidation helper."""

import pytest
from sqlalchemy import select

from app.models.financial_transaction import FinancialTransaction
from tests.test_finance import (
    _admin,
    _approve,
    _approved_member,
    _create,
    _headers,
    _income_payload,
    _seed_categories,
)

pytestmark = pytest.mark.asyncio

SUMMARY_URL = "/api/member/finance/summary?period=all"


async def _approved_income(client, db_session, admin_user, categories) -> int:
    creator = await _admin(db_session, email="creator@x.com")
    txn = await _create(
        client, _headers(creator.id, "executive_committee"), _income_payload(categories)
    )
    await _approve(client, _headers(admin_user.id, "executive_committee"), txn["id"])
    return txn["id"]


async def test_repeat_summary_is_a_hit_with_identical_payload(client, db_session, admin_user):
    categories = await _seed_categories(db_session)
    await _approved_income(client, db_session, admin_user, categories)
    headers = _headers((await _approved_member(db_session)).id, "member")

    first = await client.get(SUMMARY_URL, headers=headers)
    second = await client.get(SUMMARY_URL, headers=headers)

    assert (first.headers["X-Cache"], second.headers["X-Cache"]) == ("MISS", "HIT")
    assert second.json() == first.json()


async def test_direct_soft_delete_commit_refreshes_totals(client, db_session, admin_user):
    categories = await _seed_categories(db_session)
    txn_id = await _approved_income(client, db_session, admin_user, categories)
    headers = _headers((await _approved_member(db_session)).id, "member")
    assert (await client.get(SUMMARY_URL, headers=headers)).json()["totals"]["income"] == "50000.00"

    row = (
        await db_session.execute(select(FinancialTransaction).where(FinancialTransaction.id == txn_id))
    ).scalar_one()
    row.is_active = 0
    await db_session.commit()  # no explicit invalidate_summary_cache() call

    after = await client.get(SUMMARY_URL, headers=headers)
    assert after.headers["X-Cache"] == "MISS"
    assert after.json()["totals"]["income"] == "0.00"


async def test_category_rename_refreshes_breakdown_labels(client, db_session, admin_user):
    categories = await _seed_categories(db_session)
    await _approved_income(client, db_session, admin_user, categories)
    headers = _headers((await _approved_member(db_session)).id, "member")
    await client.get(SUMMARY_URL, headers=headers)

    category = categories["চাঁদা"]  # the category _income_payload books into
    category.label = "Renamed category"
    await db_session.commit()

    body = (await client.get(SUMMARY_URL, headers=headers)).json()
    labels = {row["category"] for row in body["income_by_category"] + body["expense_by_category"]}
    assert "Renamed category" in labels
