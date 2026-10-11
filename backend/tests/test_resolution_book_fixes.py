"""Resolution Book hardening: quorum recompute on attendance edits, notice
immutability after publication, meeting-number suggestion, Dhaka edit cutoff
and aggregate dashboard counts."""

from datetime import date, datetime, time, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.notice import Notice
from app.models.resolution_book import MEETING_STATUS_COMPLETED, Meeting
from app.services import resolution_book as rb_service
from tests.test_meetings_quorum import _admin_headers, _make_members, _meeting_payload

pytestmark = pytest.mark.asyncio


def _attendance(members, present: int) -> dict:
    return {
        "entries": [
            {"member_id": m.id, "status": "present" if i < present else "absent"}
            for i, m in enumerate(members)
        ]
    }


async def test_bulk_attendance_recomputes_quorum_on_completed_meeting(client, db_session, admin_user):
    admin = await _admin_headers(client)
    members = await _make_members(db_session, 6)
    response = await client.post(
        "/api/resolution-book/meetings", json=_meeting_payload(members, 6), headers=admin
    )
    assert response.status_code == 201, response.text
    meeting_id = response.json()["id"]

    # Dropping below quorum without acknowledgement is rejected.
    response = await client.post(
        f"/api/resolution-book/meetings/{meeting_id}/attendance",
        json=_attendance(members, 4),
        headers=admin,
    )
    assert response.status_code == 409

    response = await client.post(
        f"/api/resolution-book/meetings/{meeting_id}/attendance",
        json={**_attendance(members, 4), "acknowledge_no_quorum": True},
        headers=admin,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["quorum_present"] == 4
    assert body["quorum_acknowledged"] is True

    # A further drop is a new shortfall: the old acknowledgement does not cover it.
    response = await client.post(
        f"/api/resolution-book/meetings/{meeting_id}/attendance",
        json=_attendance(members, 2),
        headers=admin,
    )
    assert response.status_code == 409

    # Restoring quorum clears the warning.
    response = await client.post(
        f"/api/resolution-book/meetings/{meeting_id}/attendance",
        json=_attendance(members, 6),
        headers=admin,
    )
    assert response.status_code == 200
    assert response.json()["quorum_present"] == 6
    assert response.json()["quorum_acknowledged"] is False


async def _published_agm(client, admin) -> int:
    start = datetime.now(timezone.utc) + timedelta(days=30)
    response = await client.post(
        "/api/resolution-book/meetings",
        json=_meeting_payload(
            [], 0, status="scheduled", council_type="agm", scheduled_start_at=start.isoformat()
        ),
        headers=admin,
    )
    assert response.status_code == 201, response.text
    meeting_id = response.json()["id"]
    response = await client.post(
        f"/api/resolution-book/meetings/{meeting_id}/publish-notice",
        json={"override": False},
        headers=admin,
    )
    assert response.status_code == 200, response.text
    return meeting_id


async def test_schedule_locked_after_notice_published(client, db_session, admin_user):
    admin = await _admin_headers(client)
    meeting_id = await _published_agm(client, admin)
    soon = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    response = await client.put(
        f"/api/resolution-book/meetings/{meeting_id}",
        json={"scheduled_start_at": soon},
        headers=admin,
    )
    assert response.status_code == 409
    response = await client.put(
        f"/api/resolution-book/meetings/{meeting_id}",
        json={"council_type": "executive"},
        headers=admin,
    )
    assert response.status_code == 409
    # Other fields stay editable.
    response = await client.put(
        f"/api/resolution-book/meetings/{meeting_id}", json={"agenda": "নতুন"}, headers=admin
    )
    assert response.status_code == 200


async def test_republishing_notice_creates_no_duplicate(client, db_session, admin_user):
    admin = await _admin_headers(client)
    meeting_id = await _published_agm(client, admin)
    before = len((await db_session.execute(select(Notice))).scalars().all())
    response = await client.post(
        f"/api/resolution-book/meetings/{meeting_id}/publish-notice",
        json={"override": False},
        headers=admin,
    )
    # Idempotent (test_meetings_quorum relies on a 200 re-publish).
    assert response.status_code == 200
    after = len((await db_session.execute(select(Notice))).scalars().all())
    assert after == before


async def test_notice_period_message_does_not_round_up(client, db_session, admin_user):
    admin = await _admin_headers(client)
    start = datetime.now(timezone.utc) + timedelta(days=14, hours=14)
    response = await client.post(
        "/api/resolution-book/meetings",
        json=_meeting_payload(
            [], 0, status="scheduled", council_type="agm", scheduled_start_at=start.isoformat()
        ),
        headers=admin,
    )
    meeting_id = response.json()["id"]
    response = await client.post(
        f"/api/resolution-book/meetings/{meeting_id}/publish-notice",
        json={"override": False},
        headers=admin,
    )
    assert response.status_code == 409
    assert "15 days < 15" not in response.json()["detail"]
    assert "14.5 days" in response.json()["detail"]


async def test_suggested_meeting_no_uses_max_suffix(client, db_session, admin_user):
    db_session.add_all(
        [
            Meeting(meeting_no="SVA-2026-007", date=date(2026, 3, 1), chairperson="x", agenda="a"),
            Meeting(meeting_no="custom-no", date=date(2026, 4, 1), chairperson="x", agenda="a"),
        ]
    )
    await db_session.commit()
    assert await rb_service.next_meeting_no(db_session, date(2026, 10, 1)) == "SVA-2026-008"
    assert await rb_service.next_meeting_no(db_session, date(2027, 1, 1)) == "SVA-2027-001"


async def test_edit_cutoff_uses_dhaka_end_of_day():
    meeting = Meeting(meeting_no="x", date=date(2026, 1, 1), chairperson="x", agenda="a")
    meeting.status = MEETING_STATUS_COMPLETED
    # Dhaka end-of-day 2026-01-01 23:59:59+06 == 17:59:59 UTC; 72h later + 1h.
    dhaka_eod_utc = datetime(2026, 1, 1, 17, 59, 59, tzinfo=timezone.utc)
    just_after = dhaka_eod_utc + timedelta(hours=73)
    assert rb_service.edit_cutoff_exceeded_at(meeting, just_after) is True
    assert rb_service.edit_cutoff_exceeded_at(meeting, dhaka_eod_utc + timedelta(hours=71)) is False


async def test_dashboard_aggregates(client, db_session, admin_user):
    admin = await _admin_headers(client)
    members = await _make_members(db_session, 6)
    payload = _meeting_payload(members, 6)
    payload["resolutions"] = [
        {"decision": "a", "vote_for": 1, "vote_against": 0, "vote_neutral": 0},
        {"decision": "b", "vote_for": 1, "vote_against": 0, "vote_neutral": 0, "status": "done"},
    ]
    assert (await client.post("/api/resolution-book/meetings", json=payload, headers=admin)).status_code == 201
    assert (
        await client.post(
            "/api/resolution-book/meetings",
            json=_meeting_payload(members, 3, acknowledge_no_quorum=True),
            headers=admin,
        )
    ).status_code == 201
    data = await rb_service.build_dashboard(db_session)
    assert data["total_meetings"] == 2
    assert data["open_action_items"] == 1
    assert data["average_attendance_percent"] == 75
    assert len(data["recent_meetings"]) == 2
    assert {m["resolution_count"] for m in data["recent_meetings"]} == {2, 0}
