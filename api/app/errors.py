from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.domain_errors import DomainError, RateLimited
from app.error_codes import ErrorCode

_CODE_BY_STATUS = {
    400: ErrorCode.BAD_REQUEST,
    401: ErrorCode.UNAUTHENTICATED,
    403: ErrorCode.FORBIDDEN,
    404: ErrorCode.NOT_FOUND,
    405: ErrorCode.METHOD_NOT_ALLOWED,
    429: ErrorCode.RATE_LIMITED,
    503: ErrorCode.SERVICE_UNAVAILABLE,
}

_STATUS_BY_DOMAIN_CODE = {
    ErrorCode.UNAUTHENTICATED: 401,
    ErrorCode.INVALID_CREDENTIALS: 401,
    ErrorCode.FORBIDDEN: 403,
    ErrorCode.EMAIL_NOT_VERIFIED: 403,
    ErrorCode.ORIGIN_MISMATCH: 403,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.TOKEN_INVALID_OR_EXPIRED: 400,
    ErrorCode.PASSWORD_BREACHED: 400,
    ErrorCode.HUMAN_VERIFICATION_FAILED: 400,
    ErrorCode.INVALID_DATE: 422,
    ErrorCode.RATE_LIMITED: 429,
}


# Custom Pydantic error types that surface as a dedicated code rather than VALIDATION_ERROR.
_CODE_BY_VALIDATION_TYPE = {"invalid_date": ErrorCode.INVALID_DATE}


def error_response(
    status_code: int,
    code: ErrorCode,
    request_id: str | None,
    extra: dict[str, Any] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {"code": code, "request_id": request_id}
    if extra:
        body.update(extra)
    return JSONResponse(status_code=status_code, content={"error": body})


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


async def _http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = (
        exc.detail
        if isinstance(exc.detail, ErrorCode)
        else _CODE_BY_STATUS.get(exc.status_code, ErrorCode.BAD_REQUEST)
    )
    response = error_response(exc.status_code, code, _request_id(request))
    if exc.headers:
        response.headers.update(exc.headers)
    return response


async def _validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    # Only location and error type: echoing the input back could leak passwords into logs/clients.
    errors = exc.errors()
    dedicated = [_CODE_BY_VALIDATION_TYPE.get(err["type"]) for err in errors]
    first = dedicated[0] if dedicated else None
    if first is not None and all(dedicated):
        return error_response(_STATUS_BY_DOMAIN_CODE[first], first, _request_id(request))
    fields = [{"loc": list(err["loc"]), "type": err["type"]} for err in errors]
    return error_response(
        422, ErrorCode.VALIDATION_ERROR, _request_id(request), extra={"fields": fields}
    )


async def _domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    response = error_response(
        _STATUS_BY_DOMAIN_CODE.get(exc.code, 400), exc.code, _request_id(request)
    )
    if isinstance(exc, RateLimited):
        response.headers["Retry-After"] = str(exc.retry_after_seconds)
    return response


def register_exception_handlers(app: FastAPI) -> None:
    # Starlette types handlers as taking plain Exception even though it dispatches by class.
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(DomainError, _domain_error_handler)  # type: ignore[arg-type]
