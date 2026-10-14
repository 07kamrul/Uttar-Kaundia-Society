"""Read-only pre-check before turning on the `login_by_phone` flag.

Groups every non-rejected member by normalised mobile (so `017...` and
`+88017...` collide) and by email, and prints the groups. A group where two or
more members have a login makes that number or email ambiguous at login.

This script NEVER writes: it issues SELECTs only and never commits. Unlike
`resolve_duplicate_members.py` there is no `--apply`.

Usage:
    python -m scripts.report_duplicate_mobiles

Exit status: 0 when nothing blocks login, 1 when at least one blocking
duplicate (mobile or email) exists - a go/no-go check for the flag.
"""

import asyncio
import sys
from collections.abc import Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.services.login_identity import DuplicateGroup, DuplicateReport, duplicate_groups


def _describe(group: DuplicateGroup) -> list[str]:
    marker = "BLOCKING" if group.blocking else "info only"
    lines = [f"  {group.key}  [{marker}]"]
    for member in group.members:
        login = "login" if member.has_login else "no login"
        lines.append(
            f"    id={member.id} {member.member_id or '-'} {member.status} ({login}) {member.full_name}"
        )
    return lines


def format_report(report: DuplicateReport) -> str:
    lines = [f"Members with a login: {report.members_with_login}", ""]
    lines.append(f"Duplicate mobiles: {len(report.mobile_groups)} group(s)")
    for group in report.mobile_groups:
        lines += _describe(group)
    lines.append(f"Duplicate emails: {len(report.email_groups)} group(s)")
    for group in report.email_groups:
        lines += _describe(group)
    lines.append(f"Unparseable mobiles: {len(report.unparseable_mobiles)}")
    for row in report.unparseable_mobiles:
        lines.append(f"  id={row.id} {row.member_id or '-'} raw={row.raw!r}")
    blocking = _blocking_count(report)
    lines.append("")
    lines.append(
        f"{blocking} blocking duplicate group(s): do NOT turn the flag on yet."
        if blocking
        else "No blocking duplicates: safe to turn the flag on."
    )
    return "\n".join(lines)


def _blocking_count(report: DuplicateReport) -> int:
    return len(report.blocking_mobile_groups) + sum(1 for g in report.email_groups if g.blocking)


async def run(session_factory: Callable[[], AsyncSession] = AsyncSessionLocal) -> int:
    async with session_factory() as db:
        report = await duplicate_groups(db)
    print(format_report(report))
    return 1 if _blocking_count(report) else 0


def main() -> int:
    return asyncio.run(run())


if __name__ == "__main__":
    sys.exit(main())
