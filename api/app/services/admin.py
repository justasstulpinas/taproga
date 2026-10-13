import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.domain_errors import NotFound
from app.models.audit import ActorKind, AuditEntry
from app.models.auth import TokenPurpose
from app.models.user import User
from app.pagination import Page, PageRequest
from app.repositories.audit import AuditRepository
from app.repositories.users import UserRepository
from app.security.tokens import SubjectHasher
from app.services.audit import Actor, AuditAction, AuditService, AuditTarget
from app.services.context import AuthContext, RequestMeta
from app.services.email_queue import LinkBuilder
from app.services.email_tokens import EmailTokenService
from app.services.throttle import Rules, Throttle


class AdminService:
    """Superadmin operations. Callers must have passed `policies.access.ensure_superadmin`.

    Every mutation is audited with the superadmin as actor, never as the affected user.
    """

    def __init__(self, db: AsyncSession, *, hasher: SubjectHasher, links: LinkBuilder) -> None:
        self._db = db
        self._users = UserRepository(db)
        self._audit_log = AuditRepository(db)
        self._audit = AuditService(db)
        self._email_tokens = EmailTokenService(db, links)
        self._throttle = Throttle(db, hasher)

    async def list_users(self, email_query: str | None, page: PageRequest) -> Page[User]:
        return await self._users.search(email_query, page)

    async def get_user(self, public_id: uuid.UUID) -> User:
        user = await self._users.get_with_profiles(public_id)
        if user is None:
            raise NotFound
        return user

    async def force_verify_email(
        self, ctx: AuthContext, public_id: uuid.UUID, meta: RequestMeta
    ) -> User:
        user = await self.get_user(public_id)
        if user.email_verified_at is None:
            user.email_verified_at = utcnow()
            self._audit.record(
                actor=self._actor(ctx),
                action=AuditAction.ADMIN_FORCE_VERIFIED_EMAIL,
                meta=meta,
                target_type=AuditTarget.USER,
                target_public_id=user.public_id,
                before={"email_verified": False},
                after={"email_verified": True},
            )
            await self._db.commit()
        return user

    async def trigger_password_reset(
        self, ctx: AuthContext, public_id: uuid.UUID, meta: RequestMeta
    ) -> None:
        """Emails the user a reset link. The admin never sees or sets the password."""
        user = await self.get_user(public_id)
        await self._email_tokens.issue_and_send(user, TokenPurpose.PASSWORD_RESET)
        self._audit.record(
            actor=self._actor(ctx),
            action=AuditAction.ADMIN_TRIGGERED_PASSWORD_RESET,
            meta=meta,
            target_type=AuditTarget.USER,
            target_public_id=user.public_id,
        )
        await self._db.commit()

    async def unlock_account(
        self, ctx: AuthContext, public_id: uuid.UUID, meta: RequestMeta
    ) -> None:
        user = await self.get_user(public_id)
        await self._throttle.reset(Rules.ACCOUNT_LOCKOUTS, user.email)
        self._audit.record(
            actor=self._actor(ctx),
            action=AuditAction.ADMIN_UNLOCKED_ACCOUNT,
            meta=meta,
            target_type=AuditTarget.USER,
            target_public_id=user.public_id,
        )
        await self._db.commit()

    async def list_audit_log(self, page: PageRequest) -> Page[tuple[AuditEntry, User | None]]:
        return await self._audit_log.list_page(page)

    @staticmethod
    def _actor(ctx: AuthContext) -> Actor:
        return Actor(ActorKind.SUPERADMIN, ctx.user.id)
