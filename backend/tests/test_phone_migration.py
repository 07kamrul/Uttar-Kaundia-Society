"""Batch 0b data migration: the pure conversion/planning functions, the
read-only dry-run report, the apply/restore helpers the migration calls, and
the migration file itself - all against throw-away in-memory SQLite engines
(never a real database)."""

import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.db.base import Base
from app.services import phone_migration as pm
from app.services.phone_migration import (
    PHONE_COLUMNS,
    Outcome,
    apply_conversion,
    collect_report,
    convert_phone,
    plan_column,
    restore_originals,
)

MIGRATION_PATH = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "b4d6f8a0c2e5_international_phones.py"
)


class TestConvertPhone:
    @pytest.mark.parametrize(
        "value,outcome,new",
        [
            ("01712345678", Outcome.CONVERTED, "+8801712345678"),
            ("8801712345678", Outcome.CONVERTED, "+8801712345678"),
            ("017-1234-5678", Outcome.CONVERTED, "+8801712345678"),
            ("০১৭১২৩৪৫৬৭৮", Outcome.CONVERTED, "+8801712345678"),
            ("0171234567", Outcome.CONVERTED, "+880171234567"),  # possible, not valid
            ("+8801712345678", Outcome.ALREADY_E164, "+8801712345678"),
            ("+966501234567", Outcome.ALREADY_E164, "+966501234567"),
            ("", Outcome.EMPTY, None),
            ("   ", Outcome.EMPTY, None),
            (None, Outcome.EMPTY, None),
            ("12345", Outcome.QUEUED, None),
            ("017123456789", Outcome.QUEUED, None),
            ("call me", Outcome.QUEUED, None),
        ],
    )
    def test_classifies_and_converts(self, value, outcome, new) -> None:
        result = convert_phone(value)
        assert result.outcome is outcome
        assert result.new_value == new


class TestPlanColumn:
    def test_counts_on_a_sample(self) -> None:
        rows = [
            (1, "01712345678", True),
            (2, "+8801812345678", True),
            (3, "12345", True),
            (4, None, True),
            (5, "", True),
            (6, "8801912345678", True),
        ]

        plan = plan_column(rows)

        assert pm.summarize(plan) == {
            "converted": 2,
            "already_e164": 1,
            "queued": 1,
            "empty": 2,
        }
        by_id = {item.row_id: item for item in plan}
        assert by_id[1].new_value == "+8801712345678"
        assert by_id[1].original == "01712345678"
        assert by_id[3].new_value is None

    def test_unique_scope_queues_a_conversion_that_collides_with_an_active_row(self) -> None:
        rows = [(1, "+8801712345678", True), (2, "01712345678", True)]

        plan = plan_column(rows, enforce_unique=True)

        by_id = {item.row_id: item for item in plan}
        assert by_id[1].outcome is Outcome.ALREADY_E164
        assert by_id[2].outcome is Outcome.QUEUED
        assert by_id[2].reason == "collision"

    def test_unique_scope_ignores_inactive_rows(self) -> None:
        rows = [(1, "+8801712345678", False), (2, "01712345678", True)]

        plan = plan_column(rows, enforce_unique=True)

        assert {i.row_id: i.outcome for i in plan}[2] is Outcome.CONVERTED

    def test_unique_scope_first_converted_row_wins(self) -> None:
        rows = [(1, "01712345678", True), (2, "8801712345678", True)]

        plan = plan_column(rows, enforce_unique=True)

        outcomes = {i.row_id: i.outcome for i in plan}
        assert outcomes == {1: Outcome.CONVERTED, 2: Outcome.QUEUED}

    def test_without_unique_scope_duplicates_are_converted(self) -> None:
        rows = [(1, "01712345678", True), (2, "8801712345678", True)]

        assert pm.summarize(plan_column(rows))["converted"] == 2


def _engine() -> sa.Engine:
    engine = sa.create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return engine


def _seed(conn: sa.Connection) -> None:
    base = dict(
        full_name="N", father_or_husband="f", mother="m", dob="1990-01-01", nationality="BD",
        occupation="o", gender="male", admission_fee="1", subscription="1", receipt_no="r",
        payment_method="c", submission_date="2026-01-01",
    )
    rows = [
        dict(id=1, status="APPROVED", nid="1111111111", mobile="01712345678", email="a@x.com",
             urgent_contact_mobile="01812345678"),
        dict(id=2, status="PENDING", nid="2222222222", mobile="12345", email="b@x.com",
             urgent_contact_mobile=None),
        dict(id=3, status="APPROVED", nid="3333333333", mobile="+966501234567", email="c@x.com",
             urgent_contact_mobile=""),
        # Collides with member 1 once converted; member 1 comes first and wins.
        dict(id=4, status="PENDING", nid="4444444444", mobile="8801712345678", email="d@x.com",
             urgent_contact_mobile="nope"),
    ]
    for row in rows:
        conn.execute(
            sa.text(
                "INSERT INTO members (id, status, full_name, father_or_husband, mother, dob, "
                "nationality, occupation, nid, mobile, gender, email, urgent_contact_mobile, "
                "admission_fee, subscription, receipt_no, payment_method, submission_date, "
                "member_class) VALUES (:id, :status, :full_name, :father_or_husband, :mother, "
                ":dob, :nationality, :occupation, :nid, :mobile, :gender, :email, "
                ":urgent_contact_mobile, :admission_fee, :subscription, :receipt_no, "
                ":payment_method, :submission_date, 'general')"
            ),
            {**base, **row},
        )
    conn.execute(sa.text("INSERT INTO nominees (id, member_id, name, relation, mobile) "
                         "VALUES (1, 1, 'n', 'son', '01912345678'), (2, 1, 'n2', 'son', 'bad')"))


class TestApplyAndDryRun:
    def test_dry_run_report_reads_without_writing(self) -> None:
        engine = _engine()
        with engine.begin() as conn:
            _seed(conn)

        with engine.connect() as conn:
            report = collect_report(conn)
            raw_cols = conn.execute(sa.text("SELECT mobile_raw FROM members")).scalars().all()

        assert report["members.mobile"] == {
            "converted": 1, "already_e164": 1, "queued": 2, "empty": 0,
        }
        assert report["members.urgent_contact_mobile"] == {
            "converted": 1, "already_e164": 0, "queued": 1, "empty": 2,
        }
        assert report["nominees.mobile"] == {
            "converted": 1, "already_e164": 0, "queued": 1, "empty": 0,
        }
        assert set(raw_cols) == {None}
        with engine.connect() as conn:
            assert conn.execute(sa.text("SELECT count(*) FROM phone_fix_queue")).scalar_one() == 0
            assert conn.execute(
                sa.text("SELECT mobile FROM members WHERE id = 1")
            ).scalar_one() == "01712345678"

    def test_apply_converts_keeps_raw_and_queues_the_rest(self) -> None:
        engine = _engine()
        with engine.begin() as conn:
            _seed(conn)
        messages: list[str] = []

        with engine.begin() as conn:
            apply_conversion(conn, log=messages.append)

        with engine.connect() as conn:
            rows = {
                r.id: r
                for r in conn.execute(
                    sa.text("SELECT id, mobile, mobile_raw, urgent_contact_mobile, "
                            "urgent_contact_mobile_raw FROM members")
                )
            }
            assert rows[1].mobile == "+8801712345678"
            assert rows[1].mobile_raw == "01712345678"
            assert rows[1].urgent_contact_mobile == "+8801812345678"
            assert rows[1].urgent_contact_mobile_raw == "01812345678"
            # Already E.164: untouched, no raw copy.
            assert rows[3].mobile == "+966501234567"
            assert rows[3].mobile_raw is None
            # Unparseable and colliding values are left unchanged.
            assert rows[2].mobile == "12345"
            assert rows[2].mobile_raw is None
            assert rows[4].mobile == "8801712345678"
            nominee = {
                r.id: r
                for r in conn.execute(sa.text("SELECT id, mobile, mobile_raw FROM nominees"))
            }
            assert nominee[1].mobile == "+8801912345678"
            assert nominee[1].mobile_raw == "01912345678"
            assert nominee[2].mobile == "bad"

            queue = conn.execute(
                sa.text("SELECT entity_type, entity_id, field, raw_value, resolved_at "
                        "FROM phone_fix_queue ORDER BY entity_type, entity_id, field")
            ).fetchall()
        assert [(q.entity_type, q.entity_id, q.field, q.raw_value) for q in queue] == [
            ("member", 2, "mobile", "12345"),
            ("member", 4, "mobile", "8801712345678"),
            ("member", 4, "urgent_contact_mobile", "nope"),
            ("nominee", 2, "mobile", "bad"),
        ]
        assert all(q.resolved_at is None for q in queue)
        assert any("members.mobile" in m and "converted" in m for m in messages)

    def test_apply_is_idempotent(self) -> None:
        engine = _engine()
        with engine.begin() as conn:
            _seed(conn)
        with engine.begin() as conn:
            apply_conversion(conn, log=lambda _m: None)
        with engine.begin() as conn:
            apply_conversion(conn, log=lambda _m: None)

        with engine.connect() as conn:
            assert conn.execute(sa.text("SELECT count(*) FROM phone_fix_queue")).scalar_one() == 4
            assert conn.execute(
                sa.text("SELECT mobile_raw FROM members WHERE id = 1")
            ).scalar_one() == "01712345678"

    def test_restore_originals_puts_raw_values_back(self) -> None:
        engine = _engine()
        with engine.begin() as conn:
            _seed(conn)
        with engine.begin() as conn:
            apply_conversion(conn, log=lambda _m: None)

        with engine.begin() as conn:
            restore_originals(conn)

        with engine.connect() as conn:
            assert conn.execute(
                sa.text("SELECT mobile FROM members WHERE id = 1")
            ).scalar_one() == "01712345678"
            assert conn.execute(
                sa.text("SELECT urgent_contact_mobile FROM members WHERE id = 1")
            ).scalar_one() == "01812345678"
            assert conn.execute(
                sa.text("SELECT mobile FROM nominees WHERE id = 1")
            ).scalar_one() == "01912345678"
            assert conn.execute(
                sa.text("SELECT mobile FROM members WHERE id = 3")
            ).scalar_one() == "+966501234567"

    def test_every_phone_column_has_a_raw_column_on_the_models(self) -> None:
        engine = _engine()
        inspector = sa.inspect(engine)
        for spec in PHONE_COLUMNS:
            names = {c["name"] for c in inspector.get_columns(spec.table)}
            assert spec.column in names
            assert spec.raw_column in names
        assert "phone_fix_queue" in inspector.get_table_names()


def _load_migration():
    spec = importlib.util.spec_from_file_location("phone_migration_rev", MIGRATION_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestMigrationFile:
    def test_revision_chain(self) -> None:
        module = _load_migration()
        assert module.revision == "b4d6f8a0c2e5"
        assert module.down_revision == "a7c3e9b1d5f2"

    def test_is_the_only_head(self) -> None:
        from alembic.script import ScriptDirectory

        script = ScriptDirectory(str(MIGRATION_PATH.parent.parent))
        assert script.get_heads() == ["a8c2e4f6b1d3"]

    def test_upgrade_then_downgrade_round_trip(self) -> None:
        """Run the real migration file on a legacy-shaped throw-away SQLite DB."""
        module = _load_migration()
        engine = sa.create_engine("sqlite://")
        with engine.begin() as conn:
            conn.execute(sa.text("CREATE TABLE admin_users (id INTEGER PRIMARY KEY)"))
            conn.execute(sa.text(
                "CREATE TABLE members (id INTEGER PRIMARY KEY, status VARCHAR, "
                "mobile VARCHAR(32), urgent_contact_mobile VARCHAR(32))"))
            conn.execute(sa.text(
                "CREATE TABLE nominees (id INTEGER PRIMARY KEY, mobile VARCHAR(32))"))
            conn.execute(sa.text(
                "CREATE TABLE co_owners (id INTEGER PRIMARY KEY, owner_phone VARCHAR(32))"))
            conn.execute(sa.text(
                "CREATE TABLE membership_applications (id INTEGER PRIMARY KEY, mobile VARCHAR(32))"))
            conn.execute(sa.text(
                "INSERT INTO members VALUES (1, 'APPROVED', '01712345678', NULL), "
                "(2, 'PENDING', 'junk', '')"))
            conn.execute(sa.text("INSERT INTO nominees VALUES (1, '01912345678')"))
            conn.execute(sa.text("INSERT INTO co_owners VALUES (1, '8801612345678')"))
            conn.execute(sa.text("INSERT INTO membership_applications VALUES (1, '01512345678')"))

        with engine.begin() as conn:
            with Operations.context(MigrationContext.configure(conn)):
                module.upgrade()

        with engine.connect() as conn:
            assert conn.execute(sa.text("SELECT mobile, mobile_raw FROM members WHERE id=1")).one() == (
                "+8801712345678", "01712345678")
            assert conn.execute(sa.text("SELECT owner_phone, owner_phone_raw FROM co_owners")).one() == (
                "+8801612345678", "8801612345678")
            assert conn.execute(sa.text("SELECT mobile FROM membership_applications")).scalar_one() == "+8801512345678"
            assert conn.execute(sa.text("SELECT entity_type, entity_id, field, raw_value "
                                        "FROM phone_fix_queue")).all() == [("member", 2, "mobile", "junk")]

        with engine.begin() as conn:
            with Operations.context(MigrationContext.configure(conn)):
                module.downgrade()

        with engine.connect() as conn:
            assert conn.execute(sa.text("SELECT mobile FROM members ORDER BY id")).scalars().all() == [
                "01712345678", "junk"]
            assert conn.execute(sa.text("SELECT owner_phone FROM co_owners")).scalar_one() == "8801612345678"
            inspector = sa.inspect(conn)
            assert "phone_fix_queue" not in inspector.get_table_names()
            for table in ("members", "nominees", "co_owners", "membership_applications"):
                assert not any(c["name"].endswith("_raw") for c in inspector.get_columns(table))


class TestDryRunCli:
    def test_refuses_to_run_without_dry_run_flag(self) -> None:
        with pytest.raises(SystemExit) as excinfo:
            pm.main([])
        assert excinfo.value.code == 2

    def test_dry_run_prints_counts_and_writes_nothing(
        self, tmp_path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        from types import SimpleNamespace

        db_file = tmp_path / "throwaway.db"
        engine = sa.create_engine(f"sqlite:///{db_file}")
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            _seed(conn)
        monkeypatch.setattr(
            "app.core.config.get_settings",
            lambda: SimpleNamespace(database_url=f"sqlite+aiosqlite:///{db_file}"),
        )

        assert pm.main(["--dry-run"]) == 0

        out = capsys.readouterr().out
        assert "members.mobile: converted=1 already_e164=1 queued=2 empty=0" in out
        assert "nothing was written" in out
        with engine.connect() as conn:
            assert conn.execute(sa.text("SELECT mobile FROM members WHERE id = 1")).scalar_one() == "01712345678"
            assert conn.execute(sa.text("SELECT count(*) FROM phone_fix_queue")).scalar_one() == 0
        engine.dispose()
