"""Runs the real Alembic migrations (not create_all) so schema drift and irreversibility fail CI.

Sync tests on purpose: migrations/env.py calls asyncio.run(), which can't nest in a running loop.
"""

import asyncio
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine

from app.settings import get_settings
from tests.conftest import TEST_DATABASE_URL, TEST_ENCRYPTION_KEY

API_ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def alembic_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Config]:
    url = TEST_DATABASE_URL or f"sqlite+aiosqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("ENCRYPTION_KEY", TEST_ENCRYPTION_KEY)
    monkeypatch.setenv("ENVIRONMENT", "test")
    get_settings.cache_clear()
    config = Config(str(API_ROOT / "alembic.ini"))
    yield config
    command.downgrade(config, "base")
    get_settings.cache_clear()


def test_migrations_match_models_and_are_reversible(alembic_config: Config) -> None:
    command.upgrade(alembic_config, "head")
    command.check(alembic_config)
    command.downgrade(alembic_config, "base")
    command.upgrade(alembic_config, "head")


@pytest.mark.skipif(
    not (TEST_DATABASE_URL or "").startswith("postgresql"), reason="trigger is Postgres-only"
)
def test_audit_log_is_append_only_in_postgres(alembic_config: Config) -> None:
    command.upgrade(alembic_config, "head")

    async def attempt_update() -> None:
        engine = create_async_engine(get_settings().database_url)
        try:
            async with engine.begin() as connection:
                await connection.execute(
                    text(
                        "INSERT INTO audit_log (public_id, created_at, actor_kind, action) "
                        "VALUES (gen_random_uuid(), now(), 'system', 'test.entry')"
                    )
                )
            async with engine.begin() as connection:
                await connection.execute(text("UPDATE audit_log SET action = 'tampered'"))
        finally:
            await engine.dispose()

    with pytest.raises(DBAPIError, match="append-only"):
        asyncio.run(attempt_update())


def test_0004_backfills_existing_date_inquiries_as_vestuves(alembic_config: Config) -> None:
    command.upgrade(alembic_config, "0003")

    async def run(statement: str) -> list[tuple[object, ...]]:
        engine = create_async_engine(get_settings().database_url)
        try:
            async with engine.begin() as connection:
                result = await connection.execute(text(statement))
                return [tuple(row) for row in result] if result.returns_rows else []
        finally:
            await engine.dispose()

    asyncio.run(
        run(
            "INSERT INTO vaises_requests (public_id, kind, event_date, locale,"
            " idempotency_key, status, created_at, updated_at) VALUES "
            "('11111111-1111-4111-8111-111111111111', 'date_inquiry', '2027-06-12', 'lt',"
            " 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'new', '2026-10-01', '2026-10-01'),"
            "('22222222-2222-4222-8222-222222222222', 'consultation', NULL, 'lt',"
            " 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'new', '2026-10-01', '2026-10-01')"
        )
    )

    command.upgrade(alembic_config, "head")
    rows = asyncio.run(run("SELECT kind, service FROM vaises_requests ORDER BY kind"))
    assert rows == [("consultation", None), ("date_inquiry", "vestuves")]

    command.downgrade(alembic_config, "0003")
    with pytest.raises(DBAPIError):
        asyncio.run(run("SELECT service FROM vaises_requests"))
