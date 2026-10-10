from app.domain_errors import EmailNotVerified, Forbidden
from app.models.user import AccountType
from app.services.context import AuthContext


def ensure_fully_authenticated(ctx: AuthContext) -> None:
    if not ctx.user.is_email_verified:
        raise EmailNotVerified


def ensure_superadmin(ctx: AuthContext) -> None:
    ensure_fully_authenticated(ctx)
    if ctx.user.account_type is not AccountType.SUPERADMIN:
        raise Forbidden
