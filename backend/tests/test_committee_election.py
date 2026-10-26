"""Module 2 — committee registry and elections.

Covers: 3-year term default + expiry status; resignation acknowledgement;
removal with documented investigation + right-to-respond; election voter
snapshot freeze + eligibility on the snapshot; one secret ballot per member
per post (double vote 409, ineligible 403); counts only after tabulation with
no ballot leakage; confirmation writing registry terms + publishing a notice;
election complaints.
"""

from datetime import date, datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.committee_election import CommitteeTerm, Election, VoterSnapshot, Vote
from app.models.member import (
    MEMBER_CLASS_GENERAL,
    MEMBER_CLASS_HONORARY_ASSOCIATE,
    Member,
    MemberStatus,
)
from app.models.notice import Notice

pytestmark = pytest.mark.asyncio

TODAY = date.today()


def _member_headers(member: Member) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(member.id), 'member')}"}


async def _admin_headers(client: AsyncClient) -> dict:
    response = await client.post(
        "/api/admin/login", json={"email": "admin@example.com", "password": "adminpass123"}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _make_member(db_session, n: int, *, member_class=MEMBER_CLASS_GENERAL, **kw) -> Member:
    member = Member(
        status=MemberStatus.APPROVED,
        full_name=f"Member {n}",
        father_or_husband="Father",
        mother="Mother",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="Job",
        nid=f"12345678900{n}",
        mobile=f"0175829042{n}",
        gender="পুরুষ",
        email=f"member{n}@example.com",
        admission_fee="500",
        subscription="100",
        receipt_no=f"R-{n}",
        payment_method="Cash",
        submission_date="2026-01-01",
        member_class=member_class,
        **kw,
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)
    return member


# ---------------------------------------------------------------------------
# Committee registry
# ---------------------------------------------------------------------------


async def test_term_defaults_to_three_years_and_expires(client: AsyncClient, db_session, admin_user):
    admin = await _admin_headers(client)
    member = await _make_member(db_session, 1)
    payload = {"post_key": "president", "member_id": member.id, "term_start": str(TODAY)}
    response = await client.post("/api/committee-registry/terms", json=payload, headers=admin)
    assert response.status_code == 201
    body = response.json()
    assert body["term_end"] == str(TODAY.replace(year=TODAY.year + 3))
    assert body["status"] == "active"

    term_id = body["id"]

    # Registry overview shows the holder.
    headers = _member_headers(member)
    overview = (await client.get("/api/committee-registry", headers=headers)).json()
    president = next(p for p in overview["posts"] if p["key"] == "president")
    assert president["holder"]["id"] == member.id
    assert president["status"] == "active"
    assert president["routine_work_only"] is False

    # Move term_end into the past -> expired, routine-work-only warning.
    response = await client.put(
        f"/api/committee-registry/terms/{term_id}",
        json={"term_end": str(TODAY - timedelta(days=1))},
        headers=admin,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "expired"
    overview = (await client.get("/api/committee-registry", headers=headers)).json()
    president = next(p for p in overview["posts"] if p["key"] == "president")
    assert president["status"] == "expired"
    assert president["routine_work_only"] is True
    assert "routine" in president["warning"]

    # A post nobody holds shows vacant (শূন্যপদ).
    treasurer = next(p for p in overview["posts"] if p["key"] == "treasurer")
    assert treasurer["status"] == "vacant"


async def test_overview_lists_every_sitting_holder_with_photo(client: AsyncClient, db_session, admin_user):
    first = await _make_member(db_session, 1, member_photo_path="photos/member_1/a.jpg")
    second = await _make_member(db_session, 2)
    # Election confirmation creates sibling seats that never supersede each other.
    for member in (first, second):
        db_session.add(
            CommitteeTerm(
                post_key="executive_member",
                member_id=member.id,
                term_start=TODAY,
                term_end=TODAY.replace(year=TODAY.year + 3),
            )
        )
    await db_session.commit()

    overview = (await client.get("/api/committee-registry", headers=_member_headers(first))).json()
    seats = next(p for p in overview["posts"] if p["key"] == "executive_member")["holders"]
    assert [h["id"] for h in seats] == [first.id, second.id]
    assert seats[0]["photo_path"] == "photos/member_1/a.jpg"
    assert seats[1]["photo_path"] is None
    assert seats[0]["status"] == "active"
    president = next(p for p in overview["posts"] if p["key"] == "president")
    assert president["holders"] == []


async def test_admin_reassignment_replaces_the_previous_holder(client: AsyncClient, db_session, admin_user):
    admin = await _admin_headers(client)
    old, new = await _make_member(db_session, 1), await _make_member(db_session, 2)
    for member in (old, new):
        payload = {"post_key": "treasurer", "member_id": member.id, "term_start": str(TODAY)}
        assert (await client.post("/api/committee-registry/terms", json=payload, headers=admin)).status_code == 201

    overview = (await client.get("/api/committee-registry", headers=_member_headers(new))).json()
    treasurer = next(p for p in overview["posts"] if p["key"] == "treasurer")
    assert [h["id"] for h in treasurer["holders"]] == [new.id]


async def test_resignation_needs_standing_council_acknowledgement(client: AsyncClient, db_session, admin_user):
    admin = await _admin_headers(client)
    member = await _make_member(db_session, 2)
    await client.post(
        "/api/committee-registry/terms",
        json={"post_key": "treasurer", "member_id": member.id, "term_start": str(TODAY)},
        headers=admin,
    )
    # The holder resigns themselves.
    response = await client.post(
        "/api/committee-registry/posts/treasurer/resignation",
        json={"note": "personal reasons"},
        headers=_member_headers(member),
    )
    assert response.status_code == 201
    vacancy = response.json()
    assert vacancy["status"] == "pending_acknowledgement"

    # Member cannot acknowledge; the standing-council side (admin) does.
    response = await client.post(
        f"/api/committee-registry/vacancies/{vacancy['id']}/acknowledge",
        headers=_member_headers(member),
    )
    assert response.status_code == 403
    response = await client.post(
        f"/api/committee-registry/vacancies/{vacancy['id']}/acknowledge", headers=admin
    )
    assert response.status_code == 200
    assert response.json()["status"] == "acknowledged"
    assert response.json()["acknowledged_at"] is not None


async def test_removal_requires_investigation_response_and_decision(client: AsyncClient, db_session, admin_user):
    from app.services.governance import add_working_days

    admin = await _admin_headers(client)
    member = await _make_member(db_session, 3)
    await client.post(
        "/api/committee-registry/terms",
        json={"post_key": "general_secretary", "member_id": member.id, "term_start": str(TODAY)},
        headers=admin,
    )
    response = await client.post(
        "/api/committee-registry/posts/general_secretary/resignation", json={"member_id": member.id}, headers=admin
    )
    assert response.status_code == 201, "an admin may record the resignation naming the holder"
    vacancy_id = response.json()["id"]

    # Final decision cannot skip the investigation + right-to-respond stage.
    response = await client.post(
        f"/api/committee-registry/vacancies/{vacancy_id}/decide",
        json={"decision": "removed"},
        headers=admin,
    )
    assert response.status_code == 409

    # Removal notice documents the investigation and opens the 15-working-day window.
    response = await client.post(
        f"/api/committee-registry/vacancies/{vacancy_id}/removal-notice",
        json={"investigation_note": "financial irregularities documented"},
        headers=admin,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "investigation"
    assert body["response_deadline"] == str(add_working_days(TODAY, 15))

    # Only the accused member may respond.
    other = await _make_member(db_session, 4)
    response = await client.post(
        f"/api/committee-registry/vacancies/{vacancy_id}/member-response",
        json={"response": "I disagree"},
        headers=_member_headers(other),
    )
    assert response.status_code == 403
    response = await client.post(
        f"/api/committee-registry/vacancies/{vacancy_id}/member-response",
        json={"response": "Explanation with evidence"},
        headers=_member_headers(member),
    )
    assert response.status_code == 200
    assert response.json()["member_response"] == "Explanation with evidence"

    response = await client.post(
        f"/api/committee-registry/vacancies/{vacancy_id}/decide",
        json={"decision": "removed", "note": "unresolved"},
        headers=admin,
    )
    assert response.status_code == 200
    assert response.json()["decision"] == "removed"


# ---------------------------------------------------------------------------
# Elections
# ---------------------------------------------------------------------------


def _election_payload() -> dict:
    return {
        "title": "নির্বাচন ২০২৬",
        "nomination_start": str(TODAY - timedelta(days=1)),
        "nomination_end": str(TODAY),
        "voting_start": str(TODAY),
        "voting_end": str(TODAY + timedelta(days=7)),
    }


async def _election_full_flow(client: AsyncClient, db_session, members: list[Member]):
    """Creates an election and walks it to voting with all members nominated
    and approved for the 'president' post; returns (election_id, headers)."""
    admin = await _admin_headers(client)
    election = (
        await client.post("/api/elections", json=_election_payload(), headers=admin)
    ).json()
    election_id = election["id"]
    await client.post(f"/api/elections/{election_id}/open-nominations", headers=admin)
    for member in members:
        response = await client.post(
            f"/api/elections/{election_id}/nominations",
            json={"post_key": "president", "statement": "আমি কাজ করব"},
            headers=_member_headers(member),
        )
        assert response.status_code == 201, response.text
    nominations = (
        (
            await db_session.execute(
                select(Election).where(Election.id == election_id)
            )
        )
        .scalar_one()
        .nominations
    )
    for nomination in nominations:
        await client.post(
            f"/api/elections/nominations/{nomination.id}/decide",
            json={"approved": True},
            headers=admin,
        )
    response = await client.post(f"/api/elections/{election_id}/close-nominations", headers=admin)
    assert response.status_code == 200
    await client.post(f"/api/elections/{election_id}/open-voting", headers=admin)
    return election_id


async def test_snapshot_freeze_and_eligibility(client: AsyncClient, db_session, admin_user):
    member = await _make_member(db_session, 5)
    election_id = await _election_full_flow(client, db_session, [member])

    # Snapshot frozen at nomination close.
    snapshots = (
        await db_session.execute(
            select(VoterSnapshot).where(VoterSnapshot.election_id == election_id)
        )
    ).scalars().all()
    assert len(snapshots) == 1
    assert snapshots[0].snapshot["member_class"] == MEMBER_CLASS_GENERAL

    # Member is suspended AFTER the freeze - the snapshot still lets them vote.
    member.governance_status = "suspended"
    db_session.add(member)
    await db_session.commit()
    nomination = (
        (
            await db_session.execute(
                select(VoterSnapshot.election_id, VoterSnapshot.id).where(
                    VoterSnapshot.election_id == election_id
                )
            )
        ).first(),
    )
    admin = await _admin_headers(client)
    detail = (await client.get(f"/api/elections/{election_id}/admin", headers=admin)).json()
    approved_nomination_id = detail["nominations"][0]["id"]
    response = await client.post(
        f"/api/elections/{election_id}/vote",
        json={"post_key": "president", "nomination_id": approved_nomination_id},
        headers=_member_headers(member),
    )
    assert response.status_code == 200, "snapshot eligibility, not live status, gates the ballot"

    # An honorary-associate member was never in the snapshot -> 403.
    honorary = await _make_member(db_session, 6, member_class=MEMBER_CLASS_HONORARY_ASSOCIATE)
    response = await client.post(
        f"/api/elections/{election_id}/vote",
        json={"post_key": "president", "nomination_id": approved_nomination_id},
        headers=_member_headers(honorary),
    )
    assert response.status_code == 403


async def test_double_vote_409_and_counts_only_after_tabulation(client: AsyncClient, db_session, admin_user):
    voter = await _make_member(db_session, 7)
    candidate = await _make_member(db_session, 8)
    election_id = await _election_full_flow(client, db_session, [voter, candidate])
    admin = await _admin_headers(client)
    detail = (await client.get(f"/api/elections/{election_id}/admin", headers=admin)).json()
    nomination_id = detail["nominations"][0]["id"]
    vote_headers = _member_headers(voter)

    # Before tabulation the member view exposes NO results.
    me = (await client.get(f"/api/elections/{election_id}/me", headers=vote_headers)).json()
    assert me["results"] is None

    response = await client.post(
        f"/api/elections/{election_id}/vote",
        json={"post_key": "president", "nomination_id": nomination_id},
        headers=vote_headers,
    )
    assert response.status_code == 200
    # One ballot per member per post: the UNIQUE constraint is the backstop.
    votes = (
        await db_session.execute(select(Vote).where(Vote.election_id == election_id))
    ).scalars().all()
    assert len(votes) == 1
    response = await client.post(
        f"/api/elections/{election_id}/vote",
        json={"post_key": "president", "nomination_id": nomination_id},
        headers=vote_headers,
    )
    assert response.status_code == 409

    await client.post(f"/api/elections/{election_id}/tabulate", headers=admin)
    me = (await client.get(f"/api/elections/{election_id}/me", headers=vote_headers)).json()
    assert me["results"] is not None
    assert me["results"][0]["candidates"][0]["votes"] == 1
    # Counts only: no voter/ballot attribution anywhere in the results payload.
    assert "voter" not in str(me["results"]).lower()
    assert me["voted_posts"] == ["president"]

    # The raw votes table keeps content secret from every read endpoint.
    result_sheet = await client.get(f"/api/elections/{election_id}/result-sheet.pdf", headers=admin)
    assert result_sheet.status_code == 200
    assert result_sheet.content[:4] == b"%PDF"


async def test_confirm_results_updates_registry_and_publishes_notice(client: AsyncClient, db_session, admin_user):
    voter = await _make_member(db_session, 9)
    candidate = await _make_member(db_session, 10)
    election_id = await _election_full_flow(client, db_session, [voter, candidate])
    admin = await _admin_headers(client)
    detail = (await client.get(f"/api/elections/{election_id}/admin", headers=admin)).json()
    candidate_nomination = next(
        n for n in detail["nominations"] if n["member_id"] == candidate.id
    )
    await client.post(
        f"/api/elections/{election_id}/vote",
        json={"post_key": "president", "nomination_id": candidate_nomination["id"]},
        headers=_member_headers(voter),
    )
    await client.post(f"/api/elections/{election_id}/tabulate", headers=admin)
    response = await client.post(f"/api/elections/{election_id}/confirm", headers=admin)
    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"

    term = (
        await db_session.execute(
            select(CommitteeTerm).where(
                CommitteeTerm.post_key == "president", CommitteeTerm.member_id == candidate.id
            )
        )
    ).scalar_one_or_none()
    assert term is not None, "confirmation writes the winner into the registry"
    assert term.term_end == TODAY.replace(year=TODAY.year + 3)

    notices = (
        (await db_session.execute(select(Notice))).scalars().all()
    )
    assert any("নির্বাচন" in n.title for n in notices), "confirmation publishes a notice"


async def test_member_can_vote_only_within_voting_window(client: AsyncClient, db_session, admin_user):
    admin = await _admin_headers(client)
    member = await _make_member(db_session, 11)
    payload = _election_payload()
    payload.update(
        nomination_start=str(TODAY - timedelta(days=5)),
        nomination_end=str(TODAY - timedelta(days=4)),
        voting_start=str(TODAY + timedelta(days=2)),
        voting_end=str(TODAY + timedelta(days=9)),
    )
    election = (await client.post("/api/elections", json=payload, headers=admin)).json()
    await client.post(f"/api/elections/{election['id']}/open-nominations", headers=admin)
    await client.post(f"/api/elections/{election['id']}/close-nominations", headers=admin)
    # Nomination outside the window is rejected.
    response = await client.post(
        f"/api/elections/{election['id']}/nominations",
        json={"post_key": "president"},
        headers=_member_headers(member),
    )
    assert response.status_code == 409
    await client.post(f"/api/elections/{election['id']}/open-voting", headers=admin)
    detail = (await client.get(f"/api/elections/{election['id']}/admin", headers=admin)).json()
    assert not detail["nominations"]
    response = await client.post(
        f"/api/elections/{election['id']}/vote",
        json={"post_key": "president", "nomination_id": 1},
        headers=_member_headers(member),
    )
    assert response.status_code == 409, "voting before the window opens is rejected"


async def test_election_complaint_flow(client: AsyncClient, db_session, admin_user):
    member = await _make_member(db_session, 12)
    admin = await _admin_headers(client)
    election = (
        await client.post("/api/elections", json=_election_payload(), headers=admin)
    ).json()
    response = await client.post(
        f"/api/elections/{election['id']}/complaints",
        json={"against": "returning officer", "subject": "ভোটকেন্দ্র বিঘ্ন", "details": "details..."},
        headers=_member_headers(member),
    )
    assert response.status_code == 201
    complaint_id = response.json()["id"]
    response = await client.post(
        f"/api/elections/complaints/{complaint_id}/decide",
        json={"status": "resolved", "resolution": "re-vote ordered for the affected booth"},
        headers=admin,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "resolved"
