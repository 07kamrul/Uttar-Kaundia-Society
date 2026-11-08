"""Duplicate-plot guards.

A double-entered plot (same member, same RS dag, CS dag and land quantity)
showed one member twice in the neighbour directory; these helpers keep new
duplicates out and let the ranking layer collapse the old ones.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.property import Property

_BANGLA_TO_ASCII_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

DuplicateKey = tuple[str, str, str]


def _normalize(value: str | None) -> str:
    return (value or "").strip().translate(_BANGLA_TO_ASCII_DIGITS)


def in_submission_duplicates(
    rows: list[tuple[str | None, str | None, str | None]],
) -> set[DuplicateKey]:
    """Dag/land triples appearing more than once in one submission. Rows with
    no dag at all are skipped - a blank plot is "dag unknown", not a duplicate."""
    seen: set[DuplicateKey] = set()
    duplicates: set[DuplicateKey] = set()
    for rs, cs, land in rows:
        key = (_normalize(rs), _normalize(cs), _normalize(land))
        if not (key[0] or key[1]):
            continue
        if key in seen:
            duplicates.add(key)
        seen.add(key)
    return duplicates


async def member_duplicate_plot(
    db: AsyncSession,
    member_id: int,
    *,
    dag_no_rs: str | None,
    dag_no_cs: str | None,
    land_quantity: str | None,
) -> bool:
    """True when the member already stores this exact plot (same RS dag, CS
    dag and land quantity). A plot missing any of the three is never treated
    as a duplicate."""
    rs, cs, land = _normalize(dag_no_rs), _normalize(dag_no_cs), _normalize(land_quantity)
    if not (rs or cs) or not land:
        return False
    rows = (
        await db.execute(
            select(Property.id).where(
                Property.member_id == member_id,
                Property.dag_no_rs == dag_no_rs,
                Property.dag_no_cs == dag_no_cs,
                Property.land_quantity == land_quantity,
            )
        )
    ).all()
    return bool(rows)
