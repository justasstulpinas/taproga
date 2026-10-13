from collections.abc import Iterator
from datetime import date

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, Response
from sqlalchemy import select

from app.dependencies import get_today
from app.models import User
from app.models.vaises import BlockedDate
from tests.conftest import SessionMaker, create_superadmin

TODAY = date(2026, 10, 10)
URL = "/api/v1/vaises/availability"
FREE_DAY = "2026-11-14"
RATE_LIMIT = 60
FULLWIDTH_DIGITS_DATE = "".join(chr(0xFF10 + int(d)) for d in "2026") + "-11-14"


@pytest.fixture(autouse=True)
def fixed_today(app: FastAPI) -> Iterator[None]:
    app.dependency_overrides[get_today] = lambda: TODAY
    yield
    app.dependency_overrides.pop(get_today, None)


async def get(client: AsyncClient, value: str) -> Response:
    return await client.get(URL, params={"date": value})


async def block(sessionmaker: SessionMaker, value: date) -> None:
    await create_superadmin(sessionmaker)
    async with sessionmaker() as session:
        admin_id = (await session.execute(select(User.id))).scalar_one()
        session.add(BlockedDate(date=value, created_by_user_id=admin_id))
        await session.commit()


async def test_free_date(client: AsyncClient) -> None:
    response = await get(client, FREE_DAY)
    assert response.status_code == 200
    assert response.json() == {"date": FREE_DAY, "availability": "available"}


async def test_blocked_date(client: AsyncClient, sessionmaker: SessionMaker) -> None:
    await block(sessionmaker, date(2026, 11, 14))
    response = await get(client, FREE_DAY)
    assert response.json() == {"date": FREE_DAY, "availability": "reserved"}


async def test_today_and_window_end_are_bookable(client: AsyncClient) -> None:
    assert (await get(client, "2026-10-10")).status_code == 200
    assert (await get(client, "2029-10-10")).status_code == 200


@pytest.mark.parametrize(
    "bad",
    ["2026-02-30", "2026-2-5", "14-11-2026", "", "2026-11-14T00:00", "abc", FULLWIDTH_DIGITS_DATE],
)
async def test_malformed_date_is_rejected(client: AsyncClient, bad: str) -> None:
    response = await get(client, bad)
    assert (response.status_code, response.json()["error"]["code"]) == (422, "INVALID_DATE")


@pytest.mark.parametrize("outside", ["2026-10-09", "2029-10-11"])
async def test_past_and_beyond_window_rejected(client: AsyncClient, outside: str) -> None:
    response = await get(client, outside)
    assert (response.status_code, response.json()["error"]["code"]) == (422, "INVALID_DATE")


async def test_missing_date_is_a_plain_validation_error(client: AsyncClient) -> None:
    response = await client.get(URL)
    assert (response.status_code, response.json()["error"]["code"]) == (422, "VALIDATION_ERROR")


async def test_response_reveals_nothing_else(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await block(sessionmaker, date(2026, 11, 14))
    for value in (FREE_DAY, "2026-11-15"):
        assert set((await get(client, value)).json()) == {"date", "availability"}


async def test_ip_rate_limit(client: AsyncClient) -> None:
    for _ in range(RATE_LIMIT):
        assert (await get(client, FREE_DAY)).status_code == 200
    response = await get(client, FREE_DAY)
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0
