from fastapi import Response

from app.services.sessions import IssuedSession
from app.settings import Settings


def set_session_cookie(response: Response, settings: Settings, issued: IssuedSession) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=issued.token,
        expires=issued.expires_at,
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )
