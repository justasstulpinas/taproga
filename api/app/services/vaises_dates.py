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


# Genitive month names, as Lithuanian writes them in a full date.
LT_MONTHS_GENITIVE = (
    "sausio",
    "vasario",
    "kovo",
    "balandžio",
    "gegužės",
    "birželio",
    "liepos",
    "rugpjūčio",
    "rugsėjo",
    "spalio",
    "lapkričio",
    "gruodžio",
)


def format_date_lt(value: date) -> str:
    return f"{value.year} m. {LT_MONTHS_GENITIVE[value.month - 1]} {value.day} d."
