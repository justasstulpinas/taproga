import re
from datetime import date
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator
from pydantic_core import PydanticCustomError

from app.models.vaises import Availability

ISO_DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}", re.ASCII)


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


class AvailabilityOut(BaseModel):
    date: date
    availability: Availability
