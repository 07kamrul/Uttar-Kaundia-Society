"""Member authentication must cost a single database round-trip: the token
version is read together with the member row, not in a second query."""

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_member, get_current_member_detail
from app.core.security import create_access_token, hash_password
from app.models.credential import MemberCredential
from app.models.member import Member, MemberStatus

pytestmark = pytest.mark.asyncio


async def _member(db_session: AsyncSession, *, with_credential: bool = True) -> Member:
    member = Member(
        status=MemberStatus.APPROVED,
        full_name="Query Counter",
        father_or_husband="F",
        mother="M",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="Job",
        nid="1234567890",
        mobile="01758290421",
        gender="পুরুষ",
        email="qc@example.com",
        admission_fee="500",
        subscription="100",
        receipt_no="R-QC",
        payment_method="Cash",
        submission_date="2026-01-01",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)
    if with_credential:
        db_session.add(MemberCredential(
            member_id=member.id,
            username="qc-0001",
            password_hash=hash_password("currentpass123"),
            must_change_password=False,
        ))
        await db_session.commit()
    return member


def _credentials(member: Member, version: int = 0) -> HTTPAuthorizationCredentials:
    token = create_access_token(str(member.id), "member", version=version)
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


class _QueryCounter:
    def __init__(self, session: AsyncSession) -> None:
        self.engine = session.bind.sync_engine
        self.statements: list[str] = []

    def _on_execute(self, conn, cursor, statement, parameters, context, executemany):
        self.statements.append(statement)

    def __enter__(self):
        event.listen(self.engine, "before_cursor_execute", self._on_execute)
        return self

    def __exit__(self, *exc):
        event.remove(self.engine, "before_cursor_execute", self._on_execute)


async def test_member_auth_uses_one_query(db_session: AsyncSession):
    member = await _member(db_session)

    with _QueryCounter(db_session) as counter:
        resolved = await get_current_member(_credentials(member), db_session)

    assert resolved.id == member.id
    assert len(counter.statements) == 1


async def test_member_without_credential_authenticates_at_version_zero(db_session: AsyncSession):
    member = await _member(db_session, with_credential=False)

    resolved = await get_current_member(_credentials(member), db_session)

    assert resolved.id == member.id


async def test_stale_token_version_is_rejected(db_session: AsyncSession):
    member = await _member(db_session)
    credential = (
        await db_session.execute(
            select(MemberCredential).where(MemberCredential.member_id == member.id)
        )
    ).scalar_one()
    credential.token_version = 3
    await db_session.commit()

    with pytest.raises(HTTPException) as caught:
        await get_current_member(_credentials(member, version=2), db_session)

    assert caught.value.status_code == 401


async def test_detail_variant_still_loads_relations_with_the_auth_row(db_session: AsyncSession):
    member = await _member(db_session)

    resolved = await get_current_member_detail(_credentials(member), db_session)

    assert resolved.id == member.id
    assert resolved.properties == []
    assert resolved.nominees == []
