import logging
import uuid
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import ActorKind, AuditEntry
from app.repositories.audit import AuditRepository
from app.services.context import RequestMeta

logger = logging.getLogger("app.audit")


class AuditAction(StrEnum):
    USER_REGISTERED = "user.registered"
    REGISTER_EXISTING_EMAIL = "user.register_existing_email"
    EMAIL_VERIFIED = "user.email_verified"
    LOGIN_SUCCEEDED = "auth.login_succeeded"
    LOGIN_FAILED = "auth.login_failed"
    LOGIN_BLOCKED_UNVERIFIED = "auth.login_blocked_unverified"
    LOGOUT = "auth.logout"
    PASSWORD_RESET_REQUESTED = "auth.password_reset_requested"
    PASSWORD_RESET_COMPLETED = "auth.password_reset_completed"
    PASSWORD_CHANGED = "auth.password_changed"
    SUPERADMIN_CREATED = "admin.superadmin_created"
    ADMIN_FORCE_VERIFIED_EMAIL = "admin.force_verified_email"
    ADMIN_TRIGGERED_PASSWORD_RESET = "admin.triggered_password_reset"
    ADMIN_UNLOCKED_ACCOUNT = "admin.unlocked_account"


class AuditTarget(StrEnum):
    USER = "user"


@dataclass(frozen=True)
class Actor:
    kind: ActorKind
    user_id: int | None = None


class AuditService:
    def __init__(self, session: AsyncSession) -> None:
        self._repository = AuditRepository(session)

    def record(
        self,
        *,
        actor: Actor,
        action: AuditAction,
        meta: RequestMeta | None,
        target_type: AuditTarget | None = None,
        target_public_id: uuid.UUID | None = None,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        """Adds the entry to the caller's transaction, so it commits (or not) with the change."""
        self._repository.add(
            AuditEntry(
                actor_kind=actor.kind,
                actor_user_id=actor.user_id,
                action=action,
                target_type=target_type,
                target_public_id=target_public_id,
                before=before,
                after=after,
                context=context,
                ip=meta.ip if meta else None,
                request_id=meta.request_id if meta else None,
            )
        )
        logger.info(
            action,
            extra={
                "actor_kind": actor.kind,
                "target_type": target_type,
                "target": str(target_public_id) if target_public_id else None,
            },
        )
