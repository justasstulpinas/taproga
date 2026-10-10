from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.domain_errors import NotAuthenticated
from app.models.auth import UserSession
from app.models.user import AccountType, User
from app.repositories.sessions import SessionRepository
from app.security.tokens import generate_token, hash_token
from app.services.context import AuthContext, RequestMeta

USER_AGENT_MAX_LENGTH = 255
# Avoids a write on every request while keeping idle expiry accurate to the minute.
TOUCH_INTERVAL = timedelta(minutes=1)


@dataclass(frozen=True)
class SessionLifetime:
    absolute: timedelta
    idle: timedelta


USER_LIFETIME = SessionLifetime(absolute=timedelta(days=30), idle=timedelta(days=7))
SUPERADMIN_LIFETIME = SessionLifetime(absolute=timedelta(hours=12), idle=timedelta(minutes=30))


def lifetime_for(user: User) -> SessionLifetime:
    return SUPERADMIN_LIFETIME if user.account_type is AccountType.SUPERADMIN else USER_LIFETIME


@dataclass(frozen=True)
class IssuedSession:
    token: str
    expires_at: datetime
    session: UserSession


class SessionService:
    def __init__(self, session: AsyncSession) -> None:
        self._db = session
        self._repository = SessionRepository(session)

    def issue(self, user: User, meta: RequestMeta) -> IssuedSession:
        """A fresh random token on every login and privilege change prevents session fixation."""
        now = utcnow()
        token = generate_token()
        user_session = UserSession(
            user_id=user.id,
            token_hash=hash_token(token),
            created_at=now,
            last_seen_at=now,
            expires_at=now + lifetime_for(user).absolute,
            ip=meta.ip,
            user_agent=meta.user_agent[:USER_AGENT_MAX_LENGTH] if meta.user_agent else None,
        )
        self._repository.add(user_session)
        return IssuedSession(token=token, expires_at=user_session.expires_at, session=user_session)

    async def authenticate(self, token: str | None) -> AuthContext:
        if not token:
            raise NotAuthenticated
        now = utcnow()
        found = await self._repository.get_live(hash_token(token), now)
        if found is None:
            raise NotAuthenticated
        user_session, user = found
        if user_session.last_seen_at + lifetime_for(user).idle <= now:
            user_session.revoked_at = now
            await self._db.commit()
            raise NotAuthenticated
        if now - user_session.last_seen_at >= TOUCH_INTERVAL:
            user_session.last_seen_at = now
            await self._db.commit()
        return AuthContext(user=user, session=user_session)

    def revoke(self, user_session: UserSession) -> None:
        user_session.revoked_at = utcnow()

    async def revoke_all(self, user: User, *, except_session: UserSession | None = None) -> None:
        await self._repository.revoke_all_for_user(
            user.id, utcnow(), except_session.id if except_session else None
        )
