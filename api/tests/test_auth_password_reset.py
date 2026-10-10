from httpx import AsyncClient

from tests.conftest import (
    BREACHED_PASSWORD,
    HUMAN_TOKEN,
    OTHER_STRONG_PASSWORD,
    STRONG_PASSWORD,
    SessionMaker,
    get_user,
    latest_token,
    login,
    outbox_for,
    register_and_verify,
    register_body,
)

FORGOT = "/api/v1/auth/password/forgot"
RESET = "/api/v1/auth/password/reset"
LOGIN = "/api/v1/auth/login"


async def _request_reset(client: AsyncClient, email: str) -> None:
    response = await client.post(FORGOT, json={"email": email, "turnstile_token": HUMAN_TOKEN})
    assert response.status_code == 202


async def test_reset_replaces_password_and_revokes_all_sessions(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")
    await login(client, "ona@example.lt")
    old_session = client.cookies["tp_session"]
    await _request_reset(client, "ona@example.lt")
    token = await latest_token(sessionmaker, "ona@example.lt", "reset_url")

    reset = await client.post(RESET, json={"token": token, "new_password": OTHER_STRONG_PASSWORD})
    client.cookies.set("tp_session", old_session)
    old_session_me = await client.get("/api/v1/auth/me")
    old_password = await client.post(
        LOGIN, json={"email": "ona@example.lt", "password": STRONG_PASSWORD}
    )

    assert reset.status_code == 204
    assert old_session_me.status_code == 401
    assert old_password.status_code == 401
    await login(client, "ona@example.lt", OTHER_STRONG_PASSWORD)
    templates = [e.template for e in await outbox_for(sessionmaker, "ona@example.lt")]
    assert templates[-1] == "password_changed"


async def test_reset_token_is_single_use(client: AsyncClient, sessionmaker: SessionMaker) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")
    await _request_reset(client, "ona@example.lt")
    token = await latest_token(sessionmaker, "ona@example.lt", "reset_url")

    first = await client.post(RESET, json={"token": token, "new_password": OTHER_STRONG_PASSWORD})
    second = await client.post(RESET, json={"token": token, "new_password": STRONG_PASSWORD})

    assert first.status_code == 204
    assert second.status_code == 400


async def test_breached_new_password_keeps_the_link_usable(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")
    await _request_reset(client, "ona@example.lt")
    token = await latest_token(sessionmaker, "ona@example.lt", "reset_url")

    rejected = await client.post(RESET, json={"token": token, "new_password": BREACHED_PASSWORD})
    accepted = await client.post(
        RESET, json={"token": token, "new_password": OTHER_STRONG_PASSWORD}
    )

    assert rejected.status_code == 400
    assert rejected.json()["error"]["code"] == "PASSWORD_BREACHED"
    assert accepted.status_code == 204


async def test_forgot_for_unknown_email_looks_identical(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    response = await client.post(
        FORGOT, json={"email": "nobody@example.lt", "turnstile_token": HUMAN_TOKEN}
    )

    assert response.status_code == 202
    assert response.json() == {"status": "accepted"}
    assert await outbox_for(sessionmaker, "nobody@example.lt") == []


async def test_forgot_requires_bot_check(client: AsyncClient) -> None:
    response = await client.post(FORGOT, json={"email": "ona@example.lt", "turnstile_token": None})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "HUMAN_VERIFICATION_FAILED"


async def test_forgot_is_rate_limited_per_account(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")
    for _ in range(3):
        await _request_reset(client, "ona@example.lt")

    blocked = await client.post(
        FORGOT, json={"email": "ona@example.lt", "turnstile_token": HUMAN_TOKEN}
    )

    assert blocked.status_code == 429


async def test_reset_also_verifies_an_unverified_email(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await client.post("/api/v1/auth/register", json=register_body("ona@example.lt"))
    await _request_reset(client, "ona@example.lt")
    token = await latest_token(sessionmaker, "ona@example.lt", "reset_url")

    await client.post(RESET, json={"token": token, "new_password": OTHER_STRONG_PASSWORD})

    user = await get_user(sessionmaker, "ona@example.lt")
    assert user is not None
    assert user.email_verified_at is not None
