from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.audit import AuditEntry
from app.models.user import User
from app.pagination import Cursor, Page, PageRequest


class AuditRepository:
    """Insert and read only: the audit log has no update or delete path by design."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, entry: AuditEntry) -> None:
        self._session.add(entry)

    async def list_page(self, page: PageRequest) -> Page[tuple[AuditEntry, User | None]]:
        actor = aliased(User)
        stmt = (
            select(AuditEntry, actor)
            .outerjoin(actor, actor.id == AuditEntry.actor_user_id)
            .order_by(AuditEntry.created_at.desc(), AuditEntry.public_id.desc())
        )
        if page.after is not None:
            stmt = stmt.where(
                tuple_(AuditEntry.created_at, AuditEntry.public_id)
                < tuple_(page.after.created_at, page.after.public_id)
            )
        result = await self._session.execute(stmt.limit(page.limit + 1))
        rows: list[tuple[AuditEntry, User | None]] = [(row[0], row[1]) for row in result]
        has_more = len(rows) > page.limit
        items = rows[: page.limit]
        next_cursor = (
            Cursor(items[-1][0].created_at, items[-1][0].public_id) if has_more and items else None
        )
        return Page(items=items, next_cursor=next_cursor)
