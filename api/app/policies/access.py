from app.domain_errors import EmailNotVerified, Forbidden, MfaRequired
from app.models.user import AccountType
from app.services.context import AuthContext


def is_mfa_pending(ctx: AuthContext) -> bool:
    return ctx.user.account_type is AccountType.SUPERADMIN and ctx.session.mfa_verified_at is None


def ensure_fully_authenticated(ctx: AuthContext) -> None:
    """A superadmin who hasn't passed 2FA yet may only complete 2FA, read /me, or log out."""
    if not ctx.user.is_email_verified:
        raise EmailNotVerified
    if is_mfa_pending(ctx):
        raise MfaRequired


def ensure_superadmin(ctx: AuthContext) -> None:
    ensure_fully_authenticated(ctx)
    if ctx.user.account_type is not AccountType.SUPERADMIN:
        raise Forbidden
