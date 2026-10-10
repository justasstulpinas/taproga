import uuid
from datetime import date

from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vaises import BlockedDate, RequestStatus, VaisesRequest
from app.pagination import Cursor, Page, PageRequest


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

    async def get_request(self, public_id: uuid.UUID) -> VaisesRequest | None:
        result = await self._session.execute(
            select(VaisesRequest).where(
                VaisesRequest.public_id == public_id, VaisesRequest.deleted_at.is_(None)
            )
        )
        return result.scalar_one_or_none()

    async def list_requests(self, status: RequestStatus, page: PageRequest) -> Page[VaisesRequest]:
        stmt = (
            select(VaisesRequest)
            .where(VaisesRequest.status == status, VaisesRequest.deleted_at.is_(None))
            .order_by(VaisesRequest.created_at.desc(), VaisesRequest.public_id.desc())
        )
        if page.after is not None:
            stmt = stmt.where(
                tuple_(VaisesRequest.created_at, VaisesRequest.public_id)
                < tuple_(page.after.created_at, page.after.public_id)
            )
        result = await self._session.execute(stmt.limit(page.limit + 1))
        rows = list(result.scalars())
        has_more = len(rows) > page.limit
        items = rows[: page.limit]
        next_cursor = Cursor(items[-1].created_at, items[-1].public_id) if has_more else None
        return Page(items=items, next_cursor=next_cursor)
