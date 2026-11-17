"""Report duplicate property records (read-only).

Prints every group of properties that share a member + RS dag + CS dag +
land quantity - the double entries that made the neighbour directory show
one member more than once.

Run it yourself against the database (AI agents are not allowed to connect):

    cd backend
    ./venv/Scripts/python.exe scripts/find_duplicate_properties.py

Uses the same DATABASE_URL the app uses (.env). Nothing is modified.
"""

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models.member import Member  # noqa: E402
from app.models.property import Property  # noqa: E402

_BANGLA_TO_ASCII_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def _norm(value: str | None) -> str:
    return (value or "").strip().translate(_BANGLA_TO_ASCII_DIGITS)


async def main() -> None:
    database_url = os.environ.get("DATABASE_URL", str(settings.database_url))
    engine = create_async_engine(database_url)
    session_maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with session_maker() as db:
        rows = (
            await db.execute(
                select(
                    Property.member_id,
                    Member.full_name,
                    Property.id,
                    Property.dag_no_rs,
                    Property.dag_no_cs,
                    Property.land_quantity,
                )
                .join(Member, Member.id == Property.member_id)
                .order_by(Property.member_id, Property.id)
            )
        ).all()

    groups: dict[tuple, list[tuple]] = {}
    for member_id, name, prop_id, rs, cs, land in rows:
        groups.setdefault((_norm(rs), _norm(cs), _norm(land), member_id), []).append(
            (prop_id, name, rs, cs, land)
        )

    duplicates = {key: group for key, group in groups.items() if len(group) > 1}
    if not duplicates:
        print("No duplicate property records found.")
    for key, group in duplicates.items():
        print(f"\nmember_id={key[3]} dag_rs={key[0]} dag_cs={key[1]} land={key[2]}")
        for prop_id, name, rs, cs, land in group:
            print(f"  property_id={prop_id}  {name}  rs={rs} cs={cs} land={land}")
    print(f"\n{len(duplicates)} duplicate group(s) across {sum(len(g) for g in duplicates.values())} rows.")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
