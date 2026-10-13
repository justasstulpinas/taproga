import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import AuditEntry
from app.models.audit import ActorKind
from tests.conftest import (
    STRONG_PASSWORD,
    SessionMaker,
    admin_login,
    create_superadmin,
    get_user,
    login,
    outbox_for,
    register_and_verify,
    register_body,
)

USERS = "/api/v1/admin/users"

ADMIN_ENDPOINTS = [
    ("GET", USERS),
    ("GET", f"{USERS}/00000000-0000-4000-8000-000000000000"),
    ("POST", f"{USERS}/00000000-0000-4000-8000-000000000000/verify-email"),
    ("POST", f"{USERS}/00000000-0000-4000-8000-000000000000/password-reset"),
    ("POST", f"{USERS}/00000000-0000-4000-8000-000000000000/unlock"),
    ("GET", "/api/v1/admin/audit-log"),
]


async def _user_id(client: AsyncClient, email: str) -> str:
    response = await client.get(USERS, params={"q": email})
    [item] = response.json()["items"]
    user_id: str = item["id"]
    return user_id


@pytest.mark.parametrize(("method", "path"), ADMIN_ENDPOINTS)
async def test_admin_endpoints_reject_anonymous(
    client: AsyncClient, method: str, path: str
) -> None:
    response = await client.request(method, path)

    assert response.status_code == 401


@pytest.mark.parametrize(("method", "path"), ADMIN_ENDPOINTS)
@pytest.mark.parametrize("account_type", ["newlywed", "service"])
async def test_admin_endpoints_reject_regular_users(
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


async def test_force_verify_is_audited_as_the_superadmin(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await client.post("/api/v1/auth/register", json=register_body("ona@example.lt"))
    creds = await create_superadmin(sessionmaker)
    await admin_login(client, creds)
    user_id = await _user_id(client, "ona@example.lt")

    response = await client.post(f"{USERS}/{user_id}/verify-email")

    assert response.status_code == 200
    assert response.json()["email_verified_at"] is not None
    admin = await get_user(sessionmaker, creds.email)
    async with sessionmaker() as session:
        entry = (
            await session.execute(
                select(AuditEntry).where(AuditEntry.action == "admin.force_verified_email")
            )
        ).scalar_one()
    assert admin is not None
    assert entry.actor_kind is ActorKind.SUPERADMIN
    assert entry.actor_user_id == admin.id
    assert str(entry.target_public_id) == user_id
    assert entry.before == {"email_verified": False}
    assert entry.after == {"email_verified": True}


async def test_unlock_clears_a_locked_account(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")
    for _ in range(5):
        await client.post(
            "/api/v1/auth/login", json={"email": "ona@example.lt", "password": "not-the-password"}
        )
    creds = await create_superadmin(sessionmaker)
    await admin_login(client, creds)
    user_id = await _user_id(client, "ona@example.lt")

    unlock = await client.post(f"{USERS}/{user_id}/unlock")
    client.cookies.clear()
    response = await client.post(
        "/api/v1/auth/login", json={"email": "ona@example.lt", "password": STRONG_PASSWORD}
    )

    assert unlock.status_code == 204
    assert response.status_code == 200


async def test_trigger_password_reset_emails_the_user(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")
    creds = await create_superadmin(sessionmaker)
    await admin_login(client, creds)
    user_id = await _user_id(client, "ona@example.lt")

    response = await client.post(f"{USERS}/{user_id}/password-reset")

    assert response.status_code == 202
    templates = [e.template for e in await outbox_for(sessionmaker, "ona@example.lt")]
    assert templates[-1] == "password_reset"


async def test_user_list_is_paginated_and_bounded(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    for index in range(3):
        await register_and_verify(client, sessionmaker, f"user{index}@example.lt")
    creds = await create_superadmin(sessionmaker)
    await admin_login(client, creds)

    first = await client.get(USERS, params={"limit": 2})
    second = await client.get(USERS, params={"limit": 2, "cursor": first.json()["next_cursor"]})
    too_large = await client.get(USERS, params={"limit": 1000})
    bad_cursor = await client.get(USERS, params={"cursor": "not-a-cursor"})

    first_ids = {item["id"] for item in first.json()["items"]}
    second_ids = {item["id"] for item in second.json()["items"]}
    assert len(first_ids) == 2
    assert len(second_ids) == 2  # 3 users + the superadmin
    assert first_ids.isdisjoint(second_ids)
    assert second.json()["next_cursor"] is None
    assert too_large.status_code == 422
    assert bad_cursor.status_code == 400


async def test_user_search_treats_wildcards_literally(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")
    creds = await create_superadmin(sessionmaker)
    await admin_login(client, creds)

    response = await client.get(USERS, params={"q": "%"})

    assert response.json()["items"] == []


async def test_audit_log_is_readable_by_superadmin(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await register_and_verify(client, sessionmaker, "ona@example.lt")
    creds = await create_superadmin(sessionmaker)
    await admin_login(client, creds)

    response = await client.get("/api/v1/admin/audit-log")

    actions = [item["action"] for item in response.json()["items"]]
    assert response.status_code == 200
    assert "user.registered" in actions
    assert "auth.login_succeeded" in actions
