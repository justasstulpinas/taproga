from httpx import AsyncClient

from app.main import create_app
from tests.conftest import ClientFactory, make_settings

UNREACHABLE_SQLITE = "sqlite+aiosqlite:////nonexistent-dir/taproga.db"


async def test_health_reports_ok_when_database_reachable(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": "ok"}}


async def test_health_returns_503_when_database_unreachable(client_for: ClientFactory) -> None:
    app = create_app(make_settings(database_url=UNREACHABLE_SQLITE))

    async with client_for(app) as client:
        response = await client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "checks": {"database": "unavailable"}}
    assert "nonexistent-dir" not in response.text
