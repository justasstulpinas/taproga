from collections.abc import Callable
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.human_verification import HumanVerifier
from app.models.vaises import Availability
from app.repositories.vaises import VaisesRepository
from app.security.encryption import FieldEncryptor
from app.security.tokens import SubjectHasher
from app.services.audit import AuditService
from app.services.context import RequestMeta
from app.services.email_queue import EmailQueue
from app.services.throttle import Rules, Throttle
from app.services.vaises_dates import ensure_bookable

UNKNOWN_IP = "unknown"


class VaisesService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        throttle: Throttle,
        encryptor: FieldEncryptor,
        hasher: SubjectHasher,
        human_verifier: HumanVerifier,
        email_queue: EmailQueue,
        audit: AuditService,
        notify_email: str | None,
        today: Callable[[], date],
    ) -> None:
        self._session = session
        self._repository = VaisesRepository(session)
        self._throttle = throttle
        self._encryptor = encryptor
        self._hasher = hasher
        self._human_verifier = human_verifier
        self._email_queue = email_queue
        self._audit = audit
        self._notify_email = notify_email
        self._today = today

    async def availability(self, value: date, meta: RequestMeta) -> Availability:
        await self._throttle.hit(Rules.VAISES_AVAILABILITY_IP, meta.ip or UNKNOWN_IP)
        ensure_bookable(value, self._today())
        if await self._repository.is_blocked(value):
            return Availability.RESERVED
        return Availability.AVAILABLE
