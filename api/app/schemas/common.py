from typing import Annotated

from pydantic import AfterValidator, BaseModel, EmailStr, Field

from app.models.user import EMAIL_MAX_LENGTH
from app.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE

# EmailStr lowercases only the domain; accounts are keyed on the fully lowercased address.
NormalizedEmail = Annotated[
    EmailStr, Field(max_length=EMAIL_MAX_LENGTH), AfterValidator(lambda value: value.lower())
]

PageLimit = Annotated[int, Field(ge=1, le=MAX_PAGE_SIZE)]
PAGE_LIMIT_DEFAULT = DEFAULT_PAGE_SIZE


class PageOut[T](BaseModel):
    items: list[T]
    next_cursor: str | None
