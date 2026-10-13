from collections.abc import Iterable
from urllib.parse import urlencode

from sqlalchemy.ext.asyncio import AsyncSession

from app.emails.templates import EmailTemplate
from app.models.email_outbox import OutboxEmail
from app.models.user import Locale
from app.repositories.email_outbox import OutboxRepository

# Frontend routes. Tokens go in the URL fragment: browsers never send it to servers,
# so it can't leak through access logs or Referer headers.
VERIFY_EMAIL_PATH = "/verify-email"
RESET_PASSWORD_PATH = "/reset-password"
FORGOT_PASSWORD_PATH = "/forgot-password"
LOGIN_PATH = "/login"


class LinkBuilder:
    def __init__(self, public_app_url: str) -> None:
        self._base = public_app_url.rstrip("/")

    def page(self, path: str) -> str:
        return f"{self._base}{path}"

    def with_token(self, path: str, token: str) -> str:
        return f"{self._base}{path}#{urlencode({'token': token})}"


class EmailQueue:
    def __init__(self, session: AsyncSession) -> None:
        self._repository = OutboxRepository(session)

    def enqueue(
        self, template: EmailTemplate, locale: Locale, to: str, payload: dict[str, str]
    ) -> None:
        """Joins the caller's transaction: no commit of the triggering change, no email."""
        self._repository.add(
            OutboxEmail(to_address=to, template=template, locale=locale, payload=payload)
        )

    async def withdraw_pending(self, templates: Iterable[EmailTemplate], to: str) -> None:
        """Drops not-yet-sent emails in the caller's transaction."""
        await self._repository.delete_pending(templates, to)
