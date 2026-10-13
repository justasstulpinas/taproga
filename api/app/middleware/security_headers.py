from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# The API only ever returns JSON, so the strictest possible policy applies.
API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
DOCS_PATHS = frozenset({"/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"})


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, *, hsts_max_age: int | None, docs_enabled: bool) -> None:
        self.app = app
        self.hsts_max_age = hsts_max_age
        self.docs_enabled = docs_enabled

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Swagger UI loads scripts from a CDN; docs only exist in local, so relax CSP there only.
        skip_csp = self.docs_enabled and scope["path"] in DOCS_PATHS

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["X-Content-Type-Options"] = "nosniff"
                headers["X-Frame-Options"] = "DENY"
                headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
                headers["Permissions-Policy"] = PERMISSIONS_POLICY
                headers["Cross-Origin-Opener-Policy"] = "same-origin"
                # Every API response is per-user; never let a shared cache or the proxy keep one.
                headers.setdefault("Cache-Control", "no-store")
                if not skip_csp:
                    headers["Content-Security-Policy"] = API_CSP
                if self.hsts_max_age is not None:
                    headers["Strict-Transport-Security"] = (
                        f"max-age={self.hsts_max_age}; includeSubDomains"
                    )
            await send(message)

        await self.app(scope, receive, send_with_headers)
