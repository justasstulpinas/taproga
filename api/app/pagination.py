import base64
import binascii
import json
import uuid
from dataclasses import dataclass
from datetime import datetime

from app.domain_errors import DomainError
from app.error_codes import ErrorCode

DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100


class InvalidCursorError(DomainError):
    code = ErrorCode.BAD_REQUEST


@dataclass(frozen=True)
class Cursor:
    """Keyset position over (created_at, public_id); opaque to clients, no integer PKs inside."""

    created_at: datetime
    public_id: uuid.UUID

    def encode(self) -> str:
        raw = json.dumps({"t": self.created_at.isoformat(), "id": str(self.public_id)})
        return base64.urlsafe_b64encode(raw.encode()).decode()

    @classmethod
    def decode(cls, value: str) -> "Cursor":
        try:
            data = json.loads(base64.urlsafe_b64decode(value.encode()))
            return cls(datetime.fromisoformat(data["t"]), uuid.UUID(data["id"]))
        except (binascii.Error, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            raise InvalidCursorError from exc


@dataclass(frozen=True)
class PageRequest:
    limit: int
    after: Cursor | None


@dataclass(frozen=True)
class Page[T]:
    items: list[T]
    next_cursor: Cursor | None
