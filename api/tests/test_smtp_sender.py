import asyncio
import warnings
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from email import message_from_bytes, policy
from email.message import EmailMessage as MimeMessage
from typing import Any

import pytest
from aiosmtpd.smtp import SMTP, AuthResult, LoginPassword
from aiosmtplib import SMTPAuthenticationError

from app.integrations.email_senders import (
    EmailMessage,
    SmtpEmailSender,
    build_email_sender,
)
from app.settings import EmailBackend, SmtpSecurity
from tests.conftest import make_settings

USERNAME = "vaises@taproga.com"
PASSWORD = "mailbox-app-password"
SENDER = "Vaises <vaises@taproga.com>"


@dataclass
class CapturingHandler:
    received: list[tuple[str, list[str], MimeMessage]] = field(default_factory=list)

    async def handle_DATA(self, server: Any, session: Any, envelope: Any) -> str:  # noqa: N802 - aiosmtpd hook name
        parsed = message_from_bytes(envelope.original_content, policy=policy.default)
        assert isinstance(parsed, MimeMessage)
        self.received.append((envelope.mail_from, list(envelope.rcpt_tos), parsed))
        return "250 OK"


def _authenticator(
    server: Any, session: Any, envelope: Any, mechanism: str, auth_data: Any
) -> AuthResult:
    valid = (
        isinstance(auth_data, LoginPassword)
        and auth_data.login.decode() == USERNAME
        and auth_data.password.decode() == PASSWORD
    )
    return AuthResult(success=valid, handled=False)


def _smtp_protocol(handler: CapturingHandler) -> SMTP:
    # Plaintext AUTH is deliberate here: a loopback test server. aiosmtpd warns about it.
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore", message="Requiring AUTH while not requiring TLS", category=UserWarning
        )
        return SMTP(
            handler, authenticator=_authenticator, auth_required=True, auth_require_tls=False
        )


@pytest.fixture
async def smtp_server() -> AsyncIterator[tuple[CapturingHandler, int]]:
    """A real SMTP server on the test's own event loop, so it shuts down cleanly with it."""
    handler = CapturingHandler()
    server = await asyncio.get_running_loop().create_server(
        lambda: _smtp_protocol(handler), "127.0.0.1", 0
    )
    port: int = server.sockets[0].getsockname()[1]
    try:
        yield handler, port
    finally:
        server.close()
        await server.wait_closed()


def _sender(port: int, password: str = PASSWORD) -> SmtpEmailSender:
    return SmtpEmailSender(
        host="127.0.0.1",
        port=port,
        username=USERNAME,
        password=password,
        security=SmtpSecurity.NONE,
    )


MESSAGE = EmailMessage(
    to="jonas@pavyzdys.lt",
    subject="Nauja užklausa: 2026 m. lapkričio 14 d.",
    text="Datos užklausa — 2026 m. lapkričio 14 d. (laisva)\nKontaktas: jonas@pavyzdys.lt",
    html="<p>Datos užklausa — <strong>2026 m. lapkričio 14 d.</strong></p>",
)


async def test_sends_authenticated_multipart_message(
    smtp_server: tuple[CapturingHandler, int],
) -> None:
    handler, port = smtp_server

    await _sender(port).send(MESSAGE, SENDER)

    [(mail_from, rcpt_tos, received)] = handler.received
    assert mail_from == USERNAME
    assert rcpt_tos == ["jonas@pavyzdys.lt"]
    assert received["From"] == SENDER
    assert received["To"] == "jonas@pavyzdys.lt"
    assert received["Subject"] == "Nauja užklausa: 2026 m. lapkričio 14 d."
    assert received["Message-ID"].endswith("@taproga.com>")
    assert received["Date"]
    text = received.get_body(preferencelist=("plain",))
    html = received.get_body(preferencelist=("html",))
    assert text is not None
    assert html is not None
    assert "Kontaktas: jonas@pavyzdys.lt" in text.get_content()
    assert "<strong>2026 m. lapkričio 14 d.</strong>" in html.get_content()


async def test_wrong_password_raises_so_the_worker_retries(
    smtp_server: tuple[CapturingHandler, int],
) -> None:
    handler, port = smtp_server

    with pytest.raises(SMTPAuthenticationError):
        await _sender(port, password="wrong-password").send(MESSAGE, SENDER)

    assert handler.received == []


def test_build_email_sender_returns_smtp_sender_for_smtp_backend() -> None:
    settings = make_settings(
        email_backend=EmailBackend.SMTP,
        smtp_host="smtp.hostinger.com",
        smtp_username=USERNAME,
        smtp_password=PASSWORD,
    )

    assert isinstance(build_email_sender(settings), SmtpEmailSender)
