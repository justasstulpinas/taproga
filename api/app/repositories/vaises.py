import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vaises import BlockedDate, VaisesRequest


class VaisesRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def is_blocked(self, value: date) -> bool:
        result = await self._session.execute(
            select(BlockedDate.id).where(BlockedDate.date == value)
        )
        return result.first() is not None

    def add_request(self, request: VaisesRequest) -> None:
        self._session.add(request)

    async def idempotency_key_exists(self, key: uuid.UUID) -> bool:
        # Deliberately ignores soft deletes: a replayed key must never create a second row.
        result = await self._session.execute(
            select(VaisesRequest.id).where(VaisesRequest.idempotency_key == key)
        )
        return result.first() is not None

    async def get_blocked(self, value: date) -> BlockedDate | None:
        result = await self._session.execute(select(BlockedDate).where(BlockedDate.date == value))
        return result.scalar_one_or_none()

    async def list_blocked(self, start: date, end: date) -> list[BlockedDate]:
        result = await self._session.execute(
            select(BlockedDate)
            .where(BlockedDate.date >= start, BlockedDate.date <= end)
            .order_by(BlockedDate.date)
        )
        return list(result.scalars())

    def add_blocked(self, blocked: BlockedDate) -> None:
        self._session.add(blocked)

    async def delete_blocked(self, blocked: BlockedDate) -> None:
        await self._session.delete(blocked)
