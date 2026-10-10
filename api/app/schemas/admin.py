import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.audit import ActorKind, AuditEntry
from app.models.user import AccountType, Locale, User
from app.schemas.users import NewlywedProfileOut, ServiceProfileOut


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: str
    account_type: AccountType
    locale: Locale
    email_verified_at: datetime | None
    created_at: datetime

    @classmethod
    def build(cls, user: User) -> "AdminUserOut":
        return cls(
            id=user.public_id,
            email=user.email,
            account_type=user.account_type,
            locale=user.locale,
            email_verified_at=user.email_verified_at,
            created_at=user.created_at,
        )


class AdminUserDetailOut(AdminUserOut):
    password_changed_at: datetime
    newlywed_profile: NewlywedProfileOut | None
    service_profile: ServiceProfileOut | None

    @classmethod
    def build(cls, user: User) -> "AdminUserDetailOut":
        """`user` must have its profiles loaded."""
        return cls(
            **AdminUserOut.build(user).model_dump(),
            password_changed_at=user.password_changed_at,
            newlywed_profile=(
                NewlywedProfileOut.build(user.newlywed_profile) if user.newlywed_profile else None
            ),
            service_profile=(
                ServiceProfileOut.build(user.service_profile) if user.service_profile else None
            ),
        )


class AuditEntryOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    actor_kind: ActorKind
    actor_email: str | None
    action: str
    target_type: str | None
    target_id: uuid.UUID | None
    before: dict[str, Any] | None
    after: dict[str, Any] | None
    context: dict[str, Any] | None
    ip: str | None
    request_id: str | None

    @classmethod
    def build(cls, entry: AuditEntry, actor: User | None) -> "AuditEntryOut":
        return cls(
            id=entry.public_id,
            created_at=entry.created_at,
            actor_kind=entry.actor_kind,
            actor_email=actor.email if actor else None,
            action=entry.action,
            target_type=entry.target_type,
            target_id=entry.target_public_id,
            before=entry.before,
            after=entry.after,
            context=entry.context,
            ip=entry.ip,
            request_id=entry.request_id,
        )
