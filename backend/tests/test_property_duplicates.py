"""Duplicate-plot guards: identical (rs dag, cs dag, land) rows are double
entries, in one submission or added later through a property request."""

import pytest

from app.models.member import Member, MemberStatus
from app.models.property import Property
from app.services.property_duplicates import (
    in_submission_duplicates,
    member_duplicate_plot,
)


def test_identical_triples_in_one_submission_are_flagged() -> None:
    rows = [("365", "836", "5"), ("৩৬৫", "৮৩৬", "৫"), ("4050", "900", "2")]
    dupes = in_submission_duplicates(rows)
    assert ("365", "836", "5") in dupes
    assert ("4050", "900", "2") not in dupes


def test_whitespace_only_differences_are_duplicates() -> None:
    rows = [(" 365 ", "836", "5"), ("365", " 836", "5 ")]
    assert in_submission_duplicates(rows) == {("365", "836", "5")}


def test_rows_without_any_dag_are_never_duplicates() -> None:
    rows = [(None, None, "5"), ("", "", "5")]
    assert in_submission_duplicates(rows) == set()


def test_different_land_quantity_is_not_a_duplicate() -> None:
    rows = [("365", "836", "5"), ("365", "836", "7")]
    assert in_submission_duplicates(rows) == set()


def _member(**overrides) -> Member:
    fields = dict(
        full_name="Test Member",
        father_or_husband="Father",
        mother="Mother",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="Farmer",
        nid="1234567890",
        mobile="01700000000",
        gender="male",
        email="test@example.com",
        admission_fee="500",
        subscription="100",
        receipt_no="R-1",
        payment_method="cash",
        submission_date="2026-11-08",
        status=MemberStatus.APPROVED,
    )
    fields.update(overrides)
    return Member(**fields)


async def _make_member_with_plot(db) -> Member:
    member = _member(
        properties=[Property(dag_no_rs="365", dag_no_cs="836", land_quantity="5")]
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


async def test_existing_identical_plot_is_detected(db_session) -> None:
    member = await _make_member_with_plot(db_session)
    assert await member_duplicate_plot(
        db_session, member.id, dag_no_rs="365", dag_no_cs="836", land_quantity="5"
    )


async def test_different_land_is_not_detected(db_session) -> None:
    member = await _make_member_with_plot(db_session)
    assert not await member_duplicate_plot(
        db_session, member.id, dag_no_rs="365", dag_no_cs="836", land_quantity="7"
    )


async def test_other_members_plots_are_ignored(db_session) -> None:
    await _make_member_with_plot(db_session)
    other = _member(mobile="01700000001", email="other@example.com", nid="9876543210")
    db_session.add(other)
    await db_session.commit()
    await db_session.refresh(other)
    assert not await member_duplicate_plot(
        db_session, other.id, dag_no_rs="365", dag_no_cs="836", land_quantity="5"
    )


@pytest.mark.parametrize(
    ("rs", "cs", "land"),
    [(None, "836", "5"), ("365", None, "5"), ("365", "836", None)],
)
async def test_incomplete_new_plot_is_never_a_duplicate(db_session, rs, cs, land) -> None:
    member = await _make_member_with_plot(db_session)
    assert not await member_duplicate_plot(
        db_session, member.id, dag_no_rs=rs, dag_no_cs=cs, land_quantity=land
    )
