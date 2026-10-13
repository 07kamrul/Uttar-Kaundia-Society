"""Batch 2/3 migrations: chain, single head, upgrade/downgrade."""

import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory

VERSIONS = Path(__file__).resolve().parent.parent / "alembic" / "versions"


def _load(prefix: str):
    path = next(VERSIONS.glob(f"{prefix}_*.py"))
    spec = importlib.util.spec_from_file_location(f"mig_{prefix}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_chain_and_single_head() -> None:
    cost_share, app_settings = _load("d2f6b0a4c8e1"), _load("e3a7c1b5d9f2")
    assert cost_share.down_revision == "c1e5a9d3b7f4"
    assert app_settings.down_revision == "d2f6b0a4c8e1"
    assert ScriptDirectory(str(VERSIONS.parent)).get_heads() == ["e3a7c1b5d9f2"]


def _run(engine, fn) -> None:
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            fn()


@pytest.mark.parametrize(
    "prefix,table", [("d2f6b0a4c8e1", "cost_share_payments"), ("e3a7c1b5d9f2", "app_settings")]
)
def test_upgrade_downgrade(prefix: str, table: str) -> None:
    module = _load(prefix)
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE admin_users (id INTEGER PRIMARY KEY)"))
        conn.execute(sa.text("CREATE TABLE members (id INTEGER PRIMARY KEY)"))
        conn.execute(sa.text("CREATE TABLE cost_split_shares (id INTEGER PRIMARY KEY)"))
    _run(engine, module.upgrade)
    assert table in sa.inspect(engine).get_table_names()
    _run(engine, module.downgrade)
    assert table not in sa.inspect(engine).get_table_names()
