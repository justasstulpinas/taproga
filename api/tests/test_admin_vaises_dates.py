import uuid
from collections.abc import Iterator
from datetime import date
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import func, select

from app.dependencies import get_today
from app.models import AuditEntry
from app.models.audit import ActorKind
from app.models.vaises import Availability, BlockedDate, VaisesRequest
from tests.conftest import (
    HUMAN_TOKEN,
    SessionMaker,
    admin_login,
    create_superadmin,
    login,
    register_and_verify,
)

TODAY = date(2026, 10, 10)
DAY = "2026-11-14"
BLOCKED = "/api/v1/admin/vaises/blocked-dates"
RANGE = {"from": "2026-11-01", "to": "2026-11-30"}
AVAILABILITY = "/api/v1/vaises/availability"
DATE_INQUIRIES = "/api/v1/vaises/date-inquiries"

DATE_ENDPOINTS = [
    ("GET", BLOCKED),
    ("POST", BLOCKED),
    ("DELETE", f"{BLOCKED}/{DAY}"),
]


@pytest.fixture(autouse=True)
def fixed_today(app: FastAPI) -> Iterator[None]:
    app.dependency_overrides[get_today] = lambda: TODAY
    yield
    app.dependency_overrides.pop(get_today, None)


def block_body(value: str = DAY) -> dict[str, Any]:
    return {"date": value, "idempotency_key": str(uuid.uuid4())}


async def login_admin(client: AsyncClient, sessionmaker: SessionMaker) -> None:
    await admin_login(client, await create_superadmin(sessionmaker))


async def audit_entries(sessionmaker: SessionMaker) -> list[AuditEntry]:
    async with sessionmaker() as session:
        query = select(AuditEntry).where(AuditEntry.action.like("vaises.%")).order_by(AuditEntry.id)
        return list((await session.execute(query)).scalars())


@pytest.mark.parametrize(("method", "path"), DATE_ENDPOINTS)
async def test_rejects_anonymous(client: AsyncClient, method: str, path: str) -> None:
    response = await client.request(method, path)

    assert response.status_code == 401


@pytest.mark.parametrize(("method", "path"), DATE_ENDPOINTS)
@pytest.mark.parametrize("account_type", ["newlywed", "service"])
async def test_rejects_regular_users(
    client: AsyncClient, sessionmaker: SessionMaker, method: str, path: str, account_type: str
) -> None:
    extra = {"business_name": "Studija"} if account_type == "service" else {}
    await register_and_verify(
        client, sessionmaker, "ona@example.lt", account_type=account_type, **extra
    )
    await login(client, "ona@example.lt")

    response = await client.request(method, path)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


async def test_block_then_availability_reserved(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await login_admin(client, sessionmaker)

    response = await client.post(BLOCKED, json=block_body())

    assert response.status_code == 200, response.text
    assert response.json()["date"] == DAY
    assert "created_at" in response.json()
    listed = await client.get(BLOCKED, params=RANGE)
    assert [item["date"] for item in listed.json()] == [DAY]
    availability = await client.get(AVAILABILITY, params={"date": DAY})
    assert availability.json() == {"date": DAY, "availability": "reserved"}


async def test_list_is_bounded_by_the_range(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await login_admin(client, sessionmaker)
    for value in ("2026-10-31", DAY, "2026-12-01"):
        assert (await client.post(BLOCKED, json=block_body(value))).status_code == 200

    listed = await client.get(BLOCKED, params=RANGE)

    assert [item["date"] for item in listed.json()] == [DAY]


async def test_block_twice_returns_same_row_and_one_audit_entry(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await login_admin(client, sessionmaker)

    first = await client.post(BLOCKED, json=block_body())
    second = await client.post(BLOCKED, json=block_body())

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    async with sessionmaker() as session:
        count = (await session.execute(select(func.count(BlockedDate.id)))).scalar_one()
    assert count == 1
    assert len(await audit_entries(sessionmaker)) == 1


async def test_unblock_missing_date_is_204(client: AsyncClient, sessionmaker: SessionMaker) -> None:
    await login_admin(client, sessionmaker)

    response = await client.delete(f"{BLOCKED}/{DAY}")

    assert response.status_code == 204
    assert await audit_entries(sessionmaker) == []


async def test_block_and_unblock_are_audited(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await login_admin(client, sessionmaker)
    await client.post(BLOCKED, json=block_body())
    async with sessionmaker() as session:
        blocked = (await session.execute(select(BlockedDate))).scalar_one()

    response = await client.delete(f"{BLOCKED}/{DAY}")

    assert response.status_code == 204
    blocked_entry, unblocked_entry = await audit_entries(sessionmaker)
    assert blocked_entry.action == "vaises.date_blocked"
    assert blocked_entry.actor_kind is ActorKind.SUPERADMIN
    assert blocked_entry.target_type == "vaises_blocked_date"
    assert blocked_entry.target_public_id == blocked.public_id
    assert blocked_entry.before is None
    assert blocked_entry.after == {"date": DAY}
    assert unblocked_entry.action == "vaises.date_unblocked"
    assert unblocked_entry.target_public_id == blocked.public_id
    assert unblocked_entry.before == {"date": DAY}
    assert unblocked_entry.after is None


async def test_past_dates_can_be_unblocked(client: AsyncClient, sessionmaker: SessionMaker) -> None:
    await login_admin(client, sessionmaker)
    await client.post(BLOCKED, json=block_body())
    async with sessionmaker() as session:
        row = (await session.execute(select(BlockedDate))).scalar_one()
        row.date = date(2020, 1, 1)
        await session.commit()

    response = await client.delete(f"{BLOCKED}/2020-01-01")

    assert response.status_code == 204
    assert len(await audit_entries(sessionmaker)) == 2


async def test_unblock_keeps_existing_requests_reserved(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await login_admin(client, sessionmaker)
    await client.post(BLOCKED, json=block_body())
    inquiry = {
        "contact": "jonas@pavyzdys.lt",
        "locale": "lt",
        "idempotency_key": str(uuid.uuid4()),
        "turnstile_token": HUMAN_TOKEN,
        "date": DAY,
        "service": "vestuves",
    }
    assert (await client.post(DATE_INQUIRIES, json=inquiry)).status_code == 202

    assert (await client.delete(f"{BLOCKED}/{DAY}")).status_code == 204

    async with sessionmaker() as session:
        request = (await session.execute(select(VaisesRequest))).scalar_one()
    assert request.availability_at_submit is Availability.RESERVED
    availability = await client.get(AVAILABILITY, params={"date": DAY})
    assert availability.json()["availability"] == "available"


async def test_block_rejects_dates_outside_the_window(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await login_admin(client, sessionmaker)

    response = await client.post(BLOCKED, json=block_body("2026-10-09"))

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_DATE"


@pytest.mark.parametrize("bad", ["2026-02-30", "2026-2-5", "abc"])
async def test_malformed_dates_are_invalid_date(
    client: AsyncClient, sessionmaker: SessionMaker, bad: str
) -> None:
    await login_admin(client, sessionmaker)

    for response in (
        await client.delete(f"{BLOCKED}/{bad}"),
        await client.post(BLOCKED, json=block_body(bad)),
        await client.get(BLOCKED, params={"from": bad, "to": "2026-12-01"}),
    ):
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_DATE"


@pytest.mark.parametrize(
    "params",
    [
        {"from": "2026-01-01", "to": "2027-02-06"},
        {"from": "2026-12-01", "to": "2026-11-30"},
    ],
)
async def test_range_over_400_days_or_reversed_rejected(
    client: AsyncClient, sessionmaker: SessionMaker, params: dict[str, str]
) -> None:
    await login_admin(client, sessionmaker)

    response = await client.get(BLOCKED, params=params)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_DATE"


async def test_range_of_exactly_400_days_is_accepted(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await login_admin(client, sessionmaker)

    response = await client.get(BLOCKED, params={"from": "2026-01-01", "to": "2027-02-05"})

    assert response.status_code == 200


async def test_block_rejects_unknown_fields(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await login_admin(client, sessionmaker)

    response = await client.post(BLOCKED, json={**block_body(), "created_by_user_id": 1})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
