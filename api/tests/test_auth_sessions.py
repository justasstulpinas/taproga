from datetime import timedelta

from httpx import AsyncClient
from sqlalchemy import update

from app.clock import utcnow
from app.models import UserSession
from tests.conftest import (
    OTHER_STRONG_PASSWORD,
    STRONG_PASSWORD,
    SessionMaker,
    login,
    register_and_verify,
    register_body,
)

LOGIN = "/api/v1/auth/login"
LOGOUT = "/api/v1/auth/logout"
ME = "/api/v1/auth/me"
COOKIE = "tp_session"


async def test_login_succeeds_after_verification_and_sets_hardened_cookie(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")

    response = await client.post(
        LOGIN, json={"email": "ONA@example.lt", "password": STRONG_PASSWORD}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["mfa_required"] is False
    assert body["user"]["email"] == "ona@example.lt"
    assert body["user"]["account_type"] == "newlywed"
    assert "id" in body["user"]
    assert "password_hash" not in body["user"]
    set_cookie = response.headers["set-cookie"].lower()
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie
    assert "path=/" in set_cookie


async def test_login_blocked_until_email_verified(client: AsyncClient) -> None:
    await client.post("/api/v1/auth/register", json=register_body("ona@example.lt"))

    response = await client.post(
        LOGIN, json={"email": "ona@example.lt", "password": STRONG_PASSWORD}
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "EMAIL_NOT_VERIFIED"
    assert "set-cookie" not in response.headers


async def test_wrong_password_and_unknown_email_look_identical(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")

    wrong = await client.post(
        LOGIN, json={"email": "ona@example.lt", "password": "not-the-password"}
    )
    unknown = await client.post(
        LOGIN, json={"email": "nobody@example.lt", "password": "whatever-it-is"}
    )

    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["error"]["code"] == unknown.json()["error"]["code"] == "INVALID_CREDENTIALS"


async def test_account_locks_after_repeated_failures_even_for_correct_password(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")
    for _ in range(5):
        await client.post(LOGIN, json={"email": "ona@example.lt", "password": "not-the-password"})

    locked = await client.post(LOGIN, json={"email": "ona@example.lt", "password": STRONG_PASSWORD})

    assert locked.status_code == 429
    assert int(locked.headers["Retry-After"]) > 0


async def test_successful_login_resets_failure_count(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")
    for _ in range(4):
        await client.post(LOGIN, json={"email": "ona@example.lt", "password": "not-the-password"})
    await login(client, "ona@example.lt")
    for _ in range(4):
        await client.post(LOGIN, json={"email": "ona@example.lt", "password": "not-the-password"})

    response = await client.post(
        LOGIN, json={"email": "ona@example.lt", "password": STRONG_PASSWORD}
    )

    assert response.status_code == 200


async def test_me_requires_session(client: AsyncClient) -> None:
    response = await client.get(ME)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


async def test_logout_really_invalidates_the_token(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")
    await login(client, "ona@example.lt")
    stolen_token = client.cookies[COOKIE]

    logout = await client.post(LOGOUT)
    client.cookies.set(COOKIE, stolen_token)
    replay = await client.get(ME)

    assert logout.status_code == 204
    assert replay.status_code == 401


async def test_idle_session_expires(client: AsyncClient, sessionmaker: SessionMaker) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")
    await login(client, "ona@example.lt")
    async with sessionmaker() as session:
        await session.execute(update(UserSession).values(last_seen_at=utcnow() - timedelta(days=8)))
        await session.commit()

    response = await client.get(ME)

    assert response.status_code == 401


async def test_change_password_signs_out_other_sessions_but_keeps_this_one(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")
    await login(client, "ona@example.lt")
    other_device_token = client.cookies[COOKIE]
    client.cookies.clear()
    await login(client, "ona@example.lt")

    response = await client.post(
        "/api/v1/auth/password/change",
        json={"current_password": STRONG_PASSWORD, "new_password": OTHER_STRONG_PASSWORD},
    )
    still_signed_in = await client.get(ME)
    client.cookies.set(COOKIE, other_device_token)
    other_device = await client.get(ME)

    assert response.status_code == 204
    assert still_signed_in.status_code == 200
    assert other_device.status_code == 401


async def test_change_password_requires_current_password(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")
    await login(client, "ona@example.lt")

    response = await client.post(
        "/api/v1/auth/password/change",
        json={"current_password": "not-the-password", "new_password": OTHER_STRONG_PASSWORD},
    )

    assert response.status_code == 401
