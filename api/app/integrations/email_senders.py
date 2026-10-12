import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage as MimeMessage
from email.utils import formatdate, make_msgid, parseaddr
from typing import Protocol

import aiosmtplib
import certifi

from app.settings import EmailBackend, Settings, SmtpSecurity

# Long enough for a slow mail server, short enough that one stuck send doesn't stall the worker.
SMTP_TIMEOUT_SECONDS = 30


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str
    html: str


class EmailSender(Protocol):
    async def send(self, message: EmailMessage, sender: str) -> None: ...


class ConsoleEmailSender:
    """Local development: prints the plain-text body so links are clickable in the terminal."""

    async def send(self, message: EmailMessage, sender: str) -> None:
        print(
            f"\n=== EMAIL from {sender} to {message.to}\nSubject: {message.subject}\n\n"
            f"{message.text}\n=== END EMAIL\n",
            flush=True,
        )


@dataclass
class MemoryEmailSender:
    sent: list[EmailMessage] = field(default_factory=list)

    async def send(self, message: EmailMessage, sender: str) -> None:
        self.sent.append(message)


def smtp_tls_context() -> ssl.SSLContext:
    """Full verification against certifi's CA list rather than the OS store: some Python builds
    (python.org's macOS installer) ship with no CA list at all, which fails every TLS handshake."""
    return ssl.create_default_context(cafile=certifi.where())


@dataclass(frozen=True)
class SmtpEmailSender:
    """Delivers through a real mailbox. Raises on any failure so the email worker retries."""

    host: str
    port: int
    username: str
    password: str = field(repr=False)
    security: SmtpSecurity

    async def send(self, message: EmailMessage, sender: str) -> None:
        await aiosmtplib.send(
            _mime(message, sender),
            hostname=self.host,
            port=self.port,
            username=self.username,
            password=self.password,
            use_tls=self.security is SmtpSecurity.SSL,
            start_tls=self.security is SmtpSecurity.STARTTLS,
            tls_context=smtp_tls_context(),
            timeout=SMTP_TIMEOUT_SECONDS,
        )


def _mime(message: EmailMessage, sender: str) -> MimeMessage:
    """Plain text first, HTML as the alternative; Message-ID on the sender's domain helps
    spam filters tie the message to the domain's SPF/DKIM records."""
    domain = parseaddr(sender)[1].rpartition("@")[2]
    mime = MimeMessage()
    mime["From"] = sender
    mime["To"] = message.to
    mime["Subject"] = message.subject
    mime["Date"] = formatdate(localtime=False)
    mime["Message-ID"] = make_msgid(domain=domain or None)
    mime.set_content(message.text)
    mime.add_alternative(message.html, subtype="html")
    return mime


def build_email_sender(settings: Settings) -> EmailSender:
    match settings.email_backend:
        case EmailBackend.CONSOLE:
            return ConsoleEmailSender()
        case EmailBackend.MEMORY:
            return MemoryEmailSender()
        case EmailBackend.SMTP:
            host, username, password = (
                settings.smtp_host,
                settings.smtp_username,
                settings.smtp_password,
            )
            # Settings validation already requires these; this narrows the types for mypy.
            if host is None or username is None or password is None:
                raise ValueError(
                    "EMAIL_BACKEND=smtp requires SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD"
                )
            return SmtpEmailSender(
                host=host,
                port=settings.smtp_port,
                username=username,
                password=password.get_secret_value(),
                security=settings.smtp_security,
            )
