"""Conversion of stored phone numbers to E.164 (migration b4d6f8a0c2e5).

The conversion rules live here as pure Python so they are unit-testable and
importable by the Alembic migration without importing any app models; all SQL
uses lightweight `sa.table`/`sa.column` constructs.

Read-only dry run (prints the counts the migration would produce, writes
nothing)::

    python -m app.services.phone_migration --dry-run

Applying is done only by `alembic upgrade head`.
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum

import sqlalchemy as sa

from app.services.normalization import normalize_mobile, phone_status

QUEUE_TABLE = "phone_fix_queue"
_E164_SHAPE = re.compile(r"^\+\d+$")
_REJECTED_STATUS = "rejected"


class Outcome(str, Enum):
    CONVERTED = "converted"
    ALREADY_E164 = "already_e164"
    QUEUED = "queued"
    EMPTY = "empty"


OUTCOME_KEYS = tuple(outcome.value for outcome in Outcome)


@dataclass(frozen=True)
class PhoneColumn:
    """A stored phone column, its `*_raw` backup column and queue identity."""

    table: str
    column: str
    raw_column: str
    entity_type: str
    # members.mobile carries a partial unique index over non-rejected rows, so
    # its conversion must not create two active rows with the same number.
    unique_among_active: bool = False

    @property
    def key(self) -> str:
        return f"{self.table}.{self.column}"


PHONE_COLUMNS: tuple[PhoneColumn, ...] = (
    PhoneColumn("members", "mobile", "mobile_raw", "member", unique_among_active=True),
    PhoneColumn("members", "urgent_contact_mobile", "urgent_contact_mobile_raw", "member"),
    PhoneColumn("nominees", "mobile", "mobile_raw", "nominee"),
    PhoneColumn("co_owners", "owner_phone", "owner_phone_raw", "co_owner"),
    PhoneColumn("membership_applications", "mobile", "mobile_raw", "membership_application"),
)

Report = dict[str, dict[str, int]]


@dataclass(frozen=True)
class Conversion:
    outcome: Outcome
    new_value: str | None = None


@dataclass(frozen=True)
class PlanItem:
    row_id: int
    outcome: Outcome
    original: str | None
    new_value: str | None
    reason: str | None = None


def convert_phone(value: str | None) -> Conversion:
    """Classify one stored value and compute its E.164 replacement.

    Blank -> EMPTY. Already canonical E.164 -> ALREADY_E164. Anything that is
    at least a *possible* number (region BD for numbers without a country
    code) -> CONVERTED. Everything else -> QUEUED (left unchanged).
    """
    if value is None or not value.strip():
        return Conversion(Outcome.EMPTY)
    if phone_status(value) == "invalid":
        return Conversion(Outcome.QUEUED)
    e164 = normalize_mobile(value)
    if value == e164 and _E164_SHAPE.match(value):
        return Conversion(Outcome.ALREADY_E164, e164)
    return Conversion(Outcome.CONVERTED, e164)


def plan_column(
    rows: Iterable[tuple[int, str | None, bool]], *, enforce_unique: bool = False
) -> list[PlanItem]:
    """Plan the conversion of `(row_id, value, is_active)` rows.

    With `enforce_unique`, a conversion whose result is already held by
    another active row (an unchanged E.164 row, or a lower-id converted row)
    is queued instead, so the partial unique index cannot be violated.
    """
    ordered = sorted(rows, key=lambda row: row[0])
    conversions = [(row, convert_phone(row[1])) for row in ordered]
    taken: set[str] = set()
    if enforce_unique:
        taken = {
            conversion.new_value
            for (_id, _value, active), conversion in conversions
            if active and conversion.outcome is Outcome.ALREADY_E164 and conversion.new_value
        }
    items: list[PlanItem] = []
    for (row_id, value, active), conversion in conversions:
        outcome, new_value, reason = conversion.outcome, conversion.new_value, None
        if outcome is Outcome.QUEUED:
            reason = "unparseable"
        elif outcome is Outcome.CONVERTED and enforce_unique and active:
            if new_value in taken:
                outcome, new_value, reason = Outcome.QUEUED, None, "collision"
            elif new_value is not None:
                taken.add(new_value)
        items.append(PlanItem(row_id, outcome, value, new_value, reason))
    return items


def summarize(items: Iterable[PlanItem]) -> dict[str, int]:
    counts = {key: 0 for key in OUTCOME_KEYS}
    for item in items:
        counts[item.outcome.value] += 1
    return counts


def _table(spec: PhoneColumn, *, with_raw: bool = False) -> sa.TableClause:
    columns = [sa.column("id"), sa.column(spec.column)]
    if with_raw:
        columns.append(sa.column(spec.raw_column))
    if spec.unique_among_active:
        columns.append(sa.column("status"))
    return sa.table(spec.table, *columns)


def _load_rows(conn: sa.Connection, spec: PhoneColumn) -> list[tuple[int, str | None, bool]]:
    table = _table(spec)
    selected = [table.c.id, table.c[spec.column]]
    if spec.unique_among_active:
        selected.append(sa.cast(table.c.status, sa.String))
    rows = conn.execute(sa.select(*selected).order_by(table.c.id)).all()
    return [
        (
            row[0],
            row[1],
            True if not spec.unique_among_active else str(row[2]).lower() != _REJECTED_STATUS,
        )
        for row in rows
    ]


def _plan(conn: sa.Connection, spec: PhoneColumn) -> list[PlanItem]:
    return plan_column(_load_rows(conn, spec), enforce_unique=spec.unique_among_active)


def collect_report(conn: sa.Connection) -> Report:
    """Counts per column the migration would produce. Only SELECTs are issued."""
    return {spec.key: summarize(_plan(conn, spec)) for spec in PHONE_COLUMNS}


def format_report(report: Report, title: str) -> str:
    lines = [title]
    for key, counts in report.items():
        parts = " ".join(f"{name}={counts[name]}" for name in OUTCOME_KEYS)
        lines.append(f"  {key}: {parts}")
    return "\n".join(lines)


def _queue_table() -> sa.TableClause:
    return sa.table(
        QUEUE_TABLE,
        sa.column("id"),
        sa.column("entity_type"),
        sa.column("entity_id"),
        sa.column("field"),
        sa.column("raw_value"),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("resolved_at", sa.DateTime(timezone=True)),
    )


def _apply_column(conn: sa.Connection, spec: PhoneColumn, plan: Sequence[PlanItem]) -> None:
    table = _table(spec, with_raw=True)
    converted = [
        {"row_pk": item.row_id, "new_value": item.new_value, "old_value": item.original}
        for item in plan
        if item.outcome is Outcome.CONVERTED
    ]
    if converted:
        # The original goes to *_raw only when the stored value changes.
        statement = (
            sa.update(table)
            .where(table.c.id == sa.bindparam("row_pk"))
            .values(
                {
                    spec.column: sa.bindparam("new_value"),
                    spec.raw_column: sa.bindparam("old_value"),
                }
            )
        )
        conn.execute(statement, converted)

    queue = _queue_table()
    already_queued = {
        row.entity_id
        for row in conn.execute(
            sa.select(queue.c.entity_id).where(
                queue.c.entity_type == spec.entity_type,
                queue.c.field == spec.column,
                queue.c.resolved_at.is_(None),
            )
        )
    }
    now = datetime.now(timezone.utc)
    queued = [
        {
            "entity_type": spec.entity_type,
            "entity_id": item.row_id,
            "field": spec.column,
            "raw_value": item.original,
            "created_at": now,
        }
        for item in plan
        if item.outcome is Outcome.QUEUED and item.row_id not in already_queued
    ]
    if queued:
        conn.execute(sa.insert(queue), queued)


def apply_conversion(conn: sa.Connection, *, log: Callable[[str], None] = print) -> Report:
    """Convert every phone column in place and queue what cannot be converted.

    Logs the per-column counts before and after. Returns the "before" report.
    """
    before: Report = {}
    for spec in PHONE_COLUMNS:
        plan = _plan(conn, spec)
        before[spec.key] = summarize(plan)
        _apply_column(conn, spec, plan)
    after = collect_report(conn)
    for spec in PHONE_COLUMNS:
        b, a = before[spec.key], after[spec.key]
        log(
            f"phone migration {spec.key}: "
            + " ".join(f"{name}={b[name]}" for name in OUTCOME_KEYS)
            + " -> after: "
            + " ".join(f"{name}={a[name]}" for name in OUTCOME_KEYS)
        )
    return before


def restore_originals(conn: sa.Connection) -> None:
    """Put every `*_raw` original back into its column (migration downgrade)."""
    for spec in PHONE_COLUMNS:
        table = _table(spec, with_raw=True)
        conn.execute(
            sa.update(table)
            .where(table.c[spec.raw_column].is_not(None))
            .values({spec.column: table.c[spec.raw_column]})
        )


async def _dry_run() -> Report:
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.core.config import get_settings

    engine = create_async_engine(get_settings().database_url)
    try:
        async with engine.connect() as connection:
            report = await connection.run_sync(collect_report)
            await connection.rollback()
    finally:
        await engine.dispose()
    return report


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Report what the E.164 phone migration would do (read-only)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="required: print the per-column counts without writing anything",
    )
    args = parser.parse_args(argv)
    if not args.dry_run:
        parser.error("only --dry-run is supported; apply the change with `alembic upgrade head`")
    report = asyncio.run(_dry_run())
    print(format_report(report, "Phone migration dry run (nothing was written):"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
