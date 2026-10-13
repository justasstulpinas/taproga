"""Anonymises old handled requests. Run daily with `uv run python -m app.jobs.vaises_retention`."""

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.db import build_engine, build_sessionmaker
from app.logging_config import configure_logging
from app.models.audit import ActorKind
from app.repositories.vaises import VaisesRepository
from app.services.audit import Actor, AuditAction, AuditService
from app.settings import get_settings

logger = logging.getLogger(__name__)

RETENTION_AFTER_HANDLED = timedelta(days=730)


async def run_retention(session: AsyncSession, now: datetime) -> int:
    """Returns how many requests were anonymised; always writes one audit entry."""
    count = await VaisesRepository(session).anonymise_handled_before(
        now - RETENTION_AFTER_HANDLED, now
    )
    AuditService(session).record(
        actor=Actor(kind=ActorKind.SYSTEM),
        action=AuditAction.VAISES_RETENTION_RUN,
        meta=None,
        context={"anonymised": count},
    )
    await session.commit()
    return count


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    engine = build_engine(settings)
    sessionmaker = build_sessionmaker(engine)
    try:
        async with sessionmaker() as session:
            count = await run_retention(session, utcnow())
        logger.info("vaises_retention_finished", extra={"anonymised": count})
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
