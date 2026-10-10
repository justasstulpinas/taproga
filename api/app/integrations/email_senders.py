from dataclasses import dataclass, field
from typing import Protocol

from app.settings import EmailBackend, Settings


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


def build_email_sender(settings: Settings) -> EmailSender:
    match settings.email_backend:
        case EmailBackend.CONSOLE:
            return ConsoleEmailSender()
        case EmailBackend.MEMORY:
            return MemoryEmailSender()
