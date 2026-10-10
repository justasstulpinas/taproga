from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from starlette.middleware import Middleware
from starlette.middleware.gzip import GZipMiddleware

from app.db import build_engine, build_sessionmaker
from app.dependencies import SecurityKit
from app.errors import register_exception_handlers
from app.integrations import Integrations, build_integrations
from app.logging_config import configure_logging
from app.middleware.error_boundary import ErrorBoundaryMiddleware
from app.middleware.origin_check import OriginCheckMiddleware
from app.middleware.request_id import RequestIdMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routers import admin, auth, health
from app.settings import Settings, get_settings

API_PREFIX = "/api/v1"
GZIP_MIN_BYTES = 1024


def create_app(
    settings: Settings | None = None, integrations: Integrations | None = None
) -> FastAPI:
    """`integrations` lets tests substitute fakes for Turnstile and the breach check."""
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = build_engine(settings)
        app.state.sessionmaker = build_sessionmaker(engine)
        async with httpx.AsyncClient() as http:
            app.state.integrations = integrations or build_integrations(settings, http)
            try:
                yield
            finally:
                await engine.dispose()

    # Listed outermost first: headers wrap everything, so even the error boundary's 500 gets them.
    middleware = [
        Middleware(
            SecurityHeadersMiddleware,
            hsts_max_age=settings.hsts_max_age_seconds if settings.is_deployed else None,
            docs_enabled=settings.docs_enabled,
        ),
        Middleware(RequestIdMiddleware),
        Middleware(ErrorBoundaryMiddleware),
        Middleware(OriginCheckMiddleware, app_origin=settings.public_app_url),
        Middleware(GZipMiddleware, minimum_size=GZIP_MIN_BYTES),
    ]

    app = FastAPI(
        title="Ta Proga API",
        lifespan=lifespan,
        middleware=middleware,
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
    )
    app.state.settings = settings
    app.state.security = SecurityKit.from_settings(settings)
    register_exception_handlers(app)

    # Health stays unprefixed: it's for the load balancer, not proxied through Next.js.
    app.include_router(health.router)
    app.include_router(auth.router, prefix=API_PREFIX)
    app.include_router(admin.router, prefix=API_PREFIX)

    return app
