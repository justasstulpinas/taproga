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


@pytest.mark.parametrize("template", list(EmailTemplate))
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
