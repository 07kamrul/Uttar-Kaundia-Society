"""Batch 5: canned reject reasons seeded as config-list rows (migration
f5b8d2a6c1e7): chained after app_settings, idempotent, reversible, and readable
through the public config-list endpoint."""

import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from httpx import AsyncClient

from app.models.config_list_item import ConfigListItem

VERSIONS = Path(__file__).resolve().parent.parent / "alembic" / "versions"
REVISION = "f5b8d2a6c1e7"

EXPECTED = {
    "reject_reason_payment": ["TrxID মিলছে না", "টাকার পরিমাণ মিলছে না", "স্ক্রিনশট অস্পষ্ট", "ডুপ্লিকেট পেমেন্ট"],
    "reject_reason_application": ["কাগজপত্র অস্পষ্ট", "খতিয়ান/দাগ মিলছে না", "ছবি স্পষ্ট নয়", "ডুপ্লিকেট আবেদন"],
    "reject_reason_property_request": ["কাগজপত্র অস্পষ্ট", "তথ্য মিলছে না"],
    "reject_reason_boundary": ["সীমানা দাগের সাথে মিলছে না", "অন্য সীমানার উপর পড়েছে"],
}


def _load():
    path = next(VERSIONS.glob(f"{REVISION}_*.py"))
    spec = importlib.util.spec_from_file_location("mig_reject_reasons", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run(engine, fn) -> None:
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            fn()


def _engine():
    engine = sa.create_engine("sqlite://")
    ConfigListItem.__table__.create(engine)
    return engine


def _rows(engine) -> list[tuple[str, str, str, int, int]]:
    with engine.connect() as conn:
        return [
            tuple(r)
            for r in conn.execute(
                sa.text(
                    "SELECT category, value, label, sort_order, is_active FROM config_list_items "
                    "ORDER BY category, sort_order"
                )
            )
        ]


def test_chained_after_app_settings_and_is_the_single_head() -> None:
    assert _load().down_revision == "e3a7c1b5d9f2"
    assert ScriptDirectory(str(VERSIONS.parent)).get_heads() == ["b9d3f7a2c4e6"]


def test_upgrade_seeds_every_reason_in_order_and_active() -> None:
    engine = _engine()

    _run(engine, _load().upgrade)

    rows = _rows(engine)
    assert len(rows) == sum(len(v) for v in EXPECTED.values())
    for category, values in EXPECTED.items():
        seeded = [r for r in rows if r[0] == category]
        assert [r[1] for r in seeded] == values
        assert [r[2] for r in seeded] == values  # label == value, like the older seeds
        assert [r[3] for r in seeded] == list(range(len(values)))
        assert all(r[4] == 1 for r in seeded)


def test_upgrade_is_idempotent_and_keeps_admin_edits() -> None:
    engine = _engine()
    module = _load()
    _run(engine, module.upgrade)
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "UPDATE config_list_items SET label = 'edited', is_active = 0 "
                "WHERE category = 'reject_reason_payment' AND value = 'স্ক্রিনশট অস্পষ্ট'"
            )
        )

    _run(engine, module.upgrade)

    rows = _rows(engine)
    assert len(rows) == sum(len(v) for v in EXPECTED.values())
    edited = [r for r in rows if r[1] == "স্ক্রিনশট অস্পষ্ট"][0]
    assert (edited[2], edited[4]) == ("edited", 0)


def test_upgrade_does_not_touch_existing_rows_with_the_same_value_elsewhere() -> None:
    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO config_list_items (category, value, label, sort_order, is_active) "
                "VALUES ('reject_reason_payment', 'TrxID মিলছে না', 'my wording', 9, 1)"
            )
        )

    _run(engine, _load().upgrade)

    mine = [r for r in _rows(engine) if r[0] == "reject_reason_payment" and r[1] == "TrxID মিলছে না"]
    assert mine == [("reject_reason_payment", "TrxID মিলছে না", "my wording", 9, 1)]


def test_downgrade_removes_only_the_seeded_values() -> None:
    engine = _engine()
    module = _load()
    _run(engine, module.upgrade)
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO config_list_items (category, value, label, sort_order, is_active) VALUES "
                "('reject_reason_payment', 'আমার কারণ', 'আমার কারণ', 5, 1), "
                "('property_type', 'জমি', 'জমি', 0, 1)"
            )
        )

    _run(engine, module.downgrade)

    assert [(r[0], r[1]) for r in _rows(engine)] == [
        ("property_type", "জমি"),
        ("reject_reason_payment", "আমার কারণ"),
    ]


@pytest.mark.asyncio
async def test_public_endpoint_serves_the_seeded_reasons(client: AsyncClient, db_session) -> None:
    for position, value in enumerate(EXPECTED["reject_reason_payment"]):
        db_session.add(
            ConfigListItem(category="reject_reason_payment", value=value, label=value, sort_order=position)
        )
    await db_session.commit()

    response = await client.get("/api/public/config-lists/reject_reason_payment")

    assert response.status_code == 200
    assert [item["label"] for item in response.json()] == EXPECTED["reject_reason_payment"]
