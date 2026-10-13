from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.clock import utcnow
from app.models.base import Base, JsonDocument, TimestampMixin, enum_column
from app.models.user import EMAIL_MAX_LENGTH, Locale


class OutboxStatus(StrEnum):
    PENDING = "pending"
    SENT = "sent"
    DEAD = "dead"


class OutboxEmail(TimestampMixin, Base):
    """Transactional outbox: written in the same transaction as the change that triggers it,
    delivered by `app.jobs.email_worker` with retries."""

    __tablename__ = "email_outbox"
    __table_args__ = (Index("ix_email_outbox_due", "status", "next_attempt_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    to_address: Mapped[str] = mapped_column(String(EMAIL_MAX_LENGTH))
    template: Mapped[str] = mapped_column(String(60))
    locale: Mapped[Locale] = mapped_column(enum_column(Locale, "locale"))
    # Holds one-time links until delivery; cleared once sent or dead-lettered.
    payload: Mapped[dict[str, Any] | None] = mapped_column(JsonDocument)
    status: Mapped[OutboxStatus] = mapped_column(
        enum_column(OutboxStatus, "outbox_status"), default=OutboxStatus.PENDING
    )
    attempts: Mapped[int] = mapped_column(default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_error: Mapped[str | None] = mapped_column(String(500))
    sent_at: Mapped[datetime | None]
