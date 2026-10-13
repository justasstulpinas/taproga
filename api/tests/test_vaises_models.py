import uuid
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import BlockedDate, Locale, RequestKind, RequestStatus, User, VaisesRequest
from app.models.vaises import Service
from tests.conftest import SessionMaker, create_superadmin

EVENT_DATE = date(2027, 6, 12)


def default_service(kind: RequestKind) -> Service | None:
    return Service.VESTUVES if kind is RequestKind.DATE_INQUIRY else None


def make_request(
    kind: RequestKind, event_date: date | None, service: Service | None = None
) -> VaisesRequest:
    return VaisesRequest(
        kind=kind,
        event_date=event_date,
        service=service,
        locale=Locale.LT,
        idempotency_key=uuid.uuid4(),
        status=RequestStatus.NEW,
    )


async def admin_id(sessionmaker: SessionMaker) -> int:
    await create_superadmin(sessionmaker)
    async with sessionmaker() as session:
        return (await session.execute(select(User.id))).scalar_one()


async def test_date_inquiry_with_event_date_is_stored(sessionmaker: SessionMaker) -> None:
    async with sessionmaker() as session:
        session.add(make_request(RequestKind.DATE_INQUIRY, EVENT_DATE, Service.VESTUVES))
        await session.commit()


async def test_date_inquiry_stores_service_and_message(sessionmaker: SessionMaker) -> None:
    request = make_request(RequestKind.DATE_INQUIRY, EVENT_DATE, Service.RENGINIAI)
    request.message_encrypted = "ciphertext"
    async with sessionmaker() as session:
        session.add(request)
        await session.commit()


@pytest.mark.parametrize(
    ("kind", "event_date", "service"),
    [
        (RequestKind.DATE_INQUIRY, EVENT_DATE, None),
        (RequestKind.CONSULTATION, None, Service.UZKANDZIAI),
    ],
)
async def test_service_must_match_kind(
    sessionmaker: SessionMaker, kind: RequestKind, event_date: date | None, service: Service | None
) -> None:
    async with sessionmaker() as session:
        session.add(make_request(kind, event_date, service))
        with pytest.raises(IntegrityError):
            await session.commit()


@pytest.mark.parametrize(
    ("kind", "event_date"),
    [(RequestKind.CONSULTATION, EVENT_DATE), (RequestKind.DATE_INQUIRY, None)],
)
async def test_event_date_must_match_kind(
    sessionmaker: SessionMaker, kind: RequestKind, event_date: date | None
) -> None:
    async with sessionmaker() as session:
        session.add(make_request(kind, event_date, default_service(kind)))
        with pytest.raises(IntegrityError):
            await session.commit()


async def test_blocked_date_is_unique(sessionmaker: SessionMaker) -> None:
    user_id = await admin_id(sessionmaker)
    async with sessionmaker() as session:
        session.add(BlockedDate(date=EVENT_DATE, created_by_user_id=user_id))
        await session.commit()
    async with sessionmaker() as session:
        session.add(BlockedDate(date=EVENT_DATE, created_by_user_id=user_id))
        with pytest.raises(IntegrityError):
            await session.commit()
