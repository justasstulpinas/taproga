from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import UserSession
from app.models.user import User


class SessionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, user_session: UserSession) -> None:
        self._session.add(user_session)

    async def get_live(self, token_hash: str, now: datetime) -> tuple[UserSession, User] | None:
        result = await self._session.execute(
            select(UserSession, User)
            .join(User, User.id == UserSession.user_id)
            .where(
                UserSession.token_hash == token_hash,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > now,
                User.deleted_at.is_(None),
            )
        )
        row = result.one_or_none()
        return (row[0], row[1]) if row else None

    async def revoke_all_for_user(
        self, user_id: int, now: datetime, except_session_id: int | None = None
    ) -> None:
        stmt = (
            update(UserSession)
            .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        if except_session_id is not None:
            stmt = stmt.where(UserSession.id != except_session_id)
        await self._session.execute(stmt)
