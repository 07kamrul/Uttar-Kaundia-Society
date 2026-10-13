"""Dag-unknown workflow helpers shared by every approve path."""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.property import Property


def _needs_dag_clause():
    return (
        Property.dag_unknown.is_(True),
        func.trim(func.coalesce(Property.dag_no_cs, "")) == "",
        func.trim(func.coalesce(Property.dag_no_rs, "")) == "",
    )


async def member_ids_needing_dag(db: AsyncSession, member_ids: list[int]) -> set[int]:
    """Subset of `member_ids` that still has a property with an unknown, unfilled dag."""
    if not member_ids:
        return set()
    rows = await db.execute(
        select(Property.member_id)
        .where(Property.member_id.in_(member_ids), *_needs_dag_clause())
        .distinct()
    )
    return set(rows.scalars().all())


async def ensure_dag_filled(db: AsyncSession, member_id: int) -> None:
    """409 DAG_REQUIRED while any of the member's properties still lacks a dag."""
    if await member_ids_needing_dag(db, [member_id]):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "success": False,
                "code": "DAG_REQUIRED",
                "message": "Fill in the dag number of every property before approving.",
            },
        )
