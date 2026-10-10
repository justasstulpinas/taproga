from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vaises import BlockedDate


class VaisesRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def is_blocked(self, value: date) -> bool:
        result = await self._session.execute(
            select(BlockedDate.id).where(BlockedDate.date == value)
        )
        return result.first() is not None
