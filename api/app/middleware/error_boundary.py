import logging

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.error_codes import ErrorCode
from app.errors import error_response

logger = logging.getLogger("app.errors")


class ErrorBoundaryMiddleware:
    """Turns unhandled exceptions into a generic 500 inside our middleware stack.

    Starlette's own 500 handling sits outside all user middleware, so its response would
    miss the request-ID and security headers. Catching here keeps every response uniform.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def tracking_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, tracking_send)
        except Exception:
            logger.exception("unhandled_exception", extra={"path": scope["path"]})
            if response_started:
                raise
            request_id = scope.get("state", {}).get("request_id")
            response = error_response(500, ErrorCode.INTERNAL_ERROR, request_id)
            await response(scope, receive, send)
