from datetime import timedelta

from httpx import AsyncClient
from sqlalchemy import func, select, update

from app.clock import utcnow
from app.models import AuditEntry, AuthToken, NewlywedProfile, ServiceProfile, User
from app.models.user import AccountType
from tests.conftest import (
    BREACHED_PASSWORD,
    SessionMaker,
    get_user,
    latest_token,
    outbox_for,
    register_body,
)

REGISTER = "/api/v1/auth/register"
VERIFY = "/api/v1/auth/verify-email"
RESEND = "/api/v1/auth/resend-verification"


async def _count(sessionmaker: SessionMaker, model: type[object]) -> int:
    async with sessionmaker() as session:
        return (await session.execute(select(func.count()).select_from(model))).scalar_one()


async def test_register_creates_unverified_newlywed_and_queues_verification(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    response = await client.post(REGISTER, json=register_body("Ona@Example.LT"))

    assert response.status_code == 202
    assert response.json() == {"status": "accepted"}
    user = await get_user(sessionmaker, "ona@example.lt")
    assert user is not None
    assert user.account_type is AccountType.NEWLYWED
    assert user.email_verified_at is None
    assert await _count(sessionmaker, NewlywedProfile) == 1
    [email] = await outbox_for(sessionmaker, "ona@example.lt")
    assert email.template == "verify_email"
    assert email.payload is not None
    assert email.payload["verify_url"].startswith("http://localhost:3000/verify-email#token=")


async def test_register_service_requires_business_name(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    missing = await client.post(
        REGISTER, json=register_body("foto@studija.lt", account_type="service")
    )
    created = await client.post(
        REGISTER,
        json=register_body("foto@studija.lt", account_type="service", business_name=" Šviesa "),
    )

    assert missing.status_code == 422
    assert created.status_code == 202
    async with sessionmaker() as session:
        profile = (await session.execute(select(ServiceProfile))).scalar_one()
    assert profile.business_name == "Šviesa"


async def test_register_ignores_privileged_fields(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    body = register_body(
        "tamper@example.lt",
        is_superadmin=True,
        email_verified_at="2020-01-01T00:00:00Z",
        role="superadmin",
        public_id="00000000-0000-4000-8000-000000000000",
    )

    response = await client.post(REGISTER, json=body)

    assert response.status_code == 202
    user = await get_user(sessionmaker, "tamper@example.lt")
    assert user is not None
    assert user.account_type is AccountType.NEWLYWED
    assert user.email_verified_at is None
    assert str(user.public_id) != "00000000-0000-4000-8000-000000000000"


async def test_register_cannot_self_assign_superadmin(client: AsyncClient) -> None:
    response = await client.post(
        REGISTER, json=register_body("sneaky@example.lt", account_type="superadmin")
    )

    assert response.status_code == 422


async def test_register_existing_email_is_indistinguishable_and_notifies_owner(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    first = await client.post(REGISTER, json=register_body("ona@example.lt"))
    second = await client.post(REGISTER, json=register_body("ona@example.lt"))

    assert first.status_code == second.status_code == 202
    assert first.json() == second.json()
    assert await _count(sessionmaker, User) == 1
    templates = [email.template for email in await outbox_for(sessionmaker, "ona@example.lt")]
    assert templates == ["verify_email", "account_exists"]


async def test_register_rejects_breached_password(client: AsyncClient) -> None:
    response = await client.post(
        REGISTER, json=register_body("ona@example.lt", password=BREACHED_PASSWORD)
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "PASSWORD_BREACHED"


async def test_register_enforces_minimum_length_server_side(client: AsyncClient) -> None:
    response = await client.post(
        REGISTER, json=register_body("ona@example.lt", password="short-pw")
    )

    assert response.status_code == 422
    assert response.json()["error"]["fields"] == [
        {"loc": ["body", "password"], "type": "string_too_short"}
    ]


async def test_register_requires_bot_check(client: AsyncClient) -> None:
    response = await client.post(
        REGISTER, json=register_body("ona@example.lt", turnstile_token="bot")
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "HUMAN_VERIFICATION_FAILED"


async def test_register_is_rate_limited_per_ip_with_escalating_backoff(
    client: AsyncClient,
) -> None:
    for index in range(5):
        response = await client.post(REGISTER, json=register_body(f"user{index}@example.lt"))
        assert response.status_code == 202

    blocked = await client.post(REGISTER, json=register_body("user99@example.lt"))

    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "RATE_LIMITED"
    assert int(blocked.headers["Retry-After"]) > 0


async def test_verify_email_is_single_use(client: AsyncClient, sessionmaker: SessionMaker) -> None:
    await client.post(REGISTER, json=register_body("ona@example.lt"))
    token = await latest_token(sessionmaker, "ona@example.lt", "verify_url")

    first = await client.post(VERIFY, json={"token": token})
    second = await client.post(VERIFY, json={"token": token})

    assert first.status_code == 204
    assert second.status_code == 400
    assert second.json()["error"]["code"] == "TOKEN_INVALID_OR_EXPIRED"
    user = await get_user(sessionmaker, "ona@example.lt")
    assert user is not None
    assert user.email_verified_at is not None


async def test_verify_email_rejects_expired_token(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await client.post(REGISTER, json=register_body("ona@example.lt"))
    token = await latest_token(sessionmaker, "ona@example.lt", "verify_url")
    async with sessionmaker() as session:
        await session.execute(update(AuthToken).values(expires_at=utcnow() - timedelta(seconds=1)))
        await session.commit()

    response = await client.post(VERIFY, json={"token": token})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "TOKEN_INVALID_OR_EXPIRED"


async def test_resend_invalidates_previous_link(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await client.post(REGISTER, json=register_body("ona@example.lt"))
    old_token = await latest_token(sessionmaker, "ona@example.lt", "verify_url")

    resend = await client.post(RESEND, json={"email": "ona@example.lt"})
    new_token = await latest_token(sessionmaker, "ona@example.lt", "verify_url")

    assert resend.status_code == 202
    assert (await client.post(VERIFY, json={"token": old_token})).status_code == 400
    assert (await client.post(VERIFY, json={"token": new_token})).status_code == 204


async def test_resend_for_unknown_email_looks_identical(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    response = await client.post(RESEND, json={"email": "nobody@example.lt"})

    assert response.status_code == 202
    assert response.json() == {"status": "accepted"}
    assert await outbox_for(sessionmaker, "nobody@example.lt") == []


async def test_registration_and_verification_are_audited(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await client.post(REGISTER, json=register_body("ona@example.lt"))
    token = await latest_token(sessionmaker, "ona@example.lt", "verify_url")
    await client.post(VERIFY, json={"token": token})

    async with sessionmaker() as session:
        result = await session.execute(select(AuditEntry.action).order_by(AuditEntry.id))
        actions = list(result.scalars())
    assert actions == ["user.registered", "user.email_verified"]
