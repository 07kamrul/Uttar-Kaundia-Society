"""Module 6 — গঠনতন্ত্র সংশোধনী ট্র্যাকার: version seeding (append-only),
member proposals, properly-noticed meeting requirement, simple vs four-fifths
majority validation, adoption creating a NEW version, dissolution handling
(no auto-execution), and member reads.
"""

from datetime import date, datetime, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select as sa_select

from app.core.security import create_access_token, hash_password
from app.models.admin import AdminRole, AdminUser
from app.models.amendment import AmendmentProposal, ConstitutionVersion
from app.models.member import Member, MemberStatus
from app.models.resolution_book import Meeting

pytestmark = pytest.mark.asyncio


_member_seq = {"n": 0}


async def _member(db_session, *, email="member@x.com") -> Member:
    _member_seq["n"] += 1
    member = Member(
        status=MemberStatus.APPROVED,
        member_id=f"UKAMKS-{70 + _member_seq['n']}",
        full_name="মিতুল হাসান",
        father_or_husband="Father",
        mother="Mother",
        dob="1992-02-02",
        nationality="Bangladeshi",
        occupation="Job",
        nid="1234567891",
        mobile="01758290412",
        gender="পুরুষ",
        email=email,
        admission_fee="500",
        subscription="100",
        receipt_no="R-2",
        payment_method="Cash",
        submission_date="2026-01-01",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)
    return member


async def _admin(db_session, *, email, role=AdminRole.EXECUTIVE_COMMITTEE) -> AdminUser:
    admin = AdminUser(
        email=email,
        password_hash=hash_password("pass12345"),
        name=f"Admin {email}",
        role=role,
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)
    return admin


def _headers(account_id: int | str, role: str) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(account_id), role)}"}


_meeting_seq = {"n": 0}


async def _noticed_meeting(db_session, *, noticed: bool = True) -> Meeting:
    _meeting_seq["n"] += 1
    meeting = Meeting(
        meeting_no=f"M-{_meeting_seq['n']:03d}",
        date=date(2026, 10, 20),
        chairperson="সভাপতি",
        agenda="সংশোধনী আলোচনা",
        status="scheduled",
        council_type="executive",
        notice_published_at=datetime.now(timezone.utc) if noticed else None,
    )
    db_session.add(meeting)
    await db_session.commit()
    await db_session.refresh(meeting)
    return meeting


async def _seed_v1(client, admin) -> dict:
    response = await client.post(
        "/api/admin/amendments/versions/seed",
        json={"full_text": "গঠনতন্ত্রের মূল পাঠ (v1)", "changes_summary": "প্রাথমিক সংস্করণ"},
        headers=_headers(admin.id, "executive_committee"),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _propose(client, member, **overrides) -> dict:
    payload = {
        "title": "সভার কোরাম সংশোধনী",
        "rationale": "বর্তমান বিধি অস্পষ্ট",
        "proposed_text": "সংশোধিত পাঠ: কোরাম ৭ জন।",
    }
    payload.update(overrides)
    response = await client.post(
        "/api/member/amendments/proposals", json=payload, headers=_headers(member.id, "member")
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _attach(client, admin, proposal_id: int, meeting_id: int) -> dict:
    response = await client.post(
        f"/api/admin/amendments/proposals/{proposal_id}/attach-meeting",
        json={"meeting_id": meeting_id},
        headers=_headers(admin.id, "executive_committee"),
    )
    return response.json()


async def _decide(client, admin, proposal_id: int, **votes) -> object:
    payload = {"votes_for": 8, "votes_against": 2, "votes_abstain": 0}
    payload.update(votes)
    return await client.post(
        f"/api/admin/amendments/proposals/{proposal_id}/decide",
        json=payload,
        headers=_headers(admin.id, "executive_committee"),
    )


# ---------------------------------------------------------------------------
# Version register
# ---------------------------------------------------------------------------


async def test_seed_v1_only_once(client, db_session, admin_user):
    v1 = await _seed_v1(client, admin_user)
    assert v1["version_no"] == 1
    assert v1["is_current"] is True

    again = await client.post(
        "/api/admin/amendments/versions/seed",
        json={"full_text": "আরেকটি সংস্করণ"},
        headers=_headers(admin_user.id, "executive_committee"),
    )
    assert again.status_code == 409
    assert "already exists" in again.json()["detail"]

    # No PUT/PATCH endpoint exists for versions: the register is append-only.
    patch = await client.patch(
        f"/api/amendments/versions/{v1['id']}",
        json={"full_text": "হ্যাক"},
        headers=_headers(admin_user.id, "executive_committee"),
    )
    assert patch.status_code in (405, 404)
    row = (
        await db_session.execute(
            sa_select(ConstitutionVersion).where(ConstitutionVersion.id == v1["id"])
        )
    ).scalar_one()
    assert row.full_text == "গঠনতন্ত্রের মূল পাঠ (v1)"


# ---------------------------------------------------------------------------
# Member proposals
# ---------------------------------------------------------------------------


async def test_member_propose_and_withdraw(client, db_session, admin_user):
    member = await _member(db_session)
    await _seed_v1(client, admin_user)

    proposal = await _propose(client, member)
    assert proposal["proposal_no"].startswith("KRMF-SC-2026-")
    assert proposal["status"] == "submitted"
    assert proposal["current_version_id"] is not None
    assert proposal["proposed_by_member_name"] == "মিতুল হাসান"

    mine = await client.get(
        "/api/member/amendments/proposals", headers=_headers(member.id, "member")
    )
    assert [row["id"] for row in mine.json()] == [proposal["id"]]

    detail = await client.get(
        f"/api/member/amendments/proposals/{proposal['id']}",
        headers=_headers(member.id, "member"),
    )
    assert detail.status_code == 200
    other = await _member(db_session, email="other@x.com")
    forbidden = await client.get(
        f"/api/member/amendments/proposals/{proposal['id']}",
        headers=_headers(other.id, "member"),
    )
    assert forbidden.status_code == 403

    withdrawn = await client.post(
        f"/api/member/amendments/proposals/{proposal['id']}/withdraw",
        headers=_headers(member.id, "member"),
    )
    assert withdrawn.status_code == 200
    assert withdrawn.json()["status"] == "withdrawn"


async def test_dissolution_proposal_forces_four_fifths(client, db_session, admin_user):
    member = await _member(db_session)
    proposal = await _propose(client, member, title="সোসাইটি বিলুপ্তি", is_dissolution=True)
    assert proposal["is_dissolution"] is True
    assert proposal["required_majority"] == "four_fifths"


async def test_constants_and_versions_readable(client, db_session, admin_user):
    member = await _member(db_session)
    await _seed_v1(client, admin_user)
    for headers in (_headers(member.id, "member"), _headers(admin_user.id, "executive_committee")):
        constants = await client.get("/api/amendments/constants", headers=headers)
        assert constants.status_code == 200
        assert constants.json()["majority_types"] == ["simple", "four_fifths"]
        assert "স্বয়ংক্রিয় বিলুপ্তি হয় না" in constants.json()["dissolution_notice_bn"]

        versions = await client.get("/api/amendments/versions", headers=headers)
        assert versions.status_code == 200
        assert [v["version_no"] for v in versions.json()] == [1]

    unauth = await client.get("/api/amendments/versions")
    assert unauth.status_code == 401


# ---------------------------------------------------------------------------
# Scheduling requires a properly-noticed meeting
# ---------------------------------------------------------------------------


async def test_attach_meeting_requires_notice(client, db_session, admin_user):
    member = await _member(db_session)
    proposal = await _propose(client, member)

    unnoticed = await _noticed_meeting(db_session, noticed=False)
    response = await client.post(
        f"/api/admin/amendments/proposals/{proposal['id']}/attach-meeting",
        json={"meeting_id": unnoticed.id},
        headers=_headers(admin_user.id, "executive_committee"),
    )
    assert response.status_code == 409
    assert "নোটিশ" in response.json()["detail"]

    noticed = await _noticed_meeting(db_session, noticed=True)
    attached = await client.post(
        f"/api/admin/amendments/proposals/{proposal['id']}/attach-meeting",
        json={"meeting_id": noticed.id},
        headers=_headers(admin_user.id, "executive_committee"),
    )
    assert attached.status_code == 200, attached.text
    body = attached.json()
    assert body["status"] == "scheduled"
    assert body["meeting_id"] == noticed.id


async def test_decide_requires_attached_meeting(client, db_session, admin_user):
    member = await _member(db_session)
    proposal = await _propose(client, member)
    response = await _decide(client, admin_user, proposal["id"])
    assert response.status_code == 409
    assert "সভা" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Majority validation and adoption
# ---------------------------------------------------------------------------


async def test_simple_majority_validation_and_adoption(client, db_session, admin_user):
    member = await _member(db_session)
    await _seed_v1(client, admin_user)
    proposal = await _propose(client, member)
    meeting = await _noticed_meeting(db_session)
    await _attach(client, admin_user, proposal["id"], meeting.id)

    # for <= against -> invalid.
    blocked = await _decide(
        client, admin_user, proposal["id"], votes_for=5, votes_against=5, votes_abstain=0
    )
    assert blocked.status_code == 409

    # for > against but below floor(total/2)+1 -> invalid.
    blocked = await _decide(
        client, admin_user, proposal["id"], votes_for=3, votes_against=1, votes_abstain=4
    )
    assert blocked.status_code == 409  # 3 < floor(8/2)+1 = 5

    # Zero votes cast -> invalid.
    blocked = await _decide(client, admin_user, proposal["id"], votes_for=0, votes_against=0, votes_abstain=0)
    assert blocked.status_code == 409

    # A 409 must not consume the proposal: the valid tally still adopts.
    adopted = await _decide(
        client, admin_user, proposal["id"], votes_for=6, votes_against=2, votes_abstain=1
    )
    assert adopted.status_code == 200, adopted.text
    body = adopted.json()
    assert body["status"] == "adopted"
    assert body["adopted_version_no"] == 2
    assert body["votes_for"] == 6

    # The version register now has v2; v1 is untouched (append-only).
    versions = (
        await client.get(
            "/api/amendments/versions", headers=_headers(admin_user.id, "executive_committee")
        )
    ).json()
    assert [v["version_no"] for v in versions] == [1, 2]
    assert versions[0]["full_text"] == "গঠনতন্ত্রের মূল পাঠ (v1)"
    assert versions[1]["full_text"] == "সংশোধিত পাঠ: কোরাম ৭ জন।"
    assert versions[1]["is_current"] is True
    assert versions[1]["source_amendment_id"] == proposal["id"]
    assert versions[0]["is_current"] is False

    # Already-decided proposals cannot be decided again.
    again = await _decide(client, admin_user, proposal["id"])
    assert again.status_code == 409

    # Certificate PDF for the adopted proposal.
    certificate = await client.get(
        f"/api/admin/amendments/proposals/{proposal['id']}/certificate.pdf",
        headers=_headers(admin_user.id, "executive_committee"),
    )
    assert certificate.status_code == 200
    assert certificate.content[:5] == b"%PDF-"


async def test_four_fifths_majority_validation(client, db_session, admin_user):
    member = await _member(db_session)
    await _seed_v1(client, admin_user)
    proposal = await _propose(client, member, is_dissolution=True)
    meeting = await _noticed_meeting(db_session)
    await _attach(client, admin_user, proposal["id"], meeting.id)

    # 3 of 4 for/against = 75% < 80% -> invalid.
    blocked = await _decide(
        client, admin_user, proposal["id"], votes_for=3, votes_against=1, votes_abstain=0
    )
    assert blocked.status_code == 409
    assert "চার-পঞ্চমাংশ" in blocked.json()["detail"]

    # 4 of 5 = 80% -> passes.
    adopted = await _decide(
        client, admin_user, proposal["id"], votes_for=4, votes_against=1, votes_abstain=2
    )
    assert adopted.status_code == 200, adopted.text
    assert adopted.json()["status"] == "adopted"


async def test_reject_records_reason(client, db_session, admin_user):
    member = await _member(db_session)
    proposal = await _propose(client, member)
    rejected = await client.post(
        f"/api/admin/amendments/proposals/{proposal['id']}/reject",
        json={"reason": "গঠনতন্ত্রের অন্য অনুচ্ছেদের সাথে সাংঘর্ষিক"},
        headers=_headers(admin_user.id, "executive_committee"),
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["decision_note"] == "গঠনতন্ত্রের অন্য অনুচ্ছেদের সাথে সাংঘর্ষিক"

    row = (
        await db_session.execute(
            sa_select(AmendmentProposal).where(AmendmentProposal.id == proposal["id"])
        )
    ).scalar_one()
    assert row.decided_at is not None


async def test_admin_can_propose(client, db_session, admin_user):
    response = await client.post(
        "/api/admin/amendments/proposals",
        json={"title": "সদস্য ফি সংশোধনী", "rationale": "...", "proposed_text": "নতুন পাঠ"},
        headers=_headers(admin_user.id, "executive_committee"),
    )
    assert response.status_code == 201
    assert response.json()["proposed_by_admin_id"] == admin_user.id
