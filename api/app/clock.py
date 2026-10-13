from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

VILNIUS = ZoneInfo("Europe/Vilnius")


def utcnow() -> datetime:
    return datetime.now(UTC)


def vilnius_today(now: datetime | None = None) -> date:
    return (now or utcnow()).astimezone(VILNIUS).date()
