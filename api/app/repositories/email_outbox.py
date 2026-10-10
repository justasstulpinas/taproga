from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email_outbox import OutboxEmail, OutboxStatus


class OutboxRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, email: OutboxEmail) -> None:
        self._session.add(email)

    async def claim_due(self, now: datetime, limit: int) -> list[OutboxEmail]:
        # SKIP LOCKED lets several workers run without sending the same email twice (Postgres).
        result = await self._session.execute(
            select(OutboxEmail)
            .where(OutboxEmail.status == OutboxStatus.PENDING, OutboxEmail.next_attempt_at <= now)
            .order_by(OutboxEmail.next_attempt_at)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        return list(result.scalars())
