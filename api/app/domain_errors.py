from app.error_codes import ErrorCode


class DomainError(Exception):
    """Raised by services. Carries a stable code; `app.errors` maps it to an HTTP status."""

    code: ErrorCode = ErrorCode.BAD_REQUEST

    def __init__(self) -> None:
        super().__init__(self.code)


class NotAuthenticated(DomainError):
    code = ErrorCode.UNAUTHENTICATED


class Forbidden(DomainError):
    code = ErrorCode.FORBIDDEN


class NotFound(DomainError):
    code = ErrorCode.NOT_FOUND


class InvalidCredentials(DomainError):
    code = ErrorCode.INVALID_CREDENTIALS


class EmailNotVerified(DomainError):
    code = ErrorCode.EMAIL_NOT_VERIFIED


class TokenInvalid(DomainError):
    code = ErrorCode.TOKEN_INVALID_OR_EXPIRED


class PasswordBreached(DomainError):
    code = ErrorCode.PASSWORD_BREACHED


class HumanVerificationFailed(DomainError):
    code = ErrorCode.HUMAN_VERIFICATION_FAILED


class InvalidDate(DomainError):
    code = ErrorCode.INVALID_DATE


class RateLimited(DomainError):
    code = ErrorCode.RATE_LIMITED

    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__()
        self.retry_after_seconds = retry_after_seconds
