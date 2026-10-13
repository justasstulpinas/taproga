import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.clock import utcnow
from app.models.base import Base, BigIntPrimaryKey, JsonDocument, PublicIdMixin, enum_column


class ActorKind(StrEnum):
    USER = "user"
    SUPERADMIN = "superadmin"
    GUEST = "guest"
    SYSTEM = "system"
    ANONYMOUS = "anonymous"


class AuditEntry(PublicIdMixin, Base):
    """Append-only. Postgres rejects UPDATE/DELETE via trigger (see the initial migration)."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigIntPrimaryKey, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    actor_kind: Mapped[ActorKind] = mapped_column(enum_column(ActorKind, "actor_kind"))
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    target_type: Mapped[str | None] = mapped_column(String(40))
    target_public_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    before: Mapped[dict[str, Any] | None] = mapped_column(JsonDocument)
    after: Mapped[dict[str, Any] | None] = mapped_column(JsonDocument)
    context: Mapped[dict[str, Any] | None] = mapped_column(JsonDocument)
    ip: Mapped[str | None] = mapped_column(String(45))
    request_id: Mapped[str | None] = mapped_column(String(64))
