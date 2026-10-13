from dataclasses import dataclass

from app.models.auth import UserSession
from app.models.user import User


@dataclass(frozen=True)
class RequestMeta:
    """Transport facts services may record (audit, sessions) without depending on HTTP."""

    ip: str | None
    user_agent: str | None
    request_id: str | None


@dataclass(frozen=True)
class AuthContext:
    user: User
    session: UserSession
