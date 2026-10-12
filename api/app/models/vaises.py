import datetime as dt
import uuid
from collections.abc import Mapping
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.auth import SHA256_HEX_LENGTH
from app.models.base import Base, PublicIdMixin, TimestampMixin, enum_column
from app.models.user import Locale


class RequestKind(StrEnum):
    DATE_INQUIRY = "date_inquiry"
    CONSULTATION = "consultation"


class Service(StrEnum):
    UZKANDZIAI = "uzkandziai"
    RENGINIAI = "renginiai"
    VESTUVES = "vestuves"


SERVICE_LABELS_LT: Mapping[Service, str] = {
    Service.UZKANDZIAI: "Užkandžiai",
    Service.RENGINIAI: "Renginiai",
    Service.VESTUVES: "Vestuvės",
}


class Availability(StrEnum):
    AVAILABLE = "available"
    RESERVED = "reserved"


class ContactKind(StrEnum):
    EMAIL = "email"
    PHONE = "phone"


class RequestStatus(StrEnum):
    NEW = "new"
    HANDLED = "handled"


class BlockedDate(PublicIdMixin, TimestampMixin, Base):
    """A calendar date the owner has marked as taken, whatever the booking request says."""

    __tablename__ = "vaises_blocked_dates"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[dt.date] = mapped_column(unique=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)


# Personal fields erased by anonymisation; shared by the single-row and bulk retention paths.
ANONYMISED_COLUMNS = ("contact_kind", "contact_encrypted", "contact_hash", "message_encrypted")


class VaisesRequest(PublicIdMixin, TimestampMixin, Base):
    """A date inquiry or consultation request; contact fields are nulled once anonymised."""

    __tablename__ = "vaises_requests"
    __table_args__ = (
        CheckConstraint(
            "(kind = 'date_inquiry' AND event_date IS NOT NULL)"
            " OR (kind = 'consultation' AND event_date IS NULL)",
            name="event_date_matches_kind",
        ),
        CheckConstraint(
            "(kind = 'date_inquiry' AND service IS NOT NULL)"
            " OR (kind = 'consultation' AND service IS NULL)",
            name="service_matches_kind",
        ),
        Index("ix_vaises_requests_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[RequestKind] = mapped_column(enum_column(RequestKind, "request_kind"))
    event_date: Mapped[dt.date | None]
    # Null for consultations; one shared calendar serves every service.
    service: Mapped[Service | None] = mapped_column(enum_column(Service, "service"), index=True)
    # Computed server-side at submit time; null for consultations.
    availability_at_submit: Mapped[Availability | None] = mapped_column(
        enum_column(Availability, "availability")
    )
    contact_kind: Mapped[ContactKind | None] = mapped_column(
        enum_column(ContactKind, "contact_kind")
    )
    contact_encrypted: Mapped[str | None] = mapped_column(Text)
    # Keyed HMAC of the normalised contact, for per-recipient throttling.
    contact_hash: Mapped[str | None] = mapped_column(String(SHA256_HEX_LENGTH), index=True)
    # Free text that often carries names or phone numbers, so it is encrypted like the contact.
    message_encrypted: Mapped[str | None] = mapped_column(Text)
    locale: Mapped[Locale] = mapped_column(enum_column(Locale, "locale"))
    idempotency_key: Mapped[uuid.UUID] = mapped_column(unique=True)
    status: Mapped[RequestStatus] = mapped_column(
        enum_column(RequestStatus, "request_status"), default=RequestStatus.NEW, index=True
    )
    handled_at: Mapped[dt.datetime | None]
    handled_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    anonymised_at: Mapped[dt.datetime | None]
    deleted_at: Mapped[dt.datetime | None]
