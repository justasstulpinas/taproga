from datetime import date

from app.domain_errors import InvalidDate

BOOKING_WINDOW_YEARS = 3


def booking_window_end(today: date) -> date:
    year = today.year + BOOKING_WINDOW_YEARS
    try:
        return today.replace(year=year)
    except ValueError:  # Feb 29 landing on a non-leap year
        return today.replace(year=year, day=28)


def ensure_bookable(value: date, today: date) -> None:
    if not today <= value <= booking_window_end(today):
        raise InvalidDate
