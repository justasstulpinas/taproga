import re
import uuid
from dataclasses import dataclass
from datetime import date
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, PlainValidator
from pydantic_core import PydanticCustomError

from app.models.user import Locale
from app.models.vaises import Availability, ContactKind
from app.schemas.auth import TurnstileToken

ISO_DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}", re.ASCII)

# Mirrors the frontend's parseContact (src/lib/vaises/dateInquiry.ts); the two must agree.
CONTACT_MAX_LENGTH = 320
EMAIL_PATTERN = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
PHONE_PATTERN = re.compile(r"\+?[0-9]{8,15}")
PHONE_SEPARATORS = re.compile(r"[\s\-().]")


def strict_iso_date(value: Any) -> date:
    # A DomainError raised in a validator would escape as a 500; this custom error type is
    # mapped to INVALID_DATE by the validation handler instead.
    if isinstance(value, str) and ISO_DATE_PATTERN.fullmatch(value):
        try:
            return date.fromisoformat(value)
        except ValueError:
            pass
    raise PydanticCustomError("invalid_date", "Must be a real date as YYYY-MM-DD")


IsoDate = Annotated[date, BeforeValidator(strict_iso_date)]


@dataclass(frozen=True)
class Contact:
    """A normalised email or phone number: the form that is hashed, encrypted and sent to."""

    kind: ContactKind
    value: str


def parse_contact(raw: str) -> Contact | None:
    if len(raw) > CONTACT_MAX_LENGTH:
        return None
    trimmed = raw.strip()
    if "@" in trimmed:
        if not EMAIL_PATTERN.fullmatch(trimmed):
            return None
        return Contact(ContactKind.EMAIL, trimmed.lower())
    phone = PHONE_SEPARATORS.sub("", trimmed)
    return Contact(ContactKind.PHONE, phone) if PHONE_PATTERN.fullmatch(phone) else None


def _contact_field(value: Any) -> Contact:
    contact = parse_contact(value) if isinstance(value, str) else None
    if contact is None:
        # Like invalid_date: the validation handler maps this type to INVALID_CONTACT.
        raise PydanticCustomError("invalid_contact", "Must be an email or phone number")
    return contact


ContactField = Annotated[Contact, PlainValidator(_contact_field, json_schema_input_type=str)]


class ConsultationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contact: ContactField
    locale: Locale
    idempotency_key: uuid.UUID
    turnstile_token: TurnstileToken


class DateInquiryIn(ConsultationIn):
    date: IsoDate


class AvailabilityOut(BaseModel):
    date: date
    availability: Availability
