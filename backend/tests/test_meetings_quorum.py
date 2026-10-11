"""Module 3 — meetings, quorum, notice periods, petitions, vote modes.

Covers: AGM 15-day / emergency 3-day notice enforcement + audited override;
quorum rejection on completion + the forever-visible acknowledge flag;
20% petition threshold + 30-day response SLA; tie -> casting vote required;
open-vote attribution vs secret-ballot secrecy.
"""

from datetime import date, datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.audit_log import AuditLog
from app.models.member import MEMBER_CLASS_GENERAL, Member, MemberStatus
from app.models.notice import Notice
from app.models.resolution_book import SpecialSessionPetition
from app.services.governance import PETITION_RESPONSE_DAYS, add_working_days

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


async def _make_member(db_session, n: int, **kw) -> Member:
    member = Member(
        status=MemberStatus.APPROVED,
        full_name=f"Quorum Member {n}",
        father_or_husband="Father",
        mother="Mother",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="Job",
        nid=f"22345678900{n}",
        mobile=f"0185829042{n}",
        gender="পুরুষ",
        email=f"quorum{n}@example.com",
        admission_fee="500",
        subscription="100",
        receipt_no=f"Q-{n}",
        payment_method="Cash",
        submission_date="2026-01-01",
        member_class=MEMBER_CLASS_GENERAL,
        **kw,
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)
    return member


async def _make_members(db_session, count: int) -> list[Member]:
    return [await _make_member(db_session, n) for n in range(1, count + 1)]


def _meeting_payload(members: list[Member], present_count: int, **overrides) -> dict:
    payload = {
        "date": str(TODAY),
        "chairperson": "সভাপতি সাহেব",
        "agenda": "বার্ষিক পরিকল্পনা",
        "status": "completed",
        "attendance": [
            {"member_id": m.id, "status": "present" if i < present_count else "absent"}
            for i, m in enumerate(members)
        ],
        "resolutions": [],
        "notify": False,
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Notice-period enforcement
# ---------------------------------------------------------------------------


async def _scheduled_meeting(client, admin, council_type: str, start_in_days: int) -> int:
    response = await client.post(
        "/api/resolution-book/meetings",
        json=_meeting_payload(
            [],
            0,
            status="scheduled",
            council_type=council_type,
            scheduled_start_at=datetime.now(timezone.utc).isoformat()
            if start_in_days is None
            else (datetime.now(timezone.utc) + timedelta(days=start_in_days)).isoformat(),
        ),
        headers=admin,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def test_agm_needs_15_days_notice_but_can_be_overridden(client, db_session, admin_user):
    admin = await _admin_headers(client)
    meeting_id = await _scheduled_meeting(client, admin, "agm", 5)
    response = await client.post(
        f"/api/resolution-book/meetings/{meeting_id}/publish-notice",
        json={"override": False},
        headers=admin,
    )
    assert response.status_code == 409
    assert "15" in response.json()["detail"]

    response = await client.post(
        f"/api/resolution-book/meetings/{meeting_id}/publish-notice",
        json={"override": True},
        headers=admin,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["notice_published_at"] is not None

    # The override itself is audited with its own action.
    audits = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    AuditLog.action == "meeting.notice_published_override",
                    AuditLog.entity_id == str(meeting_id),
                )
            )
        )
        .scalars()
        .all()
    )
    assert audits, "notice override must be audit-logged"
    # The sitting notice is published through the Notices feature.
    notices = (await db_session.execute(select(Notice))).scalars().all()
    assert any("সভার নোটিশ" in n.title for n in notices)

    # Publishing twice is idempotent-ish: notice already out, still allowed.
    response = await client.post(
        f"/api/resolution-book/meetings/{meeting_id}/publish-notice",
        json={"override": True},
        headers=admin,
    )
    assert response.status_code == 200


async def test_emergency_meeting_needs_3_days_notice(client, db_session, admin_user):
    admin = await _admin_headers(client)
    meeting_id = await _scheduled_meeting(client, admin, "emergency", 1)
    response = await client.post(
        f"/api/resolution-book/meetings/{meeting_id}/publish-notice",
        json={"override": False},
        headers=admin,
    )
    assert response.status_code == 409
    assert "3" in response.json()["detail"]

    # An executive sitting has no statutory minimum.
    meeting_id = await _scheduled_meeting(client, admin, "executive", 0)
    response = await client.post(
        f"/api/resolution-book/meetings/{meeting_id}/publish-notice",
        json={"override": False},
        headers=admin,
    )
    assert response.status_code == 200


async def test_publish_notice_requires_scheduled_start(client, db_session, admin_user):
    admin = await _admin_headers(client)
    response = await client.post(
        "/api/resolution-book/meetings",
        json=_meeting_payload([], 0, status="scheduled"),
        headers=admin,
    )
    meeting_id = response.json()["id"]
    response = await client.post(
        f"/api/resolution-book/meetings/{meeting_id}/publish-notice",
        json={"override": True},
        headers=admin,
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Quorum
# ---------------------------------------------------------------------------


async def test_completing_below_quorum_is_rejected_unless_acknowledged(client, db_session, admin_user):
    admin = await _admin_headers(client)
    members = await _make_members(db_session, 6)
    # 4 of the 6 required (executive quorum = 6 of 11) present.
    response = await client.post(
        "/api/resolution-book/meetings",
        json=_meeting_payload(members, 4),
        headers=admin,
    )
    assert response.status_code == 409
    assert "কোরাম" in response.json()["detail"]

    response = await client.post(
        "/api/resolution-book/meetings",
        json=_meeting_payload(members, 4, acknowledge_no_quorum=True),
        headers=admin,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["quorum_present"] == 4
    assert body["quorum_required"] == 6
    assert body["quorum_acknowledged"] is True

    audits = (
        (
            await db_session.execute(
                select(AuditLog).where(AuditLog.action == "meeting.no_quorum_acknowledged")
            )
        )
        .scalars()
        .all()
    )
    assert audits, "quorum acknowledgement must be audit-logged"

    # Full quorum passes cleanly without any acknowledgement.
    response = await client.post(
        "/api/resolution-book/meetings",
        json=_meeting_payload(members, 6),
        headers=admin,
    )
    assert response.status_code == 201
    assert response.json()["quorum_acknowledged"] is False

    # The complete endpoint enforces the same rule for scheduled sittings.
    response = await client.post(
        "/api/resolution-book/meetings",
        json=_meeting_payload(members, 2, status="scheduled"),
        headers=admin,
    )
    meeting_id = response.json()["id"]
    response = await client.post(
        f"/api/resolution-book/meetings/{meeting_id}/complete",
        json={"acknowledge_no_quorum": False},
        headers=admin,
    )
    assert response.status_code == 409
    response = await client.post(
        f"/api/resolution-book/meetings/{meeting_id}/complete",
        json={"acknowledge_no_quorum": True},
        headers=admin,
    )
    assert response.status_code == 200
    assert response.json()["quorum_acknowledged"] is True


# ---------------------------------------------------------------------------
# Special-session petitions
# ---------------------------------------------------------------------------


async def test_petition_threshold_signing_and_sla(client, db_session, admin_user):
    admin = await _admin_headers(client)
    members = await _make_members(db_session, 6)
    # 6 eligible members -> required = ceil(20% of 6) = 2 signatures.
    a, b = members[0], members[1]

    response = await client.post(
        "/api/petitions",
        json={"title": "বিশেষ সভার দাবি", "justification": "রাস্তা মেরামত নিয়ে আলোচনা"},
        headers=_member_headers(a),
    )
    assert response.status_code == 201, response.text
    petition = response.json()
    assert petition["required_count"] == 2
    assert petition["signature_count"] == 1  # the filer signs first
    assert petition["response_due"] == str(add_working_days(TODAY, PETITION_RESPONSE_DAYS))
    petition_id = petition["id"]

    # Double-signing is blocked.
    response = await client.post(
        f"/api/petitions/{petition_id}/sign", headers=_member_headers(a)
    )
    assert response.status_code == 409

    response = await client.post(
        f"/api/petitions/{petition_id}/sign", headers=_member_headers(b)
    )
    assert response.status_code == 200
    assert response.json()["signature_count"] == 2

    # Member progress view.
    response = await client.get(f"/api/petitions/{petition_id}", headers=_member_headers(b))
    assert response.status_code == 200
    assert response.json()["sla"]["state"] in ("on_track", "due_soon")

    # Admin list carries the live SLA badge; respond moves it out of the SLA.
    listing = (await client.get("/api/petitions", headers=admin)).json()
    assert listing["items"][0]["id"] == petition_id
    assert listing["items"][0]["sla"] is not None

    response = await client.post(
        f"/api/petitions/{petition_id}/respond",
        json={"committee_response": "সভা আহ্বান করা হলো", "scheduled": True},
        headers=admin,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "scheduled"
    assert body["sla"]["state"] == "met"

    # Non-signers cannot peek at the progress endpoint.
    c = members[2]
    response = await client.get(f"/api/petitions/{petition_id}", headers=_member_headers(c))
    assert response.status_code == 403


async def test_petition_rejected_with_reason(client, db_session, admin_user):
    admin = await _admin_headers(client)
    member = await _make_member(db_session, 20)
    response = await client.post(
        "/api/petitions",
        json={"title": "t", "justification": "j"},
        headers=_member_headers(member),
    )
    petition_id = response.json()["id"]
    response = await client.post(
        f"/api/petitions/{petition_id}/reject",
        json={"reason": "বিষয়টি ইতিমধ্যে নিষ্পত্তি হয়েছে"},
        headers=admin,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    stored = (
        await db_session.execute(
            select(SpecialSessionPetition).where(SpecialSessionPetition.id == petition_id)
        )
    ).scalar_one()
    assert stored.committee_response == "বিষয়টি ইতিমধ্যে নিষ্পত্তি হয়েছে"


# ---------------------------------------------------------------------------
# Vote modes: tie -> casting vote; open attribution vs secret secrecy
# ---------------------------------------------------------------------------


async def _meeting_with_resolution(client, admin, members, resolution: dict) -> tuple[int, int]:
    response = await client.post(
        "/api/resolution-book/meetings",
        json=_meeting_payload(
            members, len(members), status="scheduled", resolutions=[resolution]
        ),
        headers=admin,
    )
    assert response.status_code == 201, response.text
    meeting = response.json()
    return meeting["id"], meeting["resolutions"][0]["id"]


async def test_tied_vote_requires_casting_vote_before_done(client, db_session, admin_user):
    admin = await _admin_headers(client)
    members = await _make_members(db_session, 6)
    meeting_id, resolution_id = await _meeting_with_resolution(
        client, admin, members,
        {"decision": "উন্নয়ন প্রকল্প অনুমোদন", "vote_for": 3, "vote_against": 3, "vote_neutral": 0},
    )
    response = await client.put(
        f"/api/resolution-book/resolutions/{resolution_id}",
        json={"status": "done"},
        headers=admin,
    )
    assert response.status_code == 409
    assert "casting vote" in response.json()["detail"]

    response = await client.put(
        f"/api/resolution-book/resolutions/{resolution_id}",
        json={"status": "done", "casting_vote": "for", "casting_note": "সভাপতির সিদ্ধান্তমূলক ভোট"},
        headers=admin,
    )
    assert response.status_code == 200
    body = response.json()["resolution"]
    assert body["casting_vote"] == "for"

    # A non-tied resolution needs no casting vote.
    _, plain_id = await _meeting_with_resolution(
        client, admin, members,
        {"decision": "সাধারণ সিদ্ধান্ত", "vote_for": 4, "vote_against": 1, "vote_neutral": 0},
    )
    response = await client.put(
        f"/api/resolution-book/resolutions/{plain_id}",
        json={"status": "done"},
        headers=admin,
    )
    assert response.status_code == 200


async def test_open_vote_records_attribution_secret_refuses_it(client, db_session, admin_user):
    admin = await _admin_headers(client)
    members = await _make_members(db_session, 6)

    meeting_id, open_id = await _meeting_with_resolution(
        client, admin, members,
        {
            "decision": "উন্মুক্ত ভোটে সিদ্ধান্ত",
            "vote_for": 4, "vote_against": 2, "vote_neutral": 0,
            "vote_mode": "open",
        },
    )
    entries = [
        {"member_id": members[0].id, "choice": "for"},
        {"member_id": members[1].id, "choice": "against"},
    ]
    response = await client.post(
        f"/api/resolution-book/resolutions/{open_id}/choices", json={"entries": entries}, headers=admin
    )
    assert response.status_code == 200
    detail = (await client.get(f"/api/resolution-book/meetings/{meeting_id}", headers=admin)).json()
    resolution = next(r for r in detail["resolutions"] if r["id"] == open_id)
    assert resolution["open_choices"] is not None and len(resolution["open_choices"]) == 2
    assert {c["choice"] for c in resolution["open_choices"]} == {"for", "against"}

    # Switching the resolution to secret WIPES the per-member attribution.
    response = await client.put(
        f"/api/resolution-book/resolutions/{open_id}",
        json={"vote_mode": "secret"},
        headers=admin,
    )
    assert response.status_code == 200
    detail = (await client.get(f"/api/resolution-book/meetings/{meeting_id}", headers=admin)).json()
    resolution = next(r for r in detail["resolutions"] if r["id"] == open_id)
    assert resolution["open_choices"] is None
    assert resolution["vote_mode"] == "secret"

    _, secret_id = await _meeting_with_resolution(
        client, admin, members,
        {
            "decision": "গোপন ভোটে সিদ্ধান্ত",
            "vote_for": 4, "vote_against": 2, "vote_neutral": 0,
            "vote_mode": "secret",
        },
    )
    response = await client.post(
        f"/api/resolution-book/resolutions/{secret_id}/choices",
        json={"entries": entries},
        headers=admin,
    )
    assert response.status_code == 409, "secret ballots never store per-member choices"
