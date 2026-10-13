from urllib.parse import urlsplit

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

from app.error_codes import ErrorCode
from app.errors import error_response

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def origin_of(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


class OriginCheckMiddleware:
    """CSRF defence in depth on top of SameSite=Lax cookies.

    Browsers always send Origin on cross-site state-changing requests; if it's present it must be
    the app itself or this API's own origin. Requests without Origin (server-to-server SSR calls,
    CLI tools) carry no ambient browser cookies from another site, so they pass.
    """

    def __init__(self, app: ASGIApp, *, app_origin: str) -> None:
        self.app = app
        self.app_origin = origin_of(app_origin)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] in SAFE_METHODS:
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        origin = headers.get("origin")
        own_origin = f"{scope['scheme']}://{headers.get('host', '')}"
        if origin is not None and origin not in {self.app_origin, own_origin}:
            request_id = scope.get("state", {}).get("request_id")
            response = error_response(403, ErrorCode.ORIGIN_MISMATCH, request_id)
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
