import asyncio
import logging
import uuid
from collections.abc import Iterator
from datetime import date
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, Response
from sqlalchemy import func, select

from app.dependencies import get_today
from app.emails.templates import EmailTemplate, render_email
from app.integrations import Integrations
from app.main import create_app
from app.models import OutboxEmail, User
from app.models.auth import ThrottleEvent
from app.models.user import Locale
from app.models.vaises import (
    Availability,
    BlockedDate,
    ContactKind,
    RequestKind,
    RequestStatus,
    Service,
    VaisesRequest,
)
from app.repositories.vaises import VaisesRepository
from app.schemas.vaises import clean_message
from app.security.encryption import FieldEncryptor
from app.services.throttle import Rules
from app.settings import Settings
from tests.conftest import (
    APP_URL,
    HUMAN_TOKEN,
    TEST_ENCRYPTION_KEY,
    ClientFactory,
    FakeBreachChecker,
    FakeHumanVerifier,
    SessionMaker,
    create_superadmin,
    outbox_for,
)

TODAY = date(2026, 10, 10)
EVENT_DAY = "2026-11-14"
DATE_LABEL = "2026 m. lapkričio 14 d."
NOTIFY = "owner@vaises.lt"
VISITOR = "jonas@pavyzdys.lt"
PHONE = "+37061234567"
DATE_URL = "/api/v1/vaises/date-inquiries"
CONSULTATION_URL = "/api/v1/vaises/consultation-requests"
IP_LIMIT = 5


@pytest.fixture(autouse=True)
def fixed_today(app: FastAPI) -> Iterator[None]:
    app.dependency_overrides[get_today] = lambda: TODAY
    yield
    app.dependency_overrides.pop(get_today, None)


def consultation_body(contact: str = VISITOR, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "contact": contact,
        "locale": "lt",
        "idempotency_key": str(uuid.uuid4()),
        "turnstile_token": HUMAN_TOKEN,
    }
    body.update(overrides)
    return body


def inquiry_body(contact: str = VISITOR, **overrides: Any) -> dict[str, Any]:
    return consultation_body(contact, **{"date": EVENT_DAY, "service": "vestuves", **overrides})


async def submit(client: AsyncClient, body: dict[str, Any]) -> Response:
    return await client.post(DATE_URL, json=body)


async def stored_requests(sessionmaker: SessionMaker) -> list[VaisesRequest]:
    async with sessionmaker() as session:
        return list((await session.execute(select(VaisesRequest))).scalars())


async def all_outbox(sessionmaker: SessionMaker) -> list[OutboxEmail]:
    async with sessionmaker() as session:
        return list((await session.execute(select(OutboxEmail))).scalars())


async def throttle_count(sessionmaker: SessionMaker, action: str) -> int:
    async with sessionmaker() as session:
        query = select(func.count()).where(ThrottleEvent.action == action)
        return (await session.execute(query)).scalar_one()


def error_of(response: Response) -> tuple[int, str]:
    return response.status_code, response.json()["error"]["code"]


async def test_date_inquiry_stores_and_queues_two_emails(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    response = await submit(client, inquiry_body(locale="en"))
    assert response.status_code == 202, response.text

    [request] = await stored_requests(sessionmaker)
    assert request.kind is RequestKind.DATE_INQUIRY
    assert request.status is RequestStatus.NEW
    assert request.event_date == date(2026, 11, 14)
    assert request.availability_at_submit is Availability.AVAILABLE
    assert request.contact_kind is ContactKind.EMAIL
    assert request.locale is Locale.EN

    [owner] = await outbox_for(sessionmaker, NOTIFY)
    assert owner.template == EmailTemplate.VAISES_OWNER_NOTIFICATION
    assert owner.locale is Locale.LT
    assert owner.payload == {
        "kind_label": "Datos užklausa",
        "date_label": DATE_LABEL,
        "availability_label": "laisva",
        "contact": VISITOR,
        "admin_url": f"{APP_URL}/admin/vaises/uzklausos?id={request.public_id}",
    }
    rendered = render_email(EmailTemplate(owner.template), owner.locale, NOTIFY, owner.payload)
    assert rendered.subject == f"Nauja užklausa: {DATE_LABEL}"

    [receipt] = await outbox_for(sessionmaker, VISITOR)
    assert receipt.template == EmailTemplate.VAISES_RECEIPT_DATE
    assert receipt.locale is Locale.EN
    assert receipt.payload == {"date_label": DATE_LABEL}


async def test_phone_contact_gets_no_receipt(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    assert (await submit(client, inquiry_body("+370 612 34567"))).status_code == 202

    [request] = await stored_requests(sessionmaker)
    assert request.contact_kind is ContactKind.PHONE
    [owner] = await all_outbox(sessionmaker)
    assert owner.to_address == NOTIFY
    assert owner.payload is not None
    assert owner.payload["contact"] == PHONE


async def test_reserved_date_is_still_accepted_and_recorded_as_reserved(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await create_superadmin(sessionmaker)
    async with sessionmaker() as session:
        admin_id = (await session.execute(select(User.id))).scalar_one()
        session.add(BlockedDate(date=date(2026, 11, 14), created_by_user_id=admin_id))
        await session.commit()

    assert (await submit(client, inquiry_body())).status_code == 202

    [request] = await stored_requests(sessionmaker)
    assert request.availability_at_submit is Availability.RESERVED
    [owner] = await outbox_for(sessionmaker, NOTIFY)
    assert owner.payload is not None
    assert owner.payload["availability_label"] == "rezervuota"


@pytest.mark.parametrize("tampered", [{"availability": "available"}, {"status": "handled"}])
async def test_client_cannot_set_availability_or_status(
    client: AsyncClient, sessionmaker: SessionMaker, tampered: dict[str, str]
) -> None:
    response = await submit(client, inquiry_body(**tampered))
    assert error_of(response) == (422, "VALIDATION_ERROR")
    assert await stored_requests(sessionmaker) == []


async def test_contact_is_encrypted_and_not_logged(
    client: AsyncClient, sessionmaker: SessionMaker, caplog: pytest.LogCaptureFixture
) -> None:
    # The app's default level; the sqlite driver's own DEBUG traces echo SQL parameters.
    with caplog.at_level(logging.INFO):
        assert (await submit(client, inquiry_body())).status_code == 202

    [request] = await stored_requests(sessionmaker)
    assert request.contact_encrypted is not None
    assert request.contact_encrypted != VISITOR
    assert FieldEncryptor(TEST_ENCRYPTION_KEY).decrypt(request.contact_encrypted) == VISITOR
    assert request.contact_hash is not None
    assert len(request.contact_hash) == 64
    for record in caplog.records:
        assert VISITOR not in record.getMessage()
        assert VISITOR not in str(record.__dict__)


async def test_missing_notify_email_skips_owner_email_with_warning(
    client: AsyncClient,
    sessionmaker: SessionMaker,
    app: FastAPI,
    caplog: pytest.LogCaptureFixture,
) -> None:
    app.state.settings = app.state.settings.model_copy(update={"vaises_notify_email": None})

    with caplog.at_level(logging.WARNING):
        assert (await submit(client, inquiry_body())).status_code == 202

    [request] = await stored_requests(sessionmaker)
    assert [email.to_address for email in await all_outbox(sessionmaker)] == [VISITOR]
    [warning] = [r for r in caplog.records if r.getMessage() == "vaises_notify_email_unset"]
    assert warning.levelno == logging.WARNING
    assert getattr(warning, "request_public_id", None) == str(request.public_id)


@pytest.mark.parametrize("token", ["bot", None])
async def test_turnstile_fails_closed(
    client: AsyncClient, sessionmaker: SessionMaker, token: str | None
) -> None:
    response = await submit(client, inquiry_body(turnstile_token=token))
    assert error_of(response) == (400, "HUMAN_VERIFICATION_FAILED")
    assert await stored_requests(sessionmaker) == []
    assert await all_outbox(sessionmaker) == []


async def test_same_idempotency_key_writes_once(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    body = inquiry_body()
    assert (await submit(client, body)).status_code == 202
    assert (await submit(client, body)).status_code == 202

    assert len(await stored_requests(sessionmaker)) == 1
    assert len(await all_outbox(sessionmaker)) == 2


async def test_concurrent_same_key_writes_once(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    body = inquiry_body()
    responses = await asyncio.gather(submit(client, body), submit(client, body))

    assert [r.status_code for r in responses] == [202, 202]
    assert len(await stored_requests(sessionmaker)) == 1
    assert len(await outbox_for(sessionmaker, NOTIFY)) == 1


async def test_lost_insert_race_returns_202_without_side_effects(
    client: AsyncClient, sessionmaker: SessionMaker, monkeypatch: pytest.MonkeyPatch
) -> None:
    real_exists = VaisesRepository.idempotency_key_exists
    pre_insert_checks = 0

    async def blind_pre_insert_checks(self: VaisesRepository, key: uuid.UUID) -> bool:
        nonlocal pre_insert_checks
        pre_insert_checks += 1
        # Calls 1 and 2 are each post's pre-insert check; call 3 is the loser's re-check.
        return False if pre_insert_checks <= 2 else await real_exists(self, key)

    # Lets the second post past the existence check, as a concurrent twin would get.
    monkeypatch.setattr(VaisesRepository, "idempotency_key_exists", blind_pre_insert_checks)
    body = inquiry_body()
    assert (await submit(client, body)).status_code == 202
    assert (await submit(client, body)).status_code == 202

    assert len(await stored_requests(sessionmaker)) == 1
    assert len(await all_outbox(sessionmaker)) == 2
    assert await throttle_count(sessionmaker, Rules.VAISES_SUBMIT_IP.action) == 1
    assert await throttle_count(sessionmaker, Rules.VAISES_SUBMIT_RECIPIENT.action) == 1


async def test_ip_limit(client: AsyncClient) -> None:
    for i in range(IP_LIMIT):
        assert (await submit(client, inquiry_body(f"+3706123456{i}"))).status_code == 202
    response = await submit(client, inquiry_body("+37061234569"))
    assert error_of(response) == (429, "RATE_LIMITED")
    assert int(response.headers["Retry-After"]) > 0


class CountingHumanVerifier(FakeHumanVerifier):
    def __init__(self) -> None:
        self.calls = 0

    async def verify(self, token: str | None, ip: str | None) -> bool:
        self.calls += 1
        return await super().verify(token, ip)


async def test_failed_attempts_are_throttled_before_turnstile(
    client_for: ClientFactory, settings: Settings, sessionmaker: SessionMaker
) -> None:
    verifier = CountingHumanVerifier()
    app = create_app(
        settings,
        integrations=Integrations(breach_checker=FakeBreachChecker(), human_verifier=verifier),
    )
    attempt_limit = Rules.VAISES_SUBMIT_ATTEMPT_IP.limit

    async with client_for(app) as client:
        for _ in range(attempt_limit):
            response = await client.post(
                CONSULTATION_URL, json=consultation_body(turnstile_token="bot")
            )
            assert error_of(response) == (400, "HUMAN_VERIFICATION_FAILED")
        response = await client.post(
            CONSULTATION_URL, json=consultation_body(turnstile_token="bot")
        )

    assert error_of(response) == (429, "RATE_LIMITED")
    assert verifier.calls == attempt_limit
    assert await stored_requests(sessionmaker) == []


@pytest.mark.parametrize(
    "variants",
    [
        ["Jonas@Example.LT ", "jonas@example.lt", "JONAS@example.lt", " jonas@EXAMPLE.lt"],
        ["+370 612 34567", "+37061234567", "(+370) 612-34567", "+370.612.34567"],
    ],
    ids=["email", "phone"],
)
async def test_recipient_limit_normalises_contact(
    client: AsyncClient, sessionmaker: SessionMaker, variants: list[str]
) -> None:
    *accepted, rejected = variants
    for contact in accepted:
        assert (await submit(client, inquiry_body(contact))).status_code == 202
    assert error_of(await submit(client, inquiry_body(rejected))) == (429, "RATE_LIMITED")
    assert len(await stored_requests(sessionmaker)) == len(accepted)


@pytest.mark.parametrize("contact", ["jonas@", "123", "jonas@example", "a" * 312 + "@example.lt"])
async def test_invalid_contact(
    client: AsyncClient, sessionmaker: SessionMaker, contact: str
) -> None:
    assert error_of(await submit(client, inquiry_body(contact))) == (422, "INVALID_CONTACT")
    assert await stored_requests(sessionmaker) == []


async def test_date_outside_booking_window_is_rejected(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    for outside in ("2026-10-09", "2029-10-11", "2026-02-30"):
        response = await submit(client, inquiry_body(date=outside))
        assert error_of(response) == (422, "INVALID_DATE")
    assert await stored_requests(sessionmaker) == []


async def test_consultation_has_no_event_date(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    response = await client.post(CONSULTATION_URL, json=consultation_body())
    assert response.status_code == 202, response.text

    [request] = await stored_requests(sessionmaker)
    assert request.kind is RequestKind.CONSULTATION
    assert request.event_date is None
    assert request.availability_at_submit is None

    [owner] = await outbox_for(sessionmaker, NOTIFY)
    assert owner.payload == {
        "kind_label": "Konsultacijos užklausa",
        "date_label": "",
        "availability_label": "",
        "contact": VISITOR,
        "admin_url": f"{APP_URL}/admin/vaises/uzklausos?id={request.public_id}",
    }
    [receipt] = await outbox_for(sessionmaker, VISITOR)
    assert receipt.template == EmailTemplate.VAISES_RECEIPT_CONSULTATION
    assert receipt.payload == {}


async def test_consultation_rejects_a_date(client: AsyncClient, sessionmaker: SessionMaker) -> None:
    response = await client.post(CONSULTATION_URL, json=consultation_body(date=EVENT_DAY))
    assert error_of(response) == (422, "VALIDATION_ERROR")
    assert await stored_requests(sessionmaker) == []


def without(body: dict[str, Any], key: str) -> dict[str, Any]:
    return {name: value for name, value in body.items() if name != key}


async def test_service_is_required(client: AsyncClient, sessionmaker: SessionMaker) -> None:
    response = await submit(client, without(inquiry_body(), "service"))
    assert error_of(response) == (422, "VALIDATION_ERROR")
    assert await stored_requests(sessionmaker) == []


async def test_unknown_service_rejected(client: AsyncClient, sessionmaker: SessionMaker) -> None:
    response = await submit(client, inquiry_body(service="misija"))
    assert error_of(response) == (422, "VALIDATION_ERROR")
    assert await stored_requests(sessionmaker) == []


async def test_message_is_trimmed_and_encrypted(
    client: AsyncClient, sessionmaker: SessionMaker, caplog: pytest.LogCaptureFixture
) -> None:
    message = "Mums reikia vakarienės 80 svečių."
    with caplog.at_level(logging.INFO):
        response = await submit(client, inquiry_body(service="renginiai", message=f"  {message}  "))
    assert response.status_code == 202, response.text

    [request] = await stored_requests(sessionmaker)
    assert request.service is Service.RENGINIAI
    assert request.message_encrypted is not None
    assert request.message_encrypted != message
    assert FieldEncryptor(TEST_ENCRYPTION_KEY).decrypt(request.message_encrypted) == message
    for record in caplog.records:
        assert message not in record.getMessage()
        assert message not in str(record.__dict__)


@pytest.mark.parametrize("blank", ["", "   ", "\n\t "])
async def test_blank_message_stored_as_null(
    client: AsyncClient, sessionmaker: SessionMaker, blank: str
) -> None:
    assert (await submit(client, inquiry_body(message=blank))).status_code == 202
    [request] = await stored_requests(sessionmaker)
    assert request.message_encrypted is None


async def test_fifty_words_with_lithuanian_and_emoji_accepted(client: AsyncClient) -> None:
    message = " ".join(["žodis"] * 48 + ["Ačiū", "🎉"])
    assert (await submit(client, inquiry_body(message=message))).status_code == 202


async def test_fifty_one_words_rejected(client: AsyncClient, sessionmaker: SessionMaker) -> None:
    response = await submit(client, inquiry_body(message=" ".join(["žodis"] * 51)))
    assert error_of(response) == (422, "MESSAGE_TOO_LONG")
    assert await stored_requests(sessionmaker) == []


async def test_single_601_char_word_rejected(client: AsyncClient) -> None:
    response = await submit(client, inquiry_body(message="a" * 601))
    assert error_of(response) == (422, "MESSAGE_TOO_LONG")


async def test_consultation_rejects_message_field(client: AsyncClient) -> None:
    response = await client.post(CONSULTATION_URL, json=consultation_body(message="Labas"))
    assert error_of(response) == (422, "VALIDATION_ERROR")


def test_clean_message_strips_control_and_bidi_characters() -> None:
    raw = "Labas\u202edlrow\u0007\nantra eilutė\tok"
    assert clean_message(raw) == "Labasdlrow\nantra eilutė\tok"
