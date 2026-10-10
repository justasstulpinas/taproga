import os
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.clock import utcnow
from app.integrations import Integrations
from app.main import create_app
from app.models import Base, OutboxEmail
from app.models.user import AccountType, Locale, User
from app.security.encryption import FieldEncryptor
from app.security.passwords import hash_password
from app.security.totp import generate_totp_secret
from app.settings import Environment, Settings

# CI points this at Postgres so tests catch behaviour SQLite silently tolerates.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
TEST_ENCRYPTION_KEY = Fernet.generate_key().decode()
BASE_URL = "http://testserver"
APP_URL = "http://localhost:3000"

STRONG_PASSWORD = "wedding-cake-lighthouse-42"
OTHER_STRONG_PASSWORD = "linden-tree-by-the-river-7"
BREACHED_PASSWORD = "password123456"
HUMAN_TOKEN = "human-ok"

ClientFactory = Callable[[FastAPI], AbstractAsyncContextManager[AsyncClient]]
SessionMaker = async_sessionmaker[AsyncSession]


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "environment": Environment.TEST,
        "database_url": TEST_DATABASE_URL or "sqlite+aiosqlite:///:memory:",
        "encryption_key": TEST_ENCRYPTION_KEY,
        "public_app_url": APP_URL,
        "breach_check_enabled": False,
    }
    values.update(overrides)
    return Settings.model_validate(values)


@dataclass
class FakeBreachChecker:
    breached: set[str] = field(default_factory=lambda: {BREACHED_PASSWORD})

    async def is_breached(self, password: str) -> bool:
        return password in self.breached


class FakeHumanVerifier:
    async def verify(self, token: str | None, ip: str | None) -> bool:
        return token == HUMAN_TOKEN


def fake_integrations() -> Integrations:
    return Integrations(breach_checker=FakeBreachChecker(), human_verifier=FakeHumanVerifier())


@asynccontextmanager
async def _running_client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client,
    ):
        yield client


@pytest.fixture
def client_for() -> ClientFactory:
    return _running_client


@pytest.fixture
def database_url(tmp_path: Path) -> str:
    return TEST_DATABASE_URL or f"sqlite+aiosqlite:///{tmp_path / 'test.db'}"


@pytest.fixture
def settings(database_url: str) -> Settings:
    return make_settings(database_url=database_url)


@pytest.fixture
async def sessionmaker(database_url: str) -> AsyncIterator[SessionMaker]:
    engine = create_async_engine(database_url)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
        await engine.dispose()


@pytest.fixture
def app(settings: Settings, sessionmaker: SessionMaker) -> FastAPI:
    return create_app(settings, integrations=fake_integrations())


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with _running_client(app) as running:
        yield running


# --- helpers -------------------------------------------------------------------------------


async def outbox_for(sessionmaker: SessionMaker, email: str) -> list[OutboxEmail]:
    async with sessionmaker() as session:
        result = await session.execute(
            select(OutboxEmail).where(OutboxEmail.to_address == email).order_by(OutboxEmail.id)
        )
        return list(result.scalars())


async def latest_token(sessionmaker: SessionMaker, email: str, payload_key: str) -> str:
    emails = [
        e for e in await outbox_for(sessionmaker, email) if e.payload and payload_key in e.payload
    ]
    assert emails, f"no queued email with {payload_key} for {email}"
    fragment = urlsplit(emails[-1].payload[payload_key]).fragment  # type: ignore[index]
    return parse_qs(fragment)["token"][0]


async def get_user(sessionmaker: SessionMaker, email: str) -> User | None:
    async with sessionmaker() as session:
        result = await session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()


def register_body(email: str, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "email": email,
        "password": STRONG_PASSWORD,
        "account_type": "newlywed",
        "turnstile_token": HUMAN_TOKEN,
    }
    body.update(overrides)
    return body


async def register_and_verify(
    client: AsyncClient, sessionmaker: SessionMaker, email: str, **overrides: Any
) -> None:
    response = await client.post("/api/v1/auth/register", json=register_body(email, **overrides))
    assert response.status_code == 202, response.text
    token = await latest_token(sessionmaker, email, "verify_url")
    response = await client.post("/api/v1/auth/verify-email", json={"token": token})
    assert response.status_code == 204, response.text


async def login(client: AsyncClient, email: str, password: str = STRONG_PASSWORD) -> dict[str, Any]:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


@dataclass(frozen=True)
class SuperadminCredentials:
    email: str
    password: str
    totp_secret: str


async def create_superadmin(
    sessionmaker: SessionMaker, email: str = "admin@taproga.lt"
) -> SuperadminCredentials:
    secret = generate_totp_secret()
    async with sessionmaker() as session:
        session.add(
            User(
                email=email,
                password_hash=hash_password(STRONG_PASSWORD),
                account_type=AccountType.SUPERADMIN,
                locale=Locale.EN,
                email_verified_at=utcnow(),
                totp_secret_encrypted=FieldEncryptor(TEST_ENCRYPTION_KEY).encrypt(secret),
            )
        )
        await session.commit()
    return SuperadminCredentials(email=email, password=STRONG_PASSWORD, totp_secret=secret)
