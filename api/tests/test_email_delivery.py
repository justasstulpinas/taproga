from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.clock import utcnow
from app.emails.templates import EmailTemplate, render_email
from app.integrations.email_senders import EmailMessage, MemoryEmailSender
from app.jobs.email_worker import MAX_ATTEMPTS, deliver_due_emails
from app.models import OutboxEmail, OutboxStatus
from app.models.user import Locale
from tests.conftest import SessionMaker, outbox_for, register_body

SENDER = "Ta Proga <no-reply@taproga.test>"


class FailingSender:
    async def send(self, message: EmailMessage, sender: str) -> None:
        raise ConnectionError("provider down")


class RecipientEchoingSender:
    """Fails like providers that quote the rejected address in their error."""

    def __init__(self, failures: int) -> None:
        self.failures = failures

    async def send(self, message: EmailMessage, sender: str) -> None:
        if self.failures > 0:
            self.failures -= 1
            raise ConnectionError(f"mailbox {message.to} unavailable")


async def test_worker_delivers_and_scrubs_the_one_time_link(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await client.post("/api/v1/auth/register", json=register_body("ona@example.lt", locale="lt"))
    sender = MemoryEmailSender()

    processed = await deliver_due_emails(sessionmaker, sender, SENDER)

    assert processed == 1
    [message] = sender.sent
    assert message.to == "ona@example.lt"
    assert message.subject == "Patvirtinkite el. pašto adresą"
    assert "/verify-email#token=" in message.text
    assert "/verify-email#token=" in message.html
    [stored] = await outbox_for(sessionmaker, "ona@example.lt")
    assert stored.status is OutboxStatus.SENT
    assert stored.payload is None


async def test_worker_retries_with_backoff_then_dead_letters(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await client.post("/api/v1/auth/register", json=register_body("ona@example.lt"))

    for attempt in range(1, MAX_ATTEMPTS + 1):
        await deliver_due_emails(sessionmaker, FailingSender(), SENDER)
        [stored] = await outbox_for(sessionmaker, "ona@example.lt")
        assert stored.attempts == attempt
        async with sessionmaker() as session:  # make the retry due immediately
            await session.execute(
                update(OutboxEmail).values(next_attempt_at=utcnow() - timedelta(seconds=1))
            )
            await session.commit()

    [stored] = await outbox_for(sessionmaker, "ona@example.lt")
    assert stored.status is OutboxStatus.DEAD
    assert stored.payload is None
    assert stored.last_error == "ConnectionError: provider down"


# Vaises templates are covered in test_vaises_emails.py (the receipts carry no links by design).
@pytest.mark.parametrize(
    "template", [t for t in EmailTemplate if not t.value.startswith("vaises_")]
)
@pytest.mark.parametrize("locale", list(Locale))
def test_every_template_renders_html_and_text(template: EmailTemplate, locale: Locale) -> None:
    payload = {
        "verify_url": "https://taproga.com/verify-email#token=abc",
        "reset_url": "https://taproga.com/reset-password#token=abc",
        "login_url": "https://taproga.com/login",
        "forgot_url": "https://taproga.com/forgot-password",
    }

    message = render_email(template, locale, "ona@example.lt", payload)

    assert message.subject
    assert "https://taproga.com/" in message.text
    assert "https://taproga.com/" in message.html
    assert message.html.startswith("<!doctype html>")


def test_template_escapes_link_values() -> None:
    message = render_email(
        EmailTemplate.VERIFY_EMAIL,
        Locale.EN,
        "ona@example.lt",
        {"verify_url": 'https://taproga.com/x"><script>alert(1)</script>'},
    )

    assert "<script>" not in message.html


VISITOR = "jonas@pavyzdys.lt"
OWNER = "owner@vaises.lt"
OWNER_PAYLOAD = {
    "kind_label": "Datos užklausa",
    "service_label": "Vestuvės",
    "date_label": "2026 m. lapkričio 14 d.",
    "availability_label": "laisva",
    "contact": VISITOR,
    "message": "",
    "admin_url": "http://localhost:3000/admin/vaises/uzklausos?id=abc",
}


async def queue(
    sessionmaker: SessionMaker, template: EmailTemplate, to: str, payload: dict[str, str]
) -> int:
    async with sessionmaker() as session:
        email = OutboxEmail(to_address=to, template=template, locale=Locale.LT, payload=payload)
        session.add(email)
        await session.commit()
        return email.id


async def stored(sessionmaker: SessionMaker, email_id: int) -> OutboxEmail:
    async with sessionmaker() as session:
        email = await session.get(OutboxEmail, email_id)
        assert email is not None
        return email


@pytest.mark.parametrize(
    ("template", "payload"),
    [
        (EmailTemplate.VAISES_RECEIPT_DATE, {"date_label": "2026 m. lapkričio 14 d."}),
        (EmailTemplate.VAISES_RECEIPT_CONSULTATION, {}),
    ],
)
async def test_vaises_receipt_recipient_is_redacted_after_send(
    sessionmaker: SessionMaker, template: EmailTemplate, payload: dict[str, str]
) -> None:
    email_id = await queue(sessionmaker, template, VISITOR, payload)
    sender = MemoryEmailSender()

    await deliver_due_emails(sessionmaker, sender, SENDER)

    assert [m.to for m in sender.sent] == [VISITOR]
    email = await stored(sessionmaker, email_id)
    assert email.status is OutboxStatus.SENT
    assert email.to_address == ""
    assert email.payload is None


async def test_vaises_receipt_recipient_is_redacted_when_dead_lettered(
    sessionmaker: SessionMaker,
) -> None:
    email_id = await queue(sessionmaker, EmailTemplate.VAISES_RECEIPT_CONSULTATION, VISITOR, {})

    for _ in range(MAX_ATTEMPTS):
        await deliver_due_emails(sessionmaker, RecipientEchoingSender(failures=1), SENDER)
        async with sessionmaker() as session:  # make the retry due immediately
            await session.execute(
                update(OutboxEmail).values(next_attempt_at=utcnow() - timedelta(seconds=1))
            )
            await session.commit()

    email = await stored(sessionmaker, email_id)
    assert email.status is OutboxStatus.DEAD
    assert email.to_address == ""
    assert email.payload is None
    assert email.last_error is None


async def test_vaises_receipt_error_is_redacted_after_a_retried_send(
    sessionmaker: SessionMaker,
) -> None:
    email_id = await queue(sessionmaker, EmailTemplate.VAISES_RECEIPT_CONSULTATION, VISITOR, {})
    sender = RecipientEchoingSender(failures=1)

    await deliver_due_emails(sessionmaker, sender, SENDER)
    assert VISITOR in ((await stored(sessionmaker, email_id)).last_error or "")
    async with sessionmaker() as session:  # make the retry due immediately
        await session.execute(
            update(OutboxEmail).values(next_attempt_at=utcnow() - timedelta(seconds=1))
        )
        await session.commit()
    await deliver_due_emails(sessionmaker, sender, SENDER)

    email = await stored(sessionmaker, email_id)
    assert email.status is OutboxStatus.SENT
    assert email.to_address == ""
    assert email.last_error is None


async def test_auth_email_keeps_its_recipient_after_send(sessionmaker: SessionMaker) -> None:
    email_id = await queue(
        sessionmaker,
        EmailTemplate.VERIFY_EMAIL,
        "ona@example.lt",
        {"verify_url": "https://taproga.com/verify-email#token=abc"},
    )

    await deliver_due_emails(sessionmaker, MemoryEmailSender(), SENDER)

    email = await stored(sessionmaker, email_id)
    assert email.status is OutboxStatus.SENT
    assert email.to_address == "ona@example.lt"


async def test_owner_notification_keeps_recipient_and_drops_contact(
    sessionmaker: SessionMaker,
) -> None:
    email_id = await queue(
        sessionmaker, EmailTemplate.VAISES_OWNER_NOTIFICATION, OWNER, OWNER_PAYLOAD
    )

    await deliver_due_emails(sessionmaker, MemoryEmailSender(), SENDER)

    email = await stored(sessionmaker, email_id)
    assert email.status is OutboxStatus.SENT
    assert email.to_address == OWNER
    assert email.payload is None
