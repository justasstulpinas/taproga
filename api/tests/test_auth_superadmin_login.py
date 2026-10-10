from httpx import AsyncClient
from sqlalchemy import select

from app.models import AuditEntry
from app.models.audit import ActorKind
from tests.conftest import SessionMaker, create_superadmin, login

LOGIN = "/api/v1/auth/login"
USERS = "/api/v1/admin/users"


async def test_superadmin_login_needs_only_password(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    creds = await create_superadmin(sessionmaker)

    body = await login(client, creds.email, creds.password)

    assert "mfa_required" not in body
    assert "mfa_pending" not in body["user"]
    assert (await client.get(USERS)).status_code == 200


async def test_superadmin_wrong_password_counts_toward_lockout(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    creds = await create_superadmin(sessionmaker)

    for _ in range(5):
        response = await client.post(
            LOGIN, json={"email": creds.email, "password": "wrong-wrong-wrong-1"}
        )
        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"
    locked = await client.post(LOGIN, json={"email": creds.email, "password": creds.password})

    assert locked.status_code == 429


async def test_mfa_endpoint_is_gone(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/mfa", json={"code": "123456"})

    assert response.status_code == 404


async def test_superadmin_login_is_audited(client: AsyncClient, sessionmaker: SessionMaker) -> None:
    creds = await create_superadmin(sessionmaker)
    await login(client, creds.email, creds.password)

    async with sessionmaker() as session:
        result = await session.execute(
            select(AuditEntry).where(AuditEntry.action == "auth.login_succeeded")
        )
        entries = result.scalars().all()

    assert [entry.actor_kind for entry in entries] == [ActorKind.SUPERADMIN]
