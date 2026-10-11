"""Election confirmation fixes: registry supersede chain, multi-seat posts,
zero-vote posts, outcome-based notice wording, and IntegrityError-only
double-vote handling."""

from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from app.api.routes.elections import select_winners
from app.models.committee_election import POST_SEATS, CommitteeTerm, post_seats
from app.models.notice import Notice
from tests.test_committee_election import (
    _admin_headers,
    _election_payload,
    _make_member,
    _member_headers,
)

pytestmark = pytest.mark.asyncio

TODAY = date.today()


def _c(member_id: int, votes: int) -> dict:
    return {"nomination_id": member_id, "member_id": member_id, "votes": votes}


# ---------------------------------------------------------------------------
# Pure winner selection
# ---------------------------------------------------------------------------


async def test_post_seats_constant():
    assert POST_SEATS["executive_member"] == 2
    assert post_seats("executive_member") == 2
    assert post_seats("president") == 1


async def test_executive_member_elects_top_two():
    winners, skipped = select_winners("executive_member", [_c(1, 5), _c(2, 3), _c(3, 1)])
    assert [w["member_id"] for w in winners] == [1, 2]
    assert skipped == 0


async def test_tie_at_cutoff_seat_is_skipped():
    winners, skipped = select_winners("executive_member", [_c(1, 5), _c(2, 3), _c(3, 3)])
    assert [w["member_id"] for w in winners] == [1]
    assert skipped == 1


async def test_single_seat_tie_has_no_winner():
    winners, skipped = select_winners("president", [_c(1, 2), _c(2, 2)])
    assert winners == [] and skipped == 1


async def test_unopposed_zero_votes_is_not_a_winner():
    winners, skipped = select_winners("president", [_c(1, 0)])
    assert winners == [] and skipped == 1


async def test_unopposed_with_votes_wins():
    winners, _ = select_winners("president", [_c(1, 1)])
    assert [w["member_id"] for w in winners] == [1]


# ---------------------------------------------------------------------------
# Integration: confirm
# ---------------------------------------------------------------------------


async def _run_to_tabulated(client, db_session, post_key, candidates, votes_for):
    """votes_for: list of (voter, candidate) pairs."""
    admin = await _admin_headers(client)
    election_id = (
        await client.post("/api/elections", json=_election_payload(), headers=admin)
    ).json()["id"]
    await client.post(f"/api/elections/{election_id}/open-nominations", headers=admin)
    for cand in candidates:
        r = await client.post(
            f"/api/elections/{election_id}/nominations",
            json={"post_key": post_key},
            headers=_member_headers(cand),
        )
        assert r.status_code == 201, r.text
    detail = (await client.get(f"/api/elections/{election_id}/admin", headers=admin)).json()
    for n in detail["nominations"]:
        await client.post(
            f"/api/elections/nominations/{n['id']}/decide", json={"approved": True}, headers=admin
        )
    assert (await client.post(f"/api/elections/{election_id}/close-nominations", headers=admin)).status_code == 200
    await client.post(f"/api/elections/{election_id}/open-voting", headers=admin)
    nom_by_member = {n["member_id"]: n["id"] for n in detail["nominations"]}
    for voter, cand in votes_for:
        r = await client.post(
            f"/api/elections/{election_id}/vote",
            json={"post_key": post_key, "nomination_id": nom_by_member[cand.id]},
            headers=_member_headers(voter),
        )
        assert r.status_code == 200, r.text
    await client.post(f"/api/elections/{election_id}/tabulate", headers=admin)
    return election_id, admin


async def test_confirm_supersedes_previous_holder(client: AsyncClient, db_session, admin_user):
    old = await _make_member(db_session, 31)
    new = await _make_member(db_session, 32)
    admin = await _admin_headers(client)
    r = await client.post(
        "/api/committee-registry/terms",
        json={"post_key": "president", "member_id": old.id, "term_start": str(TODAY - timedelta(days=30))},
        headers=admin,
    )
    assert r.status_code == 201
    old_term_id = r.json()["id"]

    election_id, admin = await _run_to_tabulated(client, db_session, "president", [new], [(old, new)])
    assert (await client.post(f"/api/elections/{election_id}/confirm", headers=admin)).status_code == 200

    new_id = new.id
    db_session.expire_all()
    old_term = (await db_session.execute(select(CommitteeTerm).where(CommitteeTerm.id == old_term_id))).scalar_one()
    new_term = (
        await db_session.execute(
            select(CommitteeTerm).where(CommitteeTerm.post_key == "president", CommitteeTerm.member_id == new_id)
        )
    ).scalar_one()
    assert old_term.replaced_by_term_id == new_term.id


async def test_confirm_executive_member_creates_two_terms(client: AsyncClient, db_session, admin_user):
    a, b, c = [await _make_member(db_session, n) for n in (33, 34, 35)]
    election_id, admin = await _run_to_tabulated(
        client, db_session, "executive_member", [a, b, c], [(a, a), (b, a), (c, b)]
    )
    assert (await client.post(f"/api/elections/{election_id}/confirm", headers=admin)).status_code == 200
    terms = (
        await db_session.execute(select(CommitteeTerm).where(CommitteeTerm.post_key == "executive_member"))
    ).scalars().all()
    assert sorted(t.member_id for t in terms) == sorted([a.id, b.id])
    # Two seats of the same post are both live: neither supersedes the other.
    assert all(t.replaced_by_term_id is None for t in terms)


async def test_all_tied_notice_does_not_claim_winners(client: AsyncClient, db_session, admin_user):
    a, b = await _make_member(db_session, 36), await _make_member(db_session, 37)
    election_id, admin = await _run_to_tabulated(client, db_session, "president", [a, b], [(a, a), (b, b)])
    assert (await client.post(f"/api/elections/{election_id}/confirm", headers=admin)).status_code == 200
    assert (await db_session.execute(select(CommitteeTerm))).scalars().all() == []
    notices = (await db_session.execute(select(Notice))).scalars().all()
    body = " ".join(n.body for n in notices if "নির্বাচন" in n.title)
    assert "বিজয়ীরা কমিটি রেজিস্ট্রিতে যুক্ত হয়েছেন" not in body
    assert "০" in body or "0" in body


async def test_vote_non_integrity_db_error_is_not_already_voted(
    client: AsyncClient, db_session, admin_user, monkeypatch
):
    voter = await _make_member(db_session, 38)
    cand = await _make_member(db_session, 39)
    admin = await _admin_headers(client)
    election_id = (await client.post("/api/elections", json=_election_payload(), headers=admin)).json()["id"]
    await client.post(f"/api/elections/{election_id}/open-nominations", headers=admin)
    await client.post(f"/api/elections/{election_id}/nominations", json={"post_key": "president"},
                      headers=_member_headers(cand))
    detail = (await client.get(f"/api/elections/{election_id}/admin", headers=admin)).json()
    nid = detail["nominations"][0]["id"]
    await client.post(f"/api/elections/nominations/{nid}/decide", json={"approved": True}, headers=admin)
    await client.post(f"/api/elections/{election_id}/close-nominations", headers=admin)
    await client.post(f"/api/elections/{election_id}/open-voting", headers=admin)

    from sqlalchemy.ext.asyncio import AsyncSession

    original_flush = AsyncSession.flush

    async def boom(self, *args, **kwargs):
        from app.models.committee_election import Vote

        if any(isinstance(o, Vote) for o in self.new):
            raise OperationalError("INSERT", {}, Exception("disk I/O error"))
        return await original_flush(self, *args, **kwargs)

    monkeypatch.setattr(AsyncSession, "flush", boom)
    try:
        response = await client.post(
            f"/api/elections/{election_id}/vote",
            json={"post_key": "president", "nomination_id": nid},
            headers=_member_headers(voter),
        )
    except OperationalError:
        return  # propagated as a real error - correct
    assert response.status_code != 409, "a non-integrity DB error must not masquerade as 'already voted'"


async def test_complaint_cannot_be_decided_twice(client: AsyncClient, db_session, admin_user):
    member = await _make_member(db_session, 40)
    admin = await _admin_headers(client)
    election_id = (await client.post("/api/elections", json=_election_payload(), headers=admin)).json()["id"]
    complaint_id = (
        await client.post(
            f"/api/elections/{election_id}/complaints",
            json={"subject": "s", "details": "d"},
            headers=_member_headers(member),
        )
    ).json()["id"]
    url = f"/api/elections/complaints/{complaint_id}/decide"
    first = await client.post(url, json={"status": "resolved", "resolution": "ok"}, headers=admin)
    assert first.status_code == 200
    second = await client.post(url, json={"status": "rejected", "resolution": "changed"}, headers=admin)
    assert second.status_code == 409
