from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.domain_errors import TokenInvalid
from app.emails.templates import EmailTemplate
from app.models.auth import AuthToken, TokenPurpose
from app.models.user import User
from app.repositories.auth_tokens import AuthTokenRepository
from app.repositories.users import UserRepository
from app.security.tokens import generate_token, hash_token
from app.services.email_queue import (
    RESET_PASSWORD_PATH,
    VERIFY_EMAIL_PATH,
    EmailQueue,
    LinkBuilder,
)

EMAIL_TOKEN_TTL = timedelta(minutes=30)

_DELIVERY = {
    TokenPurpose.VERIFY_EMAIL: (EmailTemplate.VERIFY_EMAIL, VERIFY_EMAIL_PATH, "verify_url"),
    TokenPurpose.PASSWORD_RESET: (EmailTemplate.PASSWORD_RESET, RESET_PASSWORD_PATH, "reset_url"),
}


class EmailTokenService:
    def __init__(self, session: AsyncSession, links: LinkBuilder) -> None:
        self._tokens = AuthTokenRepository(session)
        self._users = UserRepository(session)
        self._emails = EmailQueue(session)
        self._links = links

    async def issue_and_send(self, user: User, purpose: TokenPurpose) -> None:
        """Invalidates earlier unused links of the same purpose: only the newest email works."""
        now = utcnow()
        await self._tokens.invalidate_unused(user.id, purpose, now)
        token = generate_token()
        self._tokens.add(
            AuthToken(
                user_id=user.id,
                purpose=purpose,
                token_hash=hash_token(token),
                created_at=now,
                expires_at=now + EMAIL_TOKEN_TTL,
            )
        )
        template, path, payload_key = _DELIVERY[purpose]
        self._emails.enqueue(
            template, user.locale, user.email, {payload_key: self._links.with_token(path, token)}
        )

    async def lock_redeemable(self, token: str, purpose: TokenPurpose) -> tuple[AuthToken, User]:
        record = await self._tokens.get_redeemable_for_update(hash_token(token), purpose, utcnow())
        if record is None:
            raise TokenInvalid
        user = await self._users.get_by_id(record.user_id)
        if user is None:
            raise TokenInvalid
        return record, user
