from dataclasses import dataclass

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.domain_errors import (
    EmailNotVerified,
    HumanVerificationFailed,
    InvalidCredentials,
    MfaInvalid,
    MfaNotPending,
    PasswordBreached,
    RateLimited,
)
from app.emails.templates import EmailTemplate
from app.integrations import Integrations
from app.models.audit import ActorKind
from app.models.auth import TokenPurpose
from app.models.user import AccountType, Locale, NewlywedProfile, ServiceProfile, User
from app.repositories.users import UserRepository
from app.security.encryption import FieldEncryptor
from app.security.passwords import hash_password, needs_rehash, verify_password
from app.security.tokens import SubjectHasher
from app.security.totp import matching_totp_step
from app.services.audit import Actor, AuditAction, AuditService, AuditTarget
from app.services.context import AuthContext, RequestMeta
from app.services.email_queue import FORGOT_PASSWORD_PATH, LOGIN_PATH, EmailQueue, LinkBuilder
from app.services.email_tokens import EmailTokenService
from app.services.sessions import IssuedSession, SessionService
from app.services.throttle import Rules, Throttle

# Requests without a resolvable client IP share one bucket rather than bypassing IP limits.
UNKNOWN_IP = "unknown"
SELF_REGISTERABLE = frozenset({AccountType.NEWLYWED, AccountType.SERVICE})
ANONYMOUS = Actor(ActorKind.ANONYMOUS)


@dataclass(frozen=True)
class LoginResult:
    issued: IssuedSession
    user: User
    mfa_required: bool


def _as_actor(user: User) -> Actor:
    kind = ActorKind.SUPERADMIN if user.account_type is AccountType.SUPERADMIN else ActorKind.USER
    return Actor(kind, user.id)


class AuthService:
    def __init__(
        self,
        db: AsyncSession,
        *,
        integrations: Integrations,
        encryptor: FieldEncryptor,
        hasher: SubjectHasher,
        links: LinkBuilder,
    ) -> None:
        self._db = db
        self._integrations = integrations
        self._encryptor = encryptor
        self._links = links
        self._users = UserRepository(db)
        self._sessions = SessionService(db)
        self._email_tokens = EmailTokenService(db, links)
        self._emails = EmailQueue(db)
        self._throttle = Throttle(db, hasher)
        self._audit = AuditService(db)

    # --- registration & verification -------------------------------------------------------

    async def register(
        self,
        *,
        email: str,
        password: str,
        account_type: AccountType,
        locale: Locale,
        business_name: str | None,
        human_token: str | None,
        meta: RequestMeta,
    ) -> None:
        """Returns the same outcome whether or not the email is taken (no account enumeration)."""
        if account_type not in SELF_REGISTERABLE:
            raise ValueError(f"{account_type} cannot self-register")
        await self._throttle.hit(Rules.REGISTER_IP, meta.ip or UNKNOWN_IP)
        await self._require_human(human_token, meta)
        await self._reject_breached(password)
        # Hash before the existence check so both paths take the same time.
        password_hash = hash_password(password)

        existing = await self._users.get_by_email(email)
        if existing is not None:
            await self._notify_existing_account(existing, meta)
            return

        user = User(
            email=email, password_hash=password_hash, account_type=account_type, locale=locale
        )
        self._users.add(user)
        try:
            await self._db.flush()
        except IntegrityError:
            # Lost a race with a concurrent registration for the same email.
            await self._db.rollback()
            return
        if account_type is AccountType.SERVICE:
            self._users.add_profile(
                ServiceProfile(user_id=user.id, business_name=business_name or "")
            )
        else:
            self._users.add_profile(NewlywedProfile(user_id=user.id))
        await self._email_tokens.issue_and_send(user, TokenPurpose.VERIFY_EMAIL)
        self._audit.record(
            actor=_as_actor(user),
            action=AuditAction.USER_REGISTERED,
            meta=meta,
            target_type=AuditTarget.USER,
            target_public_id=user.public_id,
            context={"account_type": account_type},
        )
        await self._db.commit()

    async def _notify_existing_account(self, user: User, meta: RequestMeta) -> None:
        try:
            await self._throttle.hit(Rules.ACCOUNT_EXISTS_NOTICE, user.email)
        except RateLimited:
            # Silently skip: surfacing a 429 here would reveal that the account exists.
            return
        self._emails.enqueue(
            EmailTemplate.ACCOUNT_EXISTS,
            user.locale,
            user.email,
            {
                "login_url": self._links.page(LOGIN_PATH),
                "forgot_url": self._links.page(FORGOT_PASSWORD_PATH),
            },
        )
        self._audit.record(
            actor=ANONYMOUS,
            action=AuditAction.REGISTER_EXISTING_EMAIL,
            meta=meta,
            target_type=AuditTarget.USER,
            target_public_id=user.public_id,
        )
        await self._db.commit()

    async def verify_email(self, token: str, meta: RequestMeta) -> None:
        await self._throttle.hit(Rules.TOKEN_REDEEM_IP, meta.ip or UNKNOWN_IP)
        record, user = await self._email_tokens.lock_redeemable(token, TokenPurpose.VERIFY_EMAIL)
        now = utcnow()
        record.used_at = now
        if user.email_verified_at is None:
            user.email_verified_at = now
            self._audit.record(
                actor=_as_actor(user),
                action=AuditAction.EMAIL_VERIFIED,
                meta=meta,
                target_type=AuditTarget.USER,
                target_public_id=user.public_id,
            )
        await self._db.commit()

    async def resend_verification(self, email: str, meta: RequestMeta) -> None:
        await self._throttle.hit(Rules.RESEND_VERIFICATION_IP, meta.ip or UNKNOWN_IP)
        await self._throttle.hit(Rules.RESEND_VERIFICATION_ACCOUNT, email)
        user = await self._users.get_by_email(email)
        if user is not None and not user.is_email_verified:
            await self._email_tokens.issue_and_send(user, TokenPurpose.VERIFY_EMAIL)
            await self._db.commit()

    # --- login, MFA, logout ----------------------------------------------------------------

    async def login(self, email: str, password: str, meta: RequestMeta) -> LoginResult:
        await self._throttle.hit(Rules.LOGIN_IP, meta.ip or UNKNOWN_IP)
        await self._throttle.check(Rules.LOGIN_FAILURE_ACCOUNT, email)

        user = await self._users.get_by_email(email)
        password_ok = verify_password(user.password_hash if user else None, password)
        if user is None or not password_ok:
            await self._throttle.record(Rules.LOGIN_FAILURE_ACCOUNT, email)
            self._audit.record(
                actor=ANONYMOUS,
                action=AuditAction.LOGIN_FAILED,
                meta=meta,
                target_type=AuditTarget.USER if user else None,
                target_public_id=user.public_id if user else None,
            )
            await self._db.commit()
            raise InvalidCredentials

        await self._throttle.reset([Rules.LOGIN_FAILURE_ACCOUNT], email)
        if needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)

        if not user.is_email_verified:
            self._audit.record(
                actor=_as_actor(user),
                action=AuditAction.LOGIN_BLOCKED_UNVERIFIED,
                meta=meta,
                target_type=AuditTarget.USER,
                target_public_id=user.public_id,
            )
            await self._db.commit()
            raise EmailNotVerified

        mfa_required = user.account_type is AccountType.SUPERADMIN
        issued = self._sessions.issue(user, meta, mfa_verified=False)
        self._audit.record(
            actor=_as_actor(user),
            action=AuditAction.LOGIN_SUCCEEDED,
            meta=meta,
            target_type=AuditTarget.USER,
            target_public_id=user.public_id,
            context={"mfa_pending": mfa_required},
        )
        await self._db.commit()
        return LoginResult(issued=issued, user=user, mfa_required=mfa_required)

    async def verify_mfa(self, ctx: AuthContext, code: str, meta: RequestMeta) -> IssuedSession:
        user = ctx.user
        if user.account_type is not AccountType.SUPERADMIN or ctx.session.mfa_verified_at:
            raise MfaNotPending
        await self._throttle.check(Rules.MFA_FAILURE_ACCOUNT, user.email)

        step = (
            matching_totp_step(self._encryptor.decrypt(user.totp_secret_encrypted), code, utcnow())
            if user.totp_secret_encrypted
            else None
        )
        replayed = (
            step is not None
            and user.totp_last_used_step is not None
            and step <= user.totp_last_used_step
        )
        if step is None or replayed:
            await self._throttle.record(Rules.MFA_FAILURE_ACCOUNT, user.email)
            self._audit.record(
                actor=_as_actor(user),
                action=AuditAction.MFA_FAILED,
                meta=meta,
                context={"replayed": replayed},
            )
            await self._db.commit()
            raise MfaInvalid

        user.totp_last_used_step = step
        await self._throttle.reset([Rules.MFA_FAILURE_ACCOUNT], user.email)
        # Privilege changed: replace the session token.
        self._sessions.revoke(ctx.session)
        issued = self._sessions.issue(user, meta, mfa_verified=True)
        self._audit.record(actor=_as_actor(user), action=AuditAction.MFA_SUCCEEDED, meta=meta)
        await self._db.commit()
        return issued

    async def logout(self, ctx: AuthContext, meta: RequestMeta) -> None:
        self._sessions.revoke(ctx.session)
        self._audit.record(actor=_as_actor(ctx.user), action=AuditAction.LOGOUT, meta=meta)
        await self._db.commit()

    # --- passwords --------------------------------------------------------------------------

    async def forgot_password(self, email: str, human_token: str | None, meta: RequestMeta) -> None:
        await self._throttle.hit(Rules.PASSWORD_FORGOT_IP, meta.ip or UNKNOWN_IP)
        await self._throttle.hit(Rules.PASSWORD_FORGOT_ACCOUNT, email)
        await self._require_human(human_token, meta)
        user = await self._users.get_by_email(email)
        if user is None:
            return
        await self._email_tokens.issue_and_send(user, TokenPurpose.PASSWORD_RESET)
        self._audit.record(
            actor=ANONYMOUS,
            action=AuditAction.PASSWORD_RESET_REQUESTED,
            meta=meta,
            target_type=AuditTarget.USER,
            target_public_id=user.public_id,
        )
        await self._db.commit()

    async def reset_password(self, token: str, new_password: str, meta: RequestMeta) -> None:
        await self._throttle.hit(Rules.TOKEN_REDEEM_IP, meta.ip or UNKNOWN_IP)
        record, user = await self._email_tokens.lock_redeemable(token, TokenPurpose.PASSWORD_RESET)
        # Checked before consuming the token, so the user can retry the same link.
        await self._reject_breached(new_password)

        now = utcnow()
        record.used_at = now
        self._set_password(user, new_password)
        if user.email_verified_at is None:
            # Redeeming an emailed link proves ownership of the inbox.
            user.email_verified_at = now
        await self._sessions.revoke_all(user)
        await self._throttle.reset(Rules.ACCOUNT_LOCKOUTS, user.email)
        self._notify_password_changed(user)
        self._audit.record(
            actor=_as_actor(user),
            action=AuditAction.PASSWORD_RESET_COMPLETED,
            meta=meta,
            target_type=AuditTarget.USER,
            target_public_id=user.public_id,
        )
        await self._db.commit()

    async def change_password(
        self, ctx: AuthContext, current_password: str, new_password: str, meta: RequestMeta
    ) -> IssuedSession:
        user = ctx.user
        await self._throttle.check(Rules.LOGIN_FAILURE_ACCOUNT, user.email)
        if not verify_password(user.password_hash, current_password):
            await self._throttle.record(Rules.LOGIN_FAILURE_ACCOUNT, user.email)
            raise InvalidCredentials
        await self._reject_breached(new_password)

        self._set_password(user, new_password)
        await self._sessions.revoke_all(user)
        issued = self._sessions.issue(
            user, meta, mfa_verified=ctx.session.mfa_verified_at is not None
        )
        self._notify_password_changed(user)
        self._audit.record(
            actor=_as_actor(user),
            action=AuditAction.PASSWORD_CHANGED,
            meta=meta,
            target_type=AuditTarget.USER,
            target_public_id=user.public_id,
        )
        await self._db.commit()
        return issued

    async def load_profiles(self, user: User) -> User:
        await self._users.load_profiles(user)
        return user

    # --- helpers ----------------------------------------------------------------------------

    def _set_password(self, user: User, password: str) -> None:
        user.password_hash = hash_password(password)
        user.password_changed_at = utcnow()

    def _notify_password_changed(self, user: User) -> None:
        self._emails.enqueue(
            EmailTemplate.PASSWORD_CHANGED,
            user.locale,
            user.email,
            {"forgot_url": self._links.page(FORGOT_PASSWORD_PATH)},
        )

    async def _require_human(self, token: str | None, meta: RequestMeta) -> None:
        if not await self._integrations.human_verifier.verify(token, meta.ip):
            raise HumanVerificationFailed

    async def _reject_breached(self, password: str) -> None:
        if await self._integrations.breach_checker.is_breached(password):
            raise PasswordBreached
