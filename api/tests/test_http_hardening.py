import uuid

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import BaseModel

from app.main import create_app
from app.middleware.security_headers import API_CSP
from app.request_context import REQUEST_ID_HEADER
from app.settings import Environment
from tests.conftest import ClientFactory, make_settings

PRODUCTION_DB = "postgresql+asyncpg://user:pass@db.invalid/taproga"
SECRET_IN_EXCEPTION = "db-password-hunter2"
SECRET_IN_BODY = "correct horse battery staple"


class _Payload(BaseModel):
    password: str
    age: int


def _add_failing_routes(app: FastAPI) -> None:
    async def boom() -> None:
        raise RuntimeError(SECRET_IN_EXCEPTION)

    async def echo(payload: _Payload) -> _Payload:
        return payload

    app.add_api_route("/test/boom", boom, methods=["GET"])
    app.add_api_route("/test/echo", echo, methods=["POST"])


async def test_security_headers_on_every_response(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert response.headers["Content-Security-Policy"] == API_CSP
    assert "camera=()" in response.headers["Permissions-Policy"]
    assert response.headers["Cache-Control"] == "no-store"


async def test_no_hsts_outside_deployed_environments(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert "Strict-Transport-Security" not in response.headers


@pytest.mark.parametrize("environment", [Environment.STAGING, Environment.PRODUCTION])
async def test_hsts_and_no_docs_when_deployed(
    client_for: ClientFactory, environment: Environment
) -> None:
    # model_copy skips validation: this test is about headers, not the deployed-config checks.
    settings = make_settings().model_copy(
        update={"environment": environment, "database_url": PRODUCTION_DB}
    )
    app = create_app(settings)

    async with client_for(app) as client:
        not_found = await client.get("/nothing-here")
        docs = await client.get("/docs")
        openapi = await client.get("/openapi.json")

    assert not_found.headers["Strict-Transport-Security"].startswith("max-age=")
    assert docs.status_code == 404
    assert openapi.status_code == 404


async def test_request_id_generated_and_returned(client: AsyncClient) -> None:
    response = await client.get("/health")

    uuid.UUID(response.headers[REQUEST_ID_HEADER])


async def test_valid_incoming_request_id_is_propagated(client: AsyncClient) -> None:
    response = await client.get("/health", headers={REQUEST_ID_HEADER: "abc-123-from-proxy"})

    assert response.headers[REQUEST_ID_HEADER] == "abc-123-from-proxy"


async def test_malformed_incoming_request_id_is_replaced(client: AsyncClient) -> None:
    response = await client.get("/health", headers={REQUEST_ID_HEADER: "bad id\nforged-log"})

    uuid.UUID(response.headers[REQUEST_ID_HEADER])


async def test_unknown_route_uses_error_envelope(client: AsyncClient) -> None:
    response = await client.get("/nothing-here")

    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "NOT_FOUND"
    assert body["error"]["request_id"] == response.headers[REQUEST_ID_HEADER]


async def test_unhandled_exception_returns_generic_500_with_correlation_id(
    app: FastAPI, client_for: ClientFactory
) -> None:
    _add_failing_routes(app)

    async with client_for(app) as client:
        response = await client.get("/test/boom")

    assert response.status_code == 500
    assert response.json()["error"] == {
        "code": "INTERNAL_ERROR",
        "request_id": response.headers[REQUEST_ID_HEADER],
    }
    assert SECRET_IN_EXCEPTION not in response.text
    assert "Traceback" not in response.text
    assert response.headers["X-Content-Type-Options"] == "nosniff"


async def test_validation_error_does_not_echo_input(
    app: FastAPI, client_for: ClientFactory
) -> None:
    _add_failing_routes(app)

    async with client_for(app) as client:
        response = await client.post(
            "/test/echo", json={"password": SECRET_IN_BODY, "age": "not-a-number"}
        )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["fields"] == [{"loc": ["body", "age"], "type": "int_parsing"}]
    assert SECRET_IN_BODY not in response.text


async def test_cross_site_post_is_rejected(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/logout", headers={"Origin": "https://evil.example"})

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ORIGIN_MISMATCH"


@pytest.mark.parametrize("origin", ["http://localhost:3000", "http://testserver", None])
async def test_same_site_or_originless_post_is_allowed(
    client: AsyncClient, origin: str | None
) -> None:
    headers = {"Origin": origin} if origin else {}

    response = await client.post("/api/v1/auth/logout", headers=headers)

    assert response.status_code == 204
