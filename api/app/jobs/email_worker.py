"""Delivers queued emails. Run with `uv run python -m app.jobs.email_worker`."""

import asyncio
import logging
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.clock import utcnow
from app.db import build_engine, build_sessionmaker
from app.emails.templates import EmailTemplate, render_email
from app.integrations.email_senders import EmailSender, build_email_sender
from app.logging_config import configure_logging
from app.models.email_outbox import OutboxEmail, OutboxStatus
from app.repositories.email_outbox import OutboxRepository
from app.settings import get_settings

logger = logging.getLogger(__name__)

BATCH_SIZE = 20
MAX_ATTEMPTS = 8
BASE_RETRY_DELAY = timedelta(seconds=30)
POLL_INTERVAL_SECONDS = 2.0
ERROR_MAX_LENGTH = 500


def retry_delay(attempts: int) -> timedelta:
    return BASE_RETRY_DELAY * int(2 ** (attempts - 1))


async def _deliver_one(email: OutboxEmail, sender: EmailSender, sender_address: str) -> None:
    message = render_email(
        EmailTemplate(email.template), email.locale, email.to_address, email.payload or {}
    )
    await sender.send(message, sender_address)


async def deliver_due_emails(
    sessionmaker: async_sessionmaker[AsyncSession], sender: EmailSender, sender_address: str
) -> int:
    """Sends one batch. Returns how many emails were processed (sent or failed)."""
    async with sessionmaker() as session:
        now = utcnow()
        batch = await OutboxRepository(session).claim_due(now, BATCH_SIZE)
        for email in batch:
            email.attempts += 1
            try:
                await _deliver_one(email, sender, sender_address)
            except Exception as exc:  # any provider failure must be retried, not crash the loop
                email.last_error = f"{type(exc).__name__}: {exc}"[:ERROR_MAX_LENGTH]
                if email.attempts >= MAX_ATTEMPTS:
                    email.status = OutboxStatus.DEAD
                    email.payload = None
                    logger.error(
                        "email_dead_lettered",
                        extra={"outbox_id": email.id, "template": email.template},
                    )
                else:
                    email.next_attempt_at = now + retry_delay(email.attempts)
                    logger.warning(
                        "email_delivery_failed",
                        extra={"outbox_id": email.id, "attempts": email.attempts},
                    )
                continue
            email.status = OutboxStatus.SENT
            email.sent_at = now
            # One-time links must not outlive delivery in the database.
            email.payload = None
            logger.info("email_sent", extra={"outbox_id": email.id, "template": email.template})
        await session.commit()
        return len(batch)


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    engine = build_engine(settings)
    sessionmaker = build_sessionmaker(engine)
    sender = build_email_sender(settings)
    logger.info("email_worker_started", extra={"backend": settings.email_backend})
    try:
        while True:
            processed = await deliver_due_emails(sessionmaker, sender, settings.email_from)
            if processed < BATCH_SIZE:
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
