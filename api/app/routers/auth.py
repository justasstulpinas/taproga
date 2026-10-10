from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.dependencies import (
    AppSettings,
    Authenticated,
    Meta,
    SessionContext,
    get_auth_service,
    get_optional_session_context,
)
from app.models.user import AccountType
from app.policies.access import is_mfa_pending
from app.routers.cookies import clear_session_cookie, set_session_cookie
from app.schemas.auth import (
    AcceptedOut,
    ChangePasswordIn,
    EmailIn,
    ForgotPasswordIn,
    LoginIn,
    LoginOut,
    MfaIn,
    RegisterIn,
    ResetPasswordIn,
    TokenIn,
)
from app.schemas.users import MeOut
from app.services.auth import AuthService
from app.services.context import AuthContext

router = APIRouter(prefix="/auth", tags=["auth"])

Auth = Annotated[AuthService, Depends(get_auth_service)]


@router.post("/register", status_code=status.HTTP_202_ACCEPTED)
async def register(body: RegisterIn, auth: Auth, meta: Meta) -> AcceptedOut:
    await auth.register(
        email=body.email,
        password=body.password,
        account_type=AccountType(body.account_type),
        locale=body.locale,
        business_name=body.business_name,
        human_token=body.turnstile_token,
        meta=meta,
    )
    return AcceptedOut()


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
async def verify_email(body: TokenIn, auth: Auth, meta: Meta) -> None:
    await auth.verify_email(body.token, meta)


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
async def resend_verification(body: EmailIn, auth: Auth, meta: Meta) -> AcceptedOut:
    await auth.resend_verification(body.email, meta)
    return AcceptedOut()


@router.post("/login")
async def login(
    body: LoginIn, auth: Auth, meta: Meta, response: Response, settings: AppSettings
) -> LoginOut:
    result = await auth.login(body.email, body.password, meta)
    set_session_cookie(response, settings, result.issued)
    user = await auth.load_profiles(result.user)
    return LoginOut(
        mfa_required=result.mfa_required,
        user=MeOut.build(user, mfa_pending=result.mfa_required),
    )


@router.post("/mfa")
async def verify_mfa(
    body: MfaIn,
    ctx: SessionContext,
    auth: Auth,
    meta: Meta,
    response: Response,
    settings: AppSettings,
) -> MeOut:
    issued = await auth.verify_mfa(ctx, body.code, meta)
    set_session_cookie(response, settings, issued)
    user = await auth.load_profiles(ctx.user)
    return MeOut.build(user, mfa_pending=False)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    auth: Auth,
    meta: Meta,
    response: Response,
    settings: AppSettings,
    ctx: Annotated[AuthContext | None, Depends(get_optional_session_context)],
) -> None:
    # Idempotent: always clears the cookie, even if the session had already expired.
    if ctx is not None:
        await auth.logout(ctx, meta)
    clear_session_cookie(response, settings)


@router.get("/me")
async def me(ctx: SessionContext, auth: Auth) -> MeOut:
    user = await auth.load_profiles(ctx.user)
    return MeOut.build(user, mfa_pending=is_mfa_pending(ctx))


@router.post("/password/forgot", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(body: ForgotPasswordIn, auth: Auth, meta: Meta) -> AcceptedOut:
    await auth.forgot_password(body.email, body.turnstile_token, meta)
    return AcceptedOut()


@router.post("/password/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    body: ResetPasswordIn, auth: Auth, meta: Meta, response: Response, settings: AppSettings
) -> None:
    await auth.reset_password(body.token, body.new_password, meta)
    # Every session was revoked; drop this browser's cookie too so the next page shows login.
    clear_session_cookie(response, settings)


@router.post("/password/change", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordIn,
    ctx: Authenticated,
    auth: Auth,
    meta: Meta,
    response: Response,
    settings: AppSettings,
) -> None:
    issued = await auth.change_password(ctx, body.current_password, body.new_password, meta)
    set_session_cookie(response, settings, issued)
