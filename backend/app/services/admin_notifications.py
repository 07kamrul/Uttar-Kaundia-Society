"""Email alerts to admins when a new application needs review."""

import logging
from html import escape

from app.core.config import get_settings
from app.services.email import send_email, send_with_retries

logger = logging.getLogger(__name__)
settings = get_settings()


def admin_recipients() -> list[str]:
    """Inboxes from ADMIN_NOTIFY_EMAILS, falling back to ADMIN_EMAIL."""
    configured = [email.strip() for email in settings.admin_notify_emails.split(",") if email.strip()]
    return configured or [settings.admin_email]


def _body(kind: str, applicant_name: str, mobile: str, reference: str, review_url: str) -> str:
    # Applicant fields come from a public form - escape before embedding in HTML.
    return (
        f"<p>A new {escape(kind)} application has been submitted and is awaiting approval.</p>"
        "<ul>"
        f"<li><strong>Applicant:</strong> {escape(applicant_name)}</li>"
        f"<li><strong>Mobile:</strong> {escape(mobile)}</li>"
        f"<li><strong>Reference:</strong> {escape(reference)}</li>"
        "</ul>"
        f'<p><a href="{escape(review_url)}">Review and approve the application</a></p>'
    )


async def notify_admins_new_application(
    *, kind: str, applicant_name: str, mobile: str, reference: str, review_path: str
) -> None:
    """Email every admin recipient. Never raises: runs as a background task
    after the submission is committed, so failures are only logged."""
    review_url = f"{settings.frontend_base_url.rstrip('/')}{review_path}"
    # Strip CR/LF so applicant input cannot inject extra mail headers.
    safe_name = " ".join(applicant_name.split())
    subject = f"New {kind} application awaiting approval - {safe_name}"
    html_body = _body(kind, applicant_name, mobile, reference, review_url)
    for recipient in admin_recipients():
        sent = await send_with_retries(
            lambda to=recipient: send_email(to=to, subject=subject, html_body=html_body)
        )
        if not sent:
            logger.error("Admin application alert (%s %s) not delivered to %s", kind, reference, recipient)
