from datetime import datetime
from enum import StrEnum

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.clock import utcnow
from app.models.base import Base, PublicIdMixin, TimestampMixin, enum_column

EMAIL_MAX_LENGTH = 320


class AccountType(StrEnum):
    NEWLYWED = "newlywed"
    SERVICE = "service"
    # Never self-registered: created only via `python -m app.cli create-superadmin`.
    SUPERADMIN = "superadmin"


class Locale(StrEnum):
    LT = "lt"
    EN = "en"


class User(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Stored normalized (trimmed, lowercased). Plaintext because it is the login lookup key.
    email: Mapped[str] = mapped_column(String(EMAIL_MAX_LENGTH), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    account_type: Mapped[AccountType] = mapped_column(enum_column(AccountType, "account_type"))
    locale: Mapped[Locale] = mapped_column(enum_column(Locale, "locale"), default=Locale.LT)
    email_verified_at: Mapped[datetime | None]
    password_changed_at: Mapped[datetime] = mapped_column(default=utcnow)
    deleted_at: Mapped[datetime | None]

    newlywed_profile: Mapped["NewlywedProfile | None"] = relationship(
        back_populates="user", lazy="raise"
    )
    service_profile: Mapped["ServiceProfile | None"] = relationship(
        back_populates="user", lazy="raise"
    )

    @property
    def is_email_verified(self) -> bool:
        return self.email_verified_at is not None


class NewlywedProfile(TimestampMixin, Base):
    __tablename__ = "newlywed_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    display_name: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(40))

    user: Mapped[User] = relationship(back_populates="newlywed_profile", lazy="raise")


class ServiceProfile(TimestampMixin, Base):
    __tablename__ = "service_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    business_name: Mapped[str] = mapped_column(String(160))
    contact_name: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(40))
    website: Mapped[str | None] = mapped_column(String(300))
    instagram: Mapped[str | None] = mapped_column(String(100))

    user: Mapped[User] = relationship(back_populates="service_profile", lazy="raise")
