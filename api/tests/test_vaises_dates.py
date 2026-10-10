from datetime import UTC, date, datetime

import pytest

from app.clock import vilnius_today
from app.domain_errors import InvalidDate
from app.error_codes import ErrorCode
from app.services.vaises_dates import booking_window_end, ensure_bookable, format_date_lt

TODAY = date(2026, 10, 10)


def test_vilnius_today_crosses_midnight_before_utc() -> None:
    assert vilnius_today(datetime(2026, 7, 1, 21, 30, tzinfo=UTC)) == date(2026, 7, 2)


def test_vilnius_today_in_winter() -> None:
    assert vilnius_today(datetime(2026, 1, 1, 22, 30, tzinfo=UTC)) == date(2026, 1, 2)


def test_vilnius_today_on_dst_change_day() -> None:
    assert vilnius_today(datetime(2026, 3, 29, 0, 30, tzinfo=UTC)) == date(2026, 3, 29)


def test_vilnius_today_defaults_to_now() -> None:
    assert isinstance(vilnius_today(), date)


@pytest.mark.parametrize(
    ("value", "ok"),
    [
        (date(2026, 10, 9), False),
        (date(2026, 10, 10), True),
        (date(2029, 10, 10), True),
        (date(2029, 10, 11), False),
    ],
)
def test_ensure_bookable_window(value: date, ok: bool) -> None:
    if ok:
        ensure_bookable(value, TODAY)
        return
    with pytest.raises(InvalidDate) as exc:
        ensure_bookable(value, TODAY)
    assert exc.value.code == ErrorCode.INVALID_DATE


def test_window_end_from_feb_29() -> None:
    assert booking_window_end(date(2028, 2, 29)) == date(2031, 2, 28)


@pytest.mark.parametrize(
    ("value", "label"),
    [
        (date(2026, 11, 14), "2026 m. lapkričio 14 d."),
        (date(2027, 1, 1), "2027 m. sausio 1 d."),
        (date(2027, 8, 31), "2027 m. rugpjūčio 31 d."),
        (date(2027, 12, 5), "2027 m. gruodžio 5 d."),
    ],
)
def test_format_date_lt(value: date, label: str) -> None:
    assert format_date_lt(value) == label
