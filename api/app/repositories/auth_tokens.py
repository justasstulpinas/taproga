from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import AuthToken, TokenPurpose


class AuthTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, token: AuthToken) -> None:
        self._session.add(token)

    async def get_redeemable_for_update(
        self, token_hash: str, purpose: TokenPurpose, now: datetime
    ) -> AuthToken | None:
        # Row lock so two concurrent redemptions of the same link can't both succeed.
        result = await self._session.execute(
            select(AuthToken)
            .where(
                AuthToken.token_hash == token_hash,
                AuthToken.purpose == purpose,
                AuthToken.used_at.is_(None),
                AuthToken.expires_at > now,
            )
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def invalidate_unused(self, user_id: int, purpose: TokenPurpose, now: datetime) -> None:
        await self._session.execute(
            update(AuthToken)
            .where(
                AuthToken.user_id == user_id,
                AuthToken.purpose == purpose,
                AuthToken.used_at.is_(None),
            )
            .values(used_at=now)
        )
