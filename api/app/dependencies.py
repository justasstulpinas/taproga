from dataclasses import dataclass
from datetime import date
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import vilnius_today
from app.db import get_session
from app.domain_errors import NotAuthenticated
from app.integrations import Integrations
from app.policies.access import ensure_fully_authenticated, ensure_superadmin
from app.security.encryption import FieldEncryptor
from app.security.tokens import SubjectHasher
from app.services.admin import AdminService
from app.services.audit import AuditService
from app.services.auth import AuthService
from app.services.context import AuthContext, RequestMeta
from app.services.email_queue import EmailQueue, LinkBuilder
from app.services.sessions import SessionService
from app.services.throttle import Throttle
from app.services.vaises import VaisesService
from app.settings import Settings


@dataclass(frozen=True)
class SecurityKit:
    encryptor: FieldEncryptor
    hasher: SubjectHasher
    links: LinkBuilder

    @classmethod
    def from_settings(cls, settings: Settings) -> "SecurityKit":
        encryptor = FieldEncryptor(settings.encryption_key.get_secret_value())
        return cls(
            encryptor=encryptor,
            hasher=SubjectHasher(encryptor.hmac_key),
            links=LinkBuilder(settings.public_app_url),
        )


DbSession = Annotated[AsyncSession, Depends(get_session)]


def get_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_security(request: Request) -> SecurityKit:
    security: SecurityKit = request.app.state.security
    return security


def get_integrations(request: Request) -> Integrations:
    integrations: Integrations = request.app.state.integrations
    return integrations


AppSettings = Annotated[Settings, Depends(get_settings)]
Security = Annotated[SecurityKit, Depends(get_security)]


def get_request_meta(request: Request) -> RequestMeta:
    # Behind the proxy, uvicorn's --proxy-headers/--forwarded-allow-ips resolves the real client.
    return RequestMeta(
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        request_id=getattr(request.state, "request_id", None),
    )


Meta = Annotated[RequestMeta, Depends(get_request_meta)]


def get_auth_service(
    db: DbSession,
    security: Security,
    integrations: Annotated[Integrations, Depends(get_integrations)],
) -> AuthService:
    return AuthService(
        db,
        integrations=integrations,
        hasher=security.hasher,
        links=security.links,
    )


def get_admin_service(db: DbSession, security: Security) -> AdminService:
    return AdminService(db, hasher=security.hasher, links=security.links)


def get_today() -> date:
    return vilnius_today()


def get_vaises_service(
    db: DbSession,
    settings: AppSettings,
    security: Security,
    integrations: Annotated[Integrations, Depends(get_integrations)],
    today: Annotated[date, Depends(get_today)],
) -> VaisesService:
    return VaisesService(
        db,
        throttle=Throttle(db, security.hasher),
        encryptor=security.encryptor,
        hasher=security.hasher,
        human_verifier=integrations.human_verifier,
        email_queue=EmailQueue(db),
        audit=AuditService(db),
        links=security.links,
        notify_email=settings.vaises_notify_email,
        today=lambda: today,
    )


Vaises = Annotated[VaisesService, Depends(get_vaises_service)]


async def get_session_context(
    request: Request, db: DbSession, settings: AppSettings
) -> AuthContext:
    """Any live session, regardless of account type."""
    return await SessionService(db).authenticate(request.cookies.get(settings.session_cookie_name))


async def get_optional_session_context(
    request: Request, db: DbSession, settings: AppSettings
) -> AuthContext | None:
    try:
        return await get_session_context(request, db, settings)
    except NotAuthenticated:
        return None


SessionContext = Annotated[AuthContext, Depends(get_session_context)]


def require_authenticated(ctx: SessionContext) -> AuthContext:
    ensure_fully_authenticated(ctx)
    return ctx


def require_superadmin(ctx: SessionContext) -> AuthContext:
    ensure_superadmin(ctx)
    return ctx


Authenticated = Annotated[AuthContext, Depends(require_authenticated)]
Superadmin = Annotated[AuthContext, Depends(require_superadmin)]
