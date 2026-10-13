import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.emails.templates import EmailTemplate
from app.models import AuditEntry, OutboxEmail, OutboxStatus
from app.models.audit import ActorKind
from app.models.user import Locale
from app.models.vaises import (
    Availability,
    ContactKind,
    RequestKind,
    RequestStatus,
    Service,
    VaisesRequest,
)
from app.security.encryption import FieldEncryptor
from tests.conftest import (
    HUMAN_TOKEN,
    TEST_ENCRYPTION_KEY,
    SessionMaker,
    admin_login,
    create_superadmin,
    login,
    register_and_verify,
)

REQUESTS = "/api/v1/admin/vaises/requests"
CONTACT = "jonas@pavyzdys.lt"
MESSAGE = "Vakarienė 80 svečių.\nSu desertu."
BASE_TIME = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)
EVENT_DAY = date(2026, 11, 14)


async def seed_request(
    sessionmaker: SessionMaker, *, minutes: int = 0, kind: RequestKind = RequestKind.DATE_INQUIRY
) -> uuid.UUID:
    is_inquiry = kind is RequestKind.DATE_INQUIRY
    async with sessionmaker() as session:
        request = VaisesRequest(
            public_id=uuid.uuid4(),
            kind=kind,
            event_date=EVENT_DAY if is_inquiry else None,
            service=Service.RENGINIAI if is_inquiry else None,
            availability_at_submit=Availability.AVAILABLE if is_inquiry else None,
            contact_kind=ContactKind.EMAIL,
            contact_encrypted=FieldEncryptor(TEST_ENCRYPTION_KEY).encrypt(CONTACT),
            contact_hash="a" * 64,
            message_encrypted=(
                FieldEncryptor(TEST_ENCRYPTION_KEY).encrypt(MESSAGE) if is_inquiry else None
            ),
            locale=Locale.LT,
            idempotency_key=uuid.uuid4(),
            created_at=BASE_TIME + timedelta(minutes=minutes),
        )
        session.add(request)
        await session.commit()
        return request.public_id


async def login_admin(client: AsyncClient, sessionmaker: SessionMaker) -> None:
    await admin_login(client, await create_superadmin(sessionmaker))


async def audit_entries(sessionmaker: SessionMaker) -> list[AuditEntry]:
    async with sessionmaker() as session:
        query = select(AuditEntry).where(AuditEntry.action.like("vaises.%")).order_by(AuditEntry.id)
        return list((await session.execute(query)).scalars())


def ids(response_json: dict[str, Any]) -> list[str]:
    return [item["id"] for item in response_json["items"]]


async def test_list_new_newest_first_with_cursor(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    oldest = await seed_request(sessionmaker, minutes=0)
    middle = await seed_request(sessionmaker, minutes=1)
    newest = await seed_request(sessionmaker, minutes=2)
    await login_admin(client, sessionmaker)

    first = await client.get(REQUESTS, params={"status": "new", "limit": 2})

    assert first.status_code == 200, first.text
    assert ids(first.json()) == [str(newest), str(middle)]
    assert first.json()["next_cursor"] is not None
    second = await client.get(
        REQUESTS,
        params={"status": "new", "limit": 2, "cursor": first.json()["next_cursor"]},
    )
    assert ids(second.json()) == [str(oldest)]
    assert second.json()["next_cursor"] is None


async def test_item_shape_and_decrypted_contact(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    public_id = await seed_request(sessionmaker)
    await login_admin(client, sessionmaker)

    response = await client.get(f"{REQUESTS}/{public_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(public_id)
    assert body["contact"] == CONTACT
    assert body["contact_kind"] == "email"
    assert body["event_date"] == "2026-11-14"
    assert body["event_date_label"] == "2026 m. lapkričio 14 d."
    assert body["status"] == "new"
    assert body["handled_at"] is None
    assert body["anonymised_at"] is None
    assert body["service"] == "renginiai"
    assert body["message"] == MESSAGE


async def test_list_includes_service_and_message(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    await seed_request(sessionmaker, minutes=0, kind=RequestKind.CONSULTATION)
    await seed_request(sessionmaker, minutes=1)
    await login_admin(client, sessionmaker)

    items = (await client.get(REQUESTS)).json()["items"]

    assert [(item["service"], item["message"]) for item in items] == [
        ("renginiai", MESSAGE),
        (None, None),
    ]


async def test_limit_default_and_max(client: AsyncClient, sessionmaker: SessionMaker) -> None:
    for minute in range(26):
        await seed_request(sessionmaker, minutes=minute)
    await login_admin(client, sessionmaker)

    default = await client.get(REQUESTS)
    too_many = await client.get(REQUESTS, params={"limit": 101})

    assert default.status_code == 200
    assert len(default.json()["items"]) == 25
    assert default.json()["next_cursor"] is not None
    assert too_many.status_code == 422


async def test_handled_moves_between_tabs_and_is_idempotent(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    public_id = await seed_request(sessionmaker)
    await login_admin(client, sessionmaker)

    first = await client.post(f"{REQUESTS}/{public_id}/handled")
    second = await client.post(f"{REQUESTS}/{public_id}/handled")

    assert first.status_code == second.status_code == 200
    assert first.json()["status"] == "handled"
    assert first.json()["handled_at"] is not None
    assert second.json() == first.json()
    new_tab = await client.get(REQUESTS, params={"status": "new"})
    handled_tab = await client.get(REQUESTS, params={"status": "handled"})
    assert ids(new_tab.json()) == []
    assert ids(handled_tab.json()) == [str(public_id)]
    (entry,) = await audit_entries(sessionmaker)
    assert entry.action == "vaises.request_handled"
    assert entry.actor_kind is ActorKind.SUPERADMIN
    assert entry.target_type == "vaises_request"
    assert entry.target_public_id == public_id
    assert entry.before == {"status": "new"}
    assert entry.after == {"status": "handled"}
    async with sessionmaker() as session:
        row = (await session.execute(select(VaisesRequest))).scalar_one()
    assert row.handled_by_user_id == entry.actor_user_id


async def test_reopen(client: AsyncClient, sessionmaker: SessionMaker) -> None:
    public_id = await seed_request(sessionmaker)
    await login_admin(client, sessionmaker)
    untouched = await client.post(f"{REQUESTS}/{public_id}/reopen")
    assert untouched.json()["status"] == "new"
    assert await audit_entries(sessionmaker) == []
    await client.post(f"{REQUESTS}/{public_id}/handled")

    response = await client.post(f"{REQUESTS}/{public_id}/reopen")

    assert response.status_code == 200
    assert response.json()["status"] == "new"
    assert response.json()["handled_at"] is None
    async with sessionmaker() as session:
        row = (await session.execute(select(VaisesRequest))).scalar_one()
    assert row.status is RequestStatus.NEW
    assert row.handled_by_user_id is None
    _, reopened = await audit_entries(sessionmaker)
    assert reopened.action == "vaises.request_reopened"
    assert reopened.before == {"status": "handled"}
    assert reopened.after == {"status": "new"}


async def test_erase_removes_contact_and_audits_without_it(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    public_id = await seed_request(sessionmaker)
    await login_admin(client, sessionmaker)

    response = await client.post(f"{REQUESTS}/{public_id}/erase")
    again = await client.post(f"{REQUESTS}/{public_id}/erase")

    assert response.status_code == again.status_code == 200
    assert response.json()["contact"] is None
    assert response.json()["contact_kind"] is None
    assert response.json()["message"] is None
    assert response.json()["service"] == "renginiai"
    assert response.json()["anonymised_at"] is not None
    assert again.json() == response.json()
    fetched = await client.get(f"{REQUESTS}/{public_id}")
    assert fetched.json()["contact"] is None
    async with sessionmaker() as session:
        row = (await session.execute(select(VaisesRequest))).scalar_one()
    assert row.contact_encrypted is None
    assert row.contact_hash is None
    assert row.message_encrypted is None
    (entry,) = await audit_entries(sessionmaker)
    assert entry.action == "vaises.request_erased"
    assert entry.target_public_id == public_id
    assert entry.before == {"anonymised": False}
    assert entry.after == {"anonymised": True}
    assert CONTACT not in str([entry.before, entry.after, entry.context])
    assert MESSAGE not in str([entry.before, entry.after, entry.context])


async def test_erase_withdraws_the_pending_receipt(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    other = "petras@pavyzdys.lt"
    for contact in (CONTACT, other):
        body = {
            "contact": contact,
            "locale": "lt",
            "idempotency_key": str(uuid.uuid4()),
            "turnstile_token": HUMAN_TOKEN,
        }
        response = await client.post("/api/v1/vaises/consultation-requests", json=body)
        assert response.status_code == 202, response.text
    async with sessionmaker() as session:
        query = select(VaisesRequest.public_id).order_by(VaisesRequest.id).limit(1)
        public_id = (await session.execute(query)).scalar_one()
        owner_before = [
            (e.id, e.payload)
            for e in (await session.execute(select(OutboxEmail))).scalars()
            if e.template == EmailTemplate.VAISES_OWNER_NOTIFICATION
        ]
    await login_admin(client, sessionmaker)

    assert (await client.post(f"{REQUESTS}/{public_id}/erase")).status_code == 200

    async with sessionmaker() as session:
        outbox = list((await session.execute(select(OutboxEmail))).scalars())
    receipts = [e.to_address for e in outbox if e.template.startswith("vaises_receipt")]
    assert receipts == [other]
    owner_after = [
        (e.id, e.payload) for e in outbox if e.template == EmailTemplate.VAISES_OWNER_NOTIFICATION
    ]
    assert owner_after == owner_before
    assert len(owner_after) == 2
    assert all(e.status is OutboxStatus.PENDING for e in outbox)


async def test_unknown_or_soft_deleted_id_is_404(
    client: AsyncClient, sessionmaker: SessionMaker
) -> None:
    deleted = await seed_request(sessionmaker)
    async with sessionmaker() as session:
        row = (await session.execute(select(VaisesRequest))).scalar_one()
        row.deleted_at = BASE_TIME
        await session.commit()
    await login_admin(client, sessionmaker)

    for public_id in (uuid.uuid4(), deleted):
        assert (await client.get(f"{REQUESTS}/{public_id}")).status_code == 404
        for action in ("handled", "reopen", "erase"):
            response = await client.post(f"{REQUESTS}/{public_id}/{action}")
            assert response.status_code == 404
    listed = await client.get(REQUESTS)
    assert ids(listed.json()) == []
    assert await audit_entries(sessionmaker) == []


@pytest.mark.parametrize(
    ("method", "action"),
    [
        ("GET", ""),
        ("GET", "/{id}"),
        ("POST", "/{id}/handled"),
        ("POST", "/{id}/reopen"),
        ("POST", "/{id}/erase"),
    ],
)
async def test_rejects_anonymous(client: AsyncClient, method: str, action: str) -> None:
    response = await client.request(method, REQUESTS + action.format(id=uuid.uuid4()))

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.parametrize("account_type", ["newlywed", "service"])
async def test_regular_user_gets_403_on_every_request_route(
    client: AsyncClient, sessionmaker: SessionMaker, account_type: str
) -> None:
    public_id = await seed_request(sessionmaker)
    extra = {"business_name": "Studija"} if account_type == "service" else {}
    await register_and_verify(
        client, sessionmaker, "ona@example.lt", account_type=account_type, **extra
    )
    await login(client, "ona@example.lt")
    routes = [
        ("GET", REQUESTS),
        ("GET", f"{REQUESTS}/{public_id}"),
        ("POST", f"{REQUESTS}/{public_id}/handled"),
        ("POST", f"{REQUESTS}/{public_id}/reopen"),
        ("POST", f"{REQUESTS}/{public_id}/erase"),
    ]

    for method, path in routes:
        response = await client.request(method, path)
        assert response.status_code == 403, (method, path)
        assert response.json()["error"]["code"] == "FORBIDDEN"
