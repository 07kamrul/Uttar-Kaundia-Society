"""Batch 0b admin surface: member/submission `search` (name, member id, email,
phone in any format / trailing digits) and the phone-fix queue endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.audit_log import AuditLog
from app.models.member import Member, MemberStatus
from app.models.nominee import Nominee
from app.models.phone_fix import PhoneFixQueue
from app.models.property import CoOwner, Property
from tests.test_finance import _headers

pytestmark = pytest.mark.asyncio


def _member(
    *, name: str, mobile: str, member_id: str, email: str, nid: str,
    status: MemberStatus = MemberStatus.APPROVED,
) -> Member:
    return Member(
        status=status,
        member_id=member_id,
        full_name=name,
        father_or_husband="f",
        mother="m",
        dob="1990-01-01",
        nationality="Bangladeshi",
        occupation="job",
        nid=nid,
        mobile=mobile,
        gender="male",
        email=email,
        admission_fee="500",
        subscription="100",
        receipt_no="r",
        payment_method="cash",
        submission_date="2026-01-01",
    )


@pytest.fixture
async def people(db_session: AsyncSession) -> dict[str, Member]:
    rahim = _member(name="রহিম উদ্দিন", mobile="+8801712345678", member_id="UKAMKS-101",
                    email="rahim@example.com", nid="1000000001")
    karim = _member(name="Karim Ali", mobile="01812345678", member_id="UKAMKS-102",
                    email="karim@example.com", nid="1000000002", status=MemberStatus.PENDING)
    saudi = _member(name="Saudi Worker", mobile="+966501234567", member_id="UKAMKS-103",
                    email="saudi@example.com", nid="1000000003")
    db_session.add_all([rahim, karim, saudi])
    await db_session.commit()
    return {"rahim": rahim, "karim": karim, "saudi": saudi}


async def _search(client: AsyncClient, admin_user, path: str, term: str, **extra) -> list[int]:
    response = await client.get(
        path, params={"search": term, **extra}, headers=_headers(admin_user.id, "executive_committee")
    )
    assert response.status_code == 200, response.text
    return sorted(item["id"] for item in response.json())


class TestMemberSearch:
    @pytest.mark.parametrize("term", ["karim", "KARIM", "  Karim  ", "Ali"])
    async def test_matches_name_case_insensitively(self, client, admin_user, people, term) -> None:
        assert await _search(client, admin_user, "/api/admin/members", term) == [people["karim"].id]

    async def test_matches_bangla_name(self, client, admin_user, people) -> None:
        assert await _search(client, admin_user, "/api/admin/members", "রহিম") == [people["rahim"].id]

    async def test_matches_member_id(self, client, admin_user, people) -> None:
        assert await _search(client, admin_user, "/api/admin/members", "UKAMKS-102") == [
            people["karim"].id
        ]
        assert await _search(client, admin_user, "/api/admin/members", "ukamks-1") == sorted(
            m.id for m in people.values()
        )

    async def test_matches_email(self, client, admin_user, people) -> None:
        assert await _search(client, admin_user, "/api/admin/members", "rahim@") == [people["rahim"].id]

    @pytest.mark.parametrize(
        "term",
        ["01712345678", "+8801712345678", "8801712345678", "০১৭১২৩৪৫৬৭৮", "017-1234-5678",
         "+880 1712 345678", "0088 01712345678"],
    )
    async def test_phone_in_any_format_finds_the_e164_row(
        self, client, admin_user, people, term
    ) -> None:
        assert await _search(client, admin_user, "/api/admin/members", term) == [people["rahim"].id]

    @pytest.mark.parametrize("term", ["01812345678", "+8801812345678", "8801812345678"])
    async def test_phone_in_any_format_finds_the_legacy_row(
        self, client, admin_user, people, term
    ) -> None:
        assert await _search(client, admin_user, "/api/admin/members", term) == [people["karim"].id]

    async def test_foreign_number(self, client, admin_user, people) -> None:
        assert await _search(client, admin_user, "/api/admin/members", "+966 50 123 4567") == [
            people["saudi"].id
        ]

    async def test_nine_trailing_digits_are_specific(self, client, admin_user, people) -> None:
        assert await _search(client, admin_user, "/api/admin/members", "712345678") == [
            people["rahim"].id
        ]

    async def test_seven_trailing_digits_match_every_number_ending_that_way(
        self, client, admin_user, people
    ) -> None:
        # 2345678 ends both Bangladeshi numbers but not the Saudi one; 1234567 ends
        # only the Saudi number.
        assert await _search(client, admin_user, "/api/admin/members", "2345678") == sorted(
            [people["rahim"].id, people["karim"].id]
        )
        assert await _search(client, admin_user, "/api/admin/members", "1234567") == [
            people["saudi"].id
        ]

    async def test_six_digits_do_not_trigger_phone_matching(
        self, client, admin_user, people
    ) -> None:
        assert await _search(client, admin_user, "/api/admin/members", "345678") == []

    async def test_no_match_and_wildcards_are_literal(self, client, admin_user, people) -> None:
        assert await _search(client, admin_user, "/api/admin/members", "zzz") == []
        assert await _search(client, admin_user, "/api/admin/members", "%") == []
        assert await _search(client, admin_user, "/api/admin/members", "_") == []

    async def test_blank_search_returns_everything(self, client, admin_user, people) -> None:
        assert await _search(client, admin_user, "/api/admin/members", "   ") == sorted(
            m.id for m in people.values()
        )

    async def test_pagination_applies_to_search_results(self, client, admin_user, people) -> None:
        headers = _headers(admin_user.id, "executive_committee")
        page_one = await client.get(
            "/api/admin/members", params={"search": "UKAMKS", "limit": 2, "offset": 0}, headers=headers
        )
        page_two = await client.get(
            "/api/admin/members", params={"search": "UKAMKS", "limit": 2, "offset": 2}, headers=headers
        )
        assert len(page_one.json()) == 2
        assert len(page_two.json()) == 1
        assert {m["id"] for m in page_one.json()} | {m["id"] for m in page_two.json()} == {
            m.id for m in people.values()
        }

    async def test_over_long_search_is_rejected(self, client, admin_user, people) -> None:
        response = await client.get(
            "/api/admin/members",
            params={"search": "x" * 300},
            headers=_headers(admin_user.id, "executive_committee"),
        )
        assert response.status_code == 422


class TestSubmissionSearch:
    async def test_combines_with_status_filter(self, client, admin_user, people) -> None:
        assert await _search(client, admin_user, "/api/admin/submissions", "karim") == [
            people["karim"].id
        ]
        assert await _search(
            client, admin_user, "/api/admin/submissions", "karim", status="approved"
        ) == []
        assert await _search(
            client, admin_user, "/api/admin/submissions", "karim", status="pending"
        ) == [people["karim"].id]

    @pytest.mark.parametrize("term", ["+8801712345678", "01712345678", "০১৭১২৩৪৫৬৭৮", "712345678"])
    async def test_phone_formats(self, client, admin_user, people, term) -> None:
        assert await _search(client, admin_user, "/api/admin/submissions", term) == [
            people["rahim"].id
        ]

    async def test_email_and_member_id(self, client, admin_user, people) -> None:
        assert await _search(client, admin_user, "/api/admin/submissions", "saudi@") == [
            people["saudi"].id
        ]
        assert await _search(client, admin_user, "/api/admin/submissions", "UKAMKS-103") == [
            people["saudi"].id
        ]


@pytest.fixture
async def queued(db_session: AsyncSession, people: dict[str, Member]) -> dict[str, PhoneFixQueue]:
    rahim, karim = people["rahim"], people["karim"]
    nominee = Nominee(member_id=rahim.id, name="Nom", relation="son", mobile="bad-nominee")
    prop = Property(member_id=karim.id, property_type=[])
    db_session.add_all([nominee, prop])
    await db_session.flush()
    co_owner = CoOwner(property_id=prop.id, owner_name="Co", owner_phone="bad-co")
    db_session.add(co_owner)
    await db_session.flush()
    karim.mobile = "12345"
    items = {
        "member": PhoneFixQueue(entity_type="member", entity_id=karim.id, field="mobile",
                                raw_value="12345"),
        "nominee": PhoneFixQueue(entity_type="nominee", entity_id=nominee.id, field="mobile",
                                 raw_value="bad-nominee"),
        "co_owner": PhoneFixQueue(entity_type="co_owner", entity_id=co_owner.id,
                                  field="owner_phone", raw_value="bad-co"),
    }
    db_session.add_all(items.values())
    await db_session.commit()
    for item in items.values():
        await db_session.refresh(item)
    return items


class TestPhoneFixes:
    async def test_lists_unresolved_items_with_member_context(
        self, client, admin_user, people, queued
    ) -> None:
        response = await client.get(
            "/api/admin/phone-fixes", headers=_headers(admin_user.id, "executive_committee")
        )

        assert response.status_code == 200
        by_type = {item["entity_type"]: item for item in response.json()}
        assert set(by_type) == {"member", "nominee", "co_owner"}
        assert by_type["member"]["raw_value"] == "12345"
        assert by_type["member"]["field"] == "mobile"
        assert by_type["member"]["member_pk"] == people["karim"].id
        assert by_type["member"]["member_code"] == "UKAMKS-102"
        assert by_type["member"]["member_name"] == "Karim Ali"
        assert by_type["nominee"]["member_pk"] == people["rahim"].id
        assert by_type["co_owner"]["member_pk"] == people["karim"].id
        assert by_type["co_owner"]["field"] == "owner_phone"

    async def test_requires_member_manage_permission(self, client, people, queued) -> None:
        member_token = create_access_token(str(people["rahim"].id), "member")
        response = await client.get(
            "/api/admin/phone-fixes", headers={"Authorization": f"Bearer {member_token}"}
        )
        assert response.status_code == 403
        anonymous = await client.get("/api/admin/phone-fixes")
        assert anonymous.status_code in (401, 403)

    async def test_resolve_writes_e164_keeps_raw_audits_and_marks_resolved(
        self, client, admin_user, db_session, people, queued
    ) -> None:
        headers = _headers(admin_user.id, "executive_committee")
        item = queued["member"]
        item_id, karim_id, admin_id = item.id, people["karim"].id, admin_user.id

        response = await client.put(
            f"/api/admin/phone-fixes/{item_id}", json={"mobile": "০১৯১২৩৪৫৬৭৮"}, headers=headers
        )

        assert response.status_code == 200
        body = response.json()
        assert body["resolved_at"] is not None
        assert body["mobile"] == "+8801912345678"
        db_session.expire_all()
        karim = await db_session.get(Member, karim_id)
        assert karim.mobile == "+8801912345678"
        assert karim.mobile_raw == "12345"
        stored = await db_session.get(PhoneFixQueue, item_id)
        assert stored.resolved_at is not None
        assert stored.resolved_by_admin_id == admin_id
        audit = (
            await db_session.execute(select(AuditLog).where(AuditLog.action == "phone_fix.resolve"))
        ).scalars().all()
        assert len(audit) == 1
        assert audit[0].entity_type == "member"
        assert audit[0].entity_id == str(karim.id)
        listing = await client.get("/api/admin/phone-fixes", headers=headers)
        assert {i["entity_type"] for i in listing.json()} == {"nominee", "co_owner"}

    async def test_resolve_nominee_and_co_owner_columns(
        self, client, admin_user, db_session, queued
    ) -> None:
        headers = _headers(admin_user.id, "executive_committee")
        nominee_id = queued["nominee"].entity_id
        owner_id = queued["co_owner"].entity_id

        nominee_resp = await client.put(
            f"/api/admin/phone-fixes/{queued['nominee'].id}",
            json={"mobile": "+44 7911 123456"}, headers=headers,
        )
        owner_resp = await client.put(
            f"/api/admin/phone-fixes/{queued['co_owner'].id}",
            json={"mobile": "0044 7911 123456"}, headers=headers,
        )

        assert nominee_resp.status_code == 200
        assert owner_resp.status_code == 200
        db_session.expire_all()
        nominee = await db_session.get(Nominee, nominee_id)
        owner = await db_session.get(CoOwner, owner_id)
        assert nominee.mobile == "+447911123456"
        assert nominee.mobile_raw == "bad-nominee"
        assert owner.owner_phone == "+447911123456"
        assert owner.owner_phone_raw == "bad-co"

    @pytest.mark.parametrize("bad", ["12345", "", "   ", "abc"])
    async def test_resolve_with_invalid_phone_is_422(
        self, client, admin_user, queued, bad
    ) -> None:
        response = await client.put(
            f"/api/admin/phone-fixes/{queued['member'].id}",
            json={"mobile": bad},
            headers=_headers(admin_user.id, "executive_committee"),
        )
        assert response.status_code == 422
        assert "PHONE_INVALID" in response.text

    async def test_resolve_missing_body_field_is_422(self, client, admin_user, queued) -> None:
        response = await client.put(
            f"/api/admin/phone-fixes/{queued['member'].id}",
            json={},
            headers=_headers(admin_user.id, "executive_committee"),
        )
        assert response.status_code == 422

    async def test_unknown_item_is_404(self, client, admin_user) -> None:
        response = await client.put(
            "/api/admin/phone-fixes/9999",
            json={"mobile": "01712345678"},
            headers=_headers(admin_user.id, "executive_committee"),
        )
        assert response.status_code == 404

    async def test_resolving_twice_is_409(self, client, admin_user, queued) -> None:
        headers = _headers(admin_user.id, "executive_committee")
        url = f"/api/admin/phone-fixes/{queued['member'].id}"
        first = await client.put(url, json={"mobile": "01912345678"}, headers=headers)
        second = await client.put(url, json={"mobile": "01912345679"}, headers=headers)
        assert first.status_code == 200
        assert second.status_code == 409

    async def test_target_deleted_is_404(self, client, admin_user, db_session, queued) -> None:
        nominee = await db_session.get(Nominee, queued["nominee"].entity_id)
        await db_session.delete(nominee)
        await db_session.commit()

        response = await client.put(
            f"/api/admin/phone-fixes/{queued['nominee'].id}",
            json={"mobile": "01912345678"},
            headers=_headers(admin_user.id, "executive_committee"),
        )

        assert response.status_code == 404

    async def test_member_mobile_already_used_by_active_member_is_409(
        self, client, admin_user, people, queued
    ) -> None:
        response = await client.put(
            f"/api/admin/phone-fixes/{queued['member'].id}",
            json={"mobile": "+8801712345678"},  # Rahim's number
            headers=_headers(admin_user.id, "executive_committee"),
        )
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "PHONE_DUPLICATE"
