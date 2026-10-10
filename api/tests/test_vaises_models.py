import uuid
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import BlockedDate, Locale, RequestKind, RequestStatus, User, VaisesRequest
from tests.conftest import SessionMaker, create_superadmin

EVENT_DATE = date(2027, 6, 12)


def make_request(kind: RequestKind, event_date: date | None) -> VaisesRequest:
    return VaisesRequest(
        kind=kind,
        event_date=event_date,
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
        session.add(make_request(RequestKind.DATE_INQUIRY, EVENT_DATE))
        await session.commit()


@pytest.mark.parametrize(
    ("kind", "event_date"),
    [(RequestKind.CONSULTATION, EVENT_DATE), (RequestKind.DATE_INQUIRY, None)],
)
async def test_event_date_must_match_kind(
    sessionmaker: SessionMaker, kind: RequestKind, event_date: date | None
) -> None:
    async with sessionmaker() as session:
        session.add(make_request(kind, event_date))
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
