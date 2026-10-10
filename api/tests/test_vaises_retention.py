import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.jobs.vaises_retention import run_retention
from app.models import (
    AuditEntry,
    ContactKind,
    Locale,
    RequestKind,
    RequestStatus,
    VaisesRequest,
)
from app.models.audit import ActorKind
from app.models.vaises import ANONYMISED_COLUMNS
from app.services.audit import AuditAction
from app.services.vaises import anonymise
from tests.conftest import SessionMaker

NOW = datetime(2027, 1, 1, 12, 0, tzinfo=UTC)


def make_request(status: RequestStatus, handled_ago: timedelta | None) -> VaisesRequest:
    return VaisesRequest(
        kind=RequestKind.DATE_INQUIRY,
        event_date=date(2027, 6, 12),
        contact_kind=ContactKind.EMAIL,
        contact_encrypted="ciphertext",
        contact_hash="a" * 64,
        locale=Locale.LT,
        idempotency_key=uuid.uuid4(),
        status=status,
        handled_at=NOW - handled_ago if handled_ago is not None else None,
    )


async def store(sessionmaker: SessionMaker, *requests: VaisesRequest) -> list[int]:
    async with sessionmaker() as session:
        session.add_all(requests)
        await session.commit()
        return [r.id for r in requests]


async def load(sessionmaker: SessionMaker, request_id: int) -> VaisesRequest:
    async with sessionmaker() as session:
        return (
            await session.execute(select(VaisesRequest).where(VaisesRequest.id == request_id))
        ).scalar_one()


async def run(sessionmaker: SessionMaker) -> int:
    async with sessionmaker() as session:
        return await run_retention(session, NOW)


async def test_request_handled_beyond_retention_is_anonymised(sessionmaker: SessionMaker) -> None:
    (request_id,) = await store(
        sessionmaker,
        make_request(RequestStatus.HANDLED, timedelta(days=731)),
    )
    assert await run(sessionmaker) == 1
    request = await load(sessionmaker, request_id)
    assert request.anonymised_at is not None
    assert all(getattr(request, column) is None for column in ANONYMISED_COLUMNS)


async def test_request_handled_within_retention_is_untouched(sessionmaker: SessionMaker) -> None:
    (request_id,) = await store(
        sessionmaker,
        make_request(RequestStatus.HANDLED, timedelta(days=729)),
    )
    assert await run(sessionmaker) == 0
    request = await load(sessionmaker, request_id)
    assert request.anonymised_at is None
    assert request.contact_encrypted == "ciphertext"


async def test_unhandled_request_is_untouched_at_any_age(sessionmaker: SessionMaker) -> None:
    (request_id,) = await store(sessionmaker, make_request(RequestStatus.NEW, None))
    assert await run(sessionmaker) == 0
    assert (await load(sessionmaker, request_id)).anonymised_at is None


async def test_second_run_anonymises_nothing_but_still_audits(sessionmaker: SessionMaker) -> None:
    await store(sessionmaker, make_request(RequestStatus.HANDLED, timedelta(days=731)))
    assert await run(sessionmaker) == 1
    assert await run(sessionmaker) == 0
    async with sessionmaker() as session:
        entries = (
            (
                await session.execute(
                    select(AuditEntry)
                    .where(AuditEntry.action == AuditAction.VAISES_RETENTION_RUN)
                    .order_by(AuditEntry.id)
                )
            )
            .scalars()
            .all()
        )
    assert [e.context for e in entries] == [{"anonymised": 1}, {"anonymised": 0}]
    assert all(e.actor_kind == ActorKind.SYSTEM and e.actor_user_id is None for e in entries)


async def test_bulk_and_single_anonymisation_leave_identical_values(
    sessionmaker: SessionMaker,
) -> None:
    old = timedelta(days=731)
    bulk_id, single_id = await store(
        sessionmaker,
        make_request(RequestStatus.HANDLED, old),
        make_request(RequestStatus.HANDLED, old),
    )
    async with sessionmaker() as session:
        single = (
            await session.execute(select(VaisesRequest).where(VaisesRequest.id == single_id))
        ).scalar_one()
        anonymise(single, NOW)
        await session.commit()
    await run(sessionmaker)
    bulk = await load(sessionmaker, bulk_id)
    single = await load(sessionmaker, single_id)
    for column in ANONYMISED_COLUMNS:
        assert getattr(bulk, column) == getattr(single, column)
    assert bulk.anonymised_at is not None
    assert single.anonymised_at is not None
