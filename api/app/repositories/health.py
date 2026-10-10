from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class HealthRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def ping_database(self) -> None:
        await self._session.execute(select(1))
