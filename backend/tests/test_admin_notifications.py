import json

import pytest
from httpx import AsyncClient

from app.services import admin_notifications
from tests.test_membership_appeal import member_headers  # noqa: F401 - fixture
from tests.test_submission_flow import _submission_payload

pytestmark = pytest.mark.asyncio


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    outbox: list[dict] = []

    async def fake_send_email(to: str, subject: str, html_body: str) -> bool:
        outbox.append({"to": to, "subject": subject, "html_body": html_body})
        return True

    monkeypatch.setattr(admin_notifications, "send_email", fake_send_email)
    return outbox


async def test_default_recipient_is_society_admin_inbox() -> None:
    from app.core.config import Settings

    assert Settings.model_fields["admin_notify_emails"].default == "anshintech07@gmail.com"


async def test_recipients_parse_comma_list_and_fall_back_to_admin_email(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = admin_notifications.settings
    monkeypatch.setattr(settings, "admin_notify_emails", " a@x.com, ,B@x.com ")
    assert admin_notifications.admin_recipients() == ["a@x.com", "B@x.com"]

    monkeypatch.setattr(settings, "admin_notify_emails", "")
    monkeypatch.setattr(settings, "admin_email", "boss@x.com")
    assert admin_notifications.admin_recipients() == ["boss@x.com"]


async def test_notify_sends_one_email_per_admin_and_escapes_input(
    monkeypatch: pytest.MonkeyPatch, sent: list[dict]
) -> None:
    monkeypatch.setattr(admin_notifications.settings, "admin_notify_emails", "a@x.com,b@x.com")

    await admin_notifications.notify_admins_new_application(
        kind="Registration",
        applicant_name="<script>alert(1)</script>",
        mobile="01700000000",
        reference="42",
        review_path="/submissions/42",
    )

    assert [mail["to"] for mail in sent] == ["a@x.com", "b@x.com"]
    body = sent[0]["html_body"]
    assert "<script>" not in body
    assert "&lt;script&gt;" in body
    assert "/submissions/42" in body


async def test_notify_never_raises_when_delivery_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    async def failing_send(**_kwargs) -> bool:
        return False

    async def no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(admin_notifications, "send_email", failing_send)
    monkeypatch.setattr("app.services.email.asyncio.sleep", no_sleep)

    await admin_notifications.notify_admins_new_application(
        kind="Registration", applicant_name="X", mobile="1", reference="1", review_path="/x"
    )


async def test_public_submission_notifies_admins(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, sent: list[dict]
) -> None:
    monkeypatch.setattr(admin_notifications.settings, "admin_notify_emails", "admin@society.org")

    response = await client.post("/api/submissions", data={"payload": json.dumps(_submission_payload())})

    assert response.status_code == 201
    assert len(sent) == 1
    assert sent[0]["to"] == "admin@society.org"
    assert "Test User" in sent[0]["html_body"]
    assert f"/submissions/{response.json()['id']}" in sent[0]["html_body"]


async def test_invalid_submission_sends_no_email(client: AsyncClient, sent: list[dict]) -> None:
    response = await client.post("/api/submissions", data={"payload": "not json"})

    assert response.status_code >= 400
    assert sent == []


async def test_member_membership_application_notifies_admins(
    client: AsyncClient, member_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch, sent: list[dict]
) -> None:
    monkeypatch.setattr(admin_notifications.settings, "admin_notify_emails", "admin@society.org")

    response = await client.post(
        "/api/member/membership-applications",
        json={
            "full_name": "New Applicant",
            "father_name": "F",
            "mother_name": "M",
            "mobile": "01700000001",
            "email": "new@example.com",
            "ownership_type": "owner",
            "consent": True,
        },
        headers=member_headers,
    )

    assert response.status_code == 200, response.text
    assert len(sent) == 1
    assert "New Applicant" in sent[0]["html_body"]
    assert response.json()["application_no"] in sent[0]["html_body"]
    assert "/applications" in sent[0]["html_body"]
