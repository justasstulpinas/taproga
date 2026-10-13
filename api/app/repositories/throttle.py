from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import ThrottleEvent


@dataclass(frozen=True)
class ThrottleStats:
    count: int
    last_at: datetime | None


class ThrottleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def record(self, action: str, subject: str, now: datetime) -> None:
        self._session.add(ThrottleEvent(action=action, subject=subject, created_at=now))

    async def stats(self, action: str, subject: str, since: datetime) -> ThrottleStats:
        result = await self._session.execute(
            select(func.count(), func.max(ThrottleEvent.created_at)).where(
                ThrottleEvent.action == action,
                ThrottleEvent.subject == subject,
                ThrottleEvent.created_at > since,
            )
        )
        count, last_at = result.one()
        return ThrottleStats(count=count, last_at=last_at)

    async def clear(self, actions: Iterable[str], subject: str) -> None:
        await self._session.execute(
            delete(ThrottleEvent).where(
                ThrottleEvent.action.in_(list(actions)), ThrottleEvent.subject == subject
            )
        )
