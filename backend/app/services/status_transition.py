"""Race-safe membership status changes.

A route reads a member, checks its status, then writes a new one. Two
concurrent requests (double click, two reviewers, approve vs. reject) can both
pass the check on the same stale status. ``claim_status_transition`` closes
that gap with a conditional UPDATE: only the request that still sees the
status it read wins; every other one gets the caller's 409.

On PostgreSQL the winning UPDATE holds the row lock until commit, so a racing
UPDATE waits, re-reads the committed status and matches nothing. Unlike
``SELECT ... FOR UPDATE`` this also behaves correctly under SQLite (tests).
"""

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member, MemberStatus


async def claim_status_transition(
    db: AsyncSession,
    member: Member,
    new_status: MemberStatus,
    *,
    conflict: HTTPException,
) -> None:
    """Move `member` from the status it was read with to `new_status`, or
    raise `conflict` if another request changed it first. The caller's
    transaction still owns the commit; a later failure rolls this back too."""
    expected = member.status
    result = await db.execute(
        update(Member)
        .where(Member.id == member.id, Member.status == expected)
        .values(status=new_status)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        raise conflict
    member.status = new_status
