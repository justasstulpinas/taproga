import logging
import uuid
from collections.abc import Callable
from datetime import date, datetime
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.domain_errors import HumanVerificationFailed, InvalidDate, NotFound
from app.emails.templates import VAISES_RECEIPTS, EmailTemplate
from app.integrations.human_verification import HumanVerifier
from app.models.audit import ActorKind
from app.models.user import Locale
from app.models.vaises import (
    ANONYMISED_COLUMNS,
    SERVICE_LABELS_LT,
    Availability,
    BlockedDate,
    ContactKind,
    RequestKind,
    RequestStatus,
    Service,
    VaisesRequest,
)
from app.pagination import Page, PageRequest
from app.repositories.vaises import VaisesRepository
from app.schemas.vaises import ConsultationIn, Contact, DateInquiryIn
from app.security.encryption import FieldEncryptor
from app.security.tokens import SubjectHasher
from app.services.audit import Actor, AuditAction, AuditService, AuditTarget
from app.services.context import AuthContext, RequestMeta
from app.services.email_queue import EmailQueue, LinkBuilder
from app.services.throttle import Rules, SubjectKind, Throttle
from app.services.vaises_dates import ensure_bookable, format_date_lt

logger = logging.getLogger(__name__)

UNKNOWN_IP = "unknown"
ADMIN_REQUESTS_PATH = "/admin/vaises/uzklausos"
BLOCKED_RANGE_MAX_DAYS = 400

# The owner notification is always Lithuanian, so its labels are too.
KIND_LABELS_LT = {
    RequestKind.DATE_INQUIRY: "Datos užklausa",
    RequestKind.CONSULTATION: "Konsultacijos užklausa",
}
AVAILABILITY_LABELS_LT = {
    Availability.AVAILABLE: "laisva",
    Availability.RESERVED: "rezervuota",
}


def anonymise(request: VaisesRequest, now: datetime) -> None:
    for column in ANONYMISED_COLUMNS:
        setattr(request, column, None)
    request.anonymised_at = now


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
        await self._submit(
            RequestKind.DATE_INQUIRY,
            body,
            body.date,
            meta,
            service=body.service,
            message=body.message,
        )

    async def submit_consultation(self, body: ConsultationIn, meta: RequestMeta) -> None:
        await self._submit(RequestKind.CONSULTATION, body, None, meta)

    async def list_blocked(self, from_: date, to: date) -> list[BlockedDate]:
        if to < from_ or (to - from_).days > BLOCKED_RANGE_MAX_DAYS:
            raise InvalidDate
        return await self._repository.list_blocked(from_, to)

    async def block(self, ctx: AuthContext, value: date, meta: RequestMeta) -> BlockedDate:
        ensure_bookable(value, self._today())
        existing = await self._repository.get_blocked(value)
        if existing is not None:
            return existing
        # Read before the commit: a rollback expires the context's user.
        admin_id = ctx.user.id
        blocked = BlockedDate(public_id=uuid.uuid4(), date=value, created_by_user_id=admin_id)
        self._repository.add_blocked(blocked)
        self._audit.record(
            actor=Actor(kind=ActorKind.SUPERADMIN, user_id=admin_id),
            action=AuditAction.VAISES_DATE_BLOCKED,
            meta=meta,
            target_type=AuditTarget.VAISES_BLOCKED_DATE,
            target_public_id=blocked.public_id,
            after={"date": value.isoformat()},
        )
        try:
            await self._session.commit()
        except IntegrityError:
            # A concurrent twin blocked the same date first; it wrote the audit entry.
            await self._session.rollback()
            twin = await self._repository.get_blocked(value)
            if twin is None:
                raise
            return twin
        return blocked

    async def unblock(self, ctx: AuthContext, value: date, meta: RequestMeta) -> None:
        blocked = await self._repository.get_blocked(value)
        if blocked is None:
            return
        self._audit.record(
            actor=Actor(kind=ActorKind.SUPERADMIN, user_id=ctx.user.id),
            action=AuditAction.VAISES_DATE_UNBLOCKED,
            meta=meta,
            target_type=AuditTarget.VAISES_BLOCKED_DATE,
            target_public_id=blocked.public_id,
            before={"date": value.isoformat()},
        )
        await self._repository.delete_blocked(blocked)
        await self._session.commit()

    async def list_requests(self, status: RequestStatus, page: PageRequest) -> Page[VaisesRequest]:
        return await self._repository.list_requests(status, page)

    async def get_request(self, public_id: uuid.UUID) -> VaisesRequest:
        return await self._get_request(public_id)

    def reveal_contact(self, request: VaisesRequest) -> str | None:
        if request.contact_encrypted is None:
            return None
        return self._encryptor.decrypt(request.contact_encrypted)

    def reveal_message(self, request: VaisesRequest) -> str | None:
        if request.message_encrypted is None:
            return None
        return self._encryptor.decrypt(request.message_encrypted)

    async def mark_handled(
        self, ctx: AuthContext, public_id: uuid.UUID, meta: RequestMeta
    ) -> VaisesRequest:
        request = await self._get_request(public_id)
        if request.status is RequestStatus.HANDLED:
            return request
        # Read before the commit: expiry on commit would otherwise reload the context's user.
        admin_id = ctx.user.id
        request.status = RequestStatus.HANDLED
        request.handled_at = utcnow()
        request.handled_by_user_id = admin_id
        self._audit_request(
            AuditAction.VAISES_REQUEST_HANDLED,
            admin_id,
            request,
            meta,
            before={"status": RequestStatus.NEW.value},
            after={"status": RequestStatus.HANDLED.value},
        )
        await self._session.commit()
        return request

    async def reopen(
        self, ctx: AuthContext, public_id: uuid.UUID, meta: RequestMeta
    ) -> VaisesRequest:
        request = await self._get_request(public_id)
        if request.status is RequestStatus.NEW:
            return request
        admin_id = ctx.user.id
        request.status = RequestStatus.NEW
        request.handled_at = None
        request.handled_by_user_id = None
        self._audit_request(
            AuditAction.VAISES_REQUEST_REOPENED,
            admin_id,
            request,
            meta,
            before={"status": RequestStatus.HANDLED.value},
            after={"status": RequestStatus.NEW.value},
        )
        await self._session.commit()
        return request

    async def erase(
        self, ctx: AuthContext, public_id: uuid.UUID, meta: RequestMeta
    ) -> VaisesRequest:
        request = await self._get_request(public_id)
        if request.anonymised_at is not None:
            return request
        admin_id = ctx.user.id
        contact = self.reveal_contact(request)
        if contact is not None and request.contact_kind is ContactKind.EMAIL:
            # A receipt the worker hasn't sent yet would deliver to the erased address.
            await self._email_queue.withdraw_pending(VAISES_RECEIPTS, contact)
        anonymise(request, utcnow())
        self._audit_request(
            AuditAction.VAISES_REQUEST_ERASED,
            admin_id,
            request,
            meta,
            before={"anonymised": False},
            after={"anonymised": True},
        )
        await self._session.commit()
        return request

    async def _get_request(self, public_id: uuid.UUID) -> VaisesRequest:
        request = await self._repository.get_request(public_id)
        if request is None:
            raise NotFound
        return request

    def _audit_request(
        self,
        action: AuditAction,
        admin_id: int,
        request: VaisesRequest,
        meta: RequestMeta,
        *,
        before: dict[str, Any],
        after: dict[str, Any],
    ) -> None:
        self._audit.record(
            actor=Actor(kind=ActorKind.SUPERADMIN, user_id=admin_id),
            action=action,
            meta=meta,
            target_type=AuditTarget.VAISES_REQUEST,
            target_public_id=request.public_id,
            before=before,
            after=after,
        )

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
        *,
        service: Service | None = None,
        message: str | None = None,
    ) -> None:
        """Every outcome after validation answers 202, so the response reveals nothing."""
        ip = meta.ip or UNKNOWN_IP
        contact = body.contact
        await self._throttle.hit(Rules.VAISES_SUBMIT_ATTEMPT_IP, ip)
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
            service=service,
            availability_at_submit=(
                None if event_date is None else await self._availability_on(event_date)
            ),
            contact_kind=contact.kind,
            contact_encrypted=self._encryptor.encrypt(contact.value),
            contact_hash=self._hasher.hash(SubjectKind.CONTACT, contact.value),
            message_encrypted=None if message is None else self._encryptor.encrypt(message),
            locale=body.locale,
            idempotency_key=body.idempotency_key,
        )
        self._repository.add_request(request)
        self._queue_owner_notification(request, contact, message)
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

    def _queue_owner_notification(
        self, request: VaisesRequest, contact: Contact, message: str | None
    ) -> None:
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
                "service_label": ""
                if request.service is None
                else SERVICE_LABELS_LT[request.service],
                "date_label": _date_label(request.event_date),
                "availability_label": ""
                if availability is None
                else AVAILABILITY_LABELS_LT[availability],
                "contact": contact.value,
                "message": message or "",
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
