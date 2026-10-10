import logging
import uuid
from collections.abc import Callable
from datetime import date

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain_errors import HumanVerificationFailed
from app.emails.templates import EmailTemplate
from app.integrations.human_verification import HumanVerifier
from app.models.user import Locale
from app.models.vaises import Availability, ContactKind, RequestKind, VaisesRequest
from app.repositories.vaises import VaisesRepository
from app.schemas.vaises import ConsultationIn, Contact, DateInquiryIn
from app.security.encryption import FieldEncryptor
from app.security.tokens import SubjectHasher
from app.services.audit import AuditService
from app.services.context import RequestMeta
from app.services.email_queue import EmailQueue, LinkBuilder
from app.services.throttle import Rules, SubjectKind, Throttle
from app.services.vaises_dates import ensure_bookable, format_date_lt

logger = logging.getLogger(__name__)

UNKNOWN_IP = "unknown"
ADMIN_REQUESTS_PATH = "/admin/vaises/uzklausos"

# The owner notification is always Lithuanian, so its labels are too.
KIND_LABELS_LT = {
    RequestKind.DATE_INQUIRY: "Datos užklausa",
    RequestKind.CONSULTATION: "Konsultacijos užklausa",
}
AVAILABILITY_LABELS_LT = {
    Availability.AVAILABLE: "laisva",
    Availability.RESERVED: "rezervuota",
}


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
        links: LinkBuilder,
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
        self._links = links
        self._notify_email = notify_email
        self._today = today

    async def availability(self, value: date, meta: RequestMeta) -> Availability:
        await self._throttle.hit(Rules.VAISES_AVAILABILITY_IP, meta.ip or UNKNOWN_IP)
        ensure_bookable(value, self._today())
        return await self._availability_on(value)

    async def submit_date_inquiry(self, body: DateInquiryIn, meta: RequestMeta) -> None:
        ensure_bookable(body.date, self._today())
        await self._submit(RequestKind.DATE_INQUIRY, body, body.date, meta)

    async def submit_consultation(self, body: ConsultationIn, meta: RequestMeta) -> None:
        await self._submit(RequestKind.CONSULTATION, body, None, meta)

    async def _availability_on(self, value: date) -> Availability:
        if await self._repository.is_blocked(value):
            return Availability.RESERVED
        return Availability.AVAILABLE

    async def _submit(
        self,
        kind: RequestKind,
        body: ConsultationIn,
        event_date: date | None,
        meta: RequestMeta,
    ) -> None:
        """Every outcome after validation answers 202, so the response reveals nothing."""
        ip = meta.ip or UNKNOWN_IP
        contact = body.contact
        await self._throttle.check(Rules.VAISES_SUBMIT_IP, ip)
        await self._throttle.check(Rules.VAISES_SUBMIT_RECIPIENT, contact.value)
        if not await self._human_verifier.verify(body.turnstile_token, meta.ip):
            raise HumanVerificationFailed
        if await self._repository.idempotency_key_exists(body.idempotency_key):
            return

        request = VaisesRequest(
            # Set now rather than at flush: the owner email links to it before the commit.
            public_id=uuid.uuid4(),
            kind=kind,
            event_date=event_date,
            availability_at_submit=(
                None if event_date is None else await self._availability_on(event_date)
            ),
            contact_kind=contact.kind,
            contact_encrypted=self._encryptor.encrypt(contact.value),
            contact_hash=self._hasher.hash(SubjectKind.CONTACT, contact.value),
            locale=body.locale,
            idempotency_key=body.idempotency_key,
        )
        self._repository.add_request(request)
        self._queue_owner_notification(request, contact)
        if contact.kind is ContactKind.EMAIL:
            self._queue_receipt(request, contact)
        try:
            await self._session.commit()
        except IntegrityError:
            # A concurrent twin with the same key won the insert; its emails are already queued.
            await self._session.rollback()
            if await self._repository.idempotency_key_exists(body.idempotency_key):
                return
            raise

        # Throttle.record commits on its own, so it must not run inside the request's transaction.
        await self._throttle.record(Rules.VAISES_SUBMIT_IP, ip)
        await self._throttle.record(Rules.VAISES_SUBMIT_RECIPIENT, contact.value)
        logger.info("vaises_request_submitted", extra={"request_public_id": str(request.public_id)})

    def _queue_owner_notification(self, request: VaisesRequest, contact: Contact) -> None:
        if self._notify_email is None:
            # Settings require it in staging/production; locally the request is still stored.
            logger.warning(
                "vaises_notify_email_unset", extra={"request_public_id": str(request.public_id)}
            )
            return
        availability = request.availability_at_submit
        self._email_queue.enqueue(
            EmailTemplate.VAISES_OWNER_NOTIFICATION,
            Locale.LT,
            self._notify_email,
            {
                "kind_label": KIND_LABELS_LT[request.kind],
                "date_label": _date_label(request.event_date),
                "availability_label": ""
                if availability is None
                else AVAILABILITY_LABELS_LT[availability],
                "contact": contact.value,
                "admin_url": self._links.page(f"{ADMIN_REQUESTS_PATH}?id={request.public_id}"),
            },
        )

    def _queue_receipt(self, request: VaisesRequest, contact: Contact) -> None:
        if request.event_date is None:
            template, payload = EmailTemplate.VAISES_RECEIPT_CONSULTATION, {}
        else:
            template = EmailTemplate.VAISES_RECEIPT_DATE
            payload = {"date_label": format_date_lt(request.event_date)}
        self._email_queue.enqueue(template, request.locale, contact.value, payload)


def _date_label(value: date | None) -> str:
    return "" if value is None else format_date_lt(value)
