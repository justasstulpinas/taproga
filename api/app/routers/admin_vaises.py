import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response, status

from app.dependencies import Meta, Superadmin, Vaises, require_superadmin
from app.models.vaises import RequestStatus, VaisesRequest
from app.routers.common import PageParams
from app.schemas.common import PageOut
from app.schemas.vaises import BlockDateIn, BlockedDateOut, IsoDate, VaisesRequestOut
from app.services.vaises import VaisesService
from app.services.vaises_dates import format_date_lt

router = APIRouter(
    prefix="/admin/vaises", tags=["admin-vaises"], dependencies=[Depends(require_superadmin)]
)


@router.get("/blocked-dates")
async def list_blocked_dates(
    from_: Annotated[IsoDate, Query(alias="from")],
    to: Annotated[IsoDate, Query()],
    service: Vaises,
) -> list[BlockedDateOut]:
    blocked = await service.list_blocked(from_, to)
    return [BlockedDateOut(date=item.date, created_at=item.created_at) for item in blocked]


@router.post("/blocked-dates")
async def block_date(
    body: BlockDateIn, service: Vaises, ctx: Superadmin, meta: Meta
) -> BlockedDateOut:
    blocked = await service.block(ctx, body.date, meta)
    return BlockedDateOut(date=blocked.date, created_at=blocked.created_at)


@router.delete("/blocked-dates/{value}", status_code=status.HTTP_204_NO_CONTENT)
async def unblock_date(
    value: Annotated[IsoDate, Path()], service: Vaises, ctx: Superadmin, meta: Meta
) -> Response:
    await service.unblock(ctx, value, meta)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _request_out(service: VaisesService, request: VaisesRequest) -> VaisesRequestOut:
    return VaisesRequestOut(
        id=request.public_id,
        kind=request.kind,
        event_date=request.event_date,
        event_date_label=None if request.event_date is None else format_date_lt(request.event_date),
        service=request.service,
        message=service.reveal_message(request),
        availability_at_submit=request.availability_at_submit,
        contact_kind=request.contact_kind,
        contact=service.reveal_contact(request),
        status=request.status,
        created_at=request.created_at,
        handled_at=request.handled_at,
        anonymised_at=request.anonymised_at,
    )


@router.get("/requests")
async def list_requests(
    service: Vaises, page: PageParams, status: RequestStatus = RequestStatus.NEW
) -> PageOut[VaisesRequestOut]:
    result = await service.list_requests(status, page)
    return PageOut(
        items=[_request_out(service, item) for item in result.items],
        next_cursor=result.next_cursor.encode() if result.next_cursor else None,
    )


@router.get("/requests/{public_id}")
async def get_request(public_id: uuid.UUID, service: Vaises) -> VaisesRequestOut:
    return _request_out(service, await service.get_request(public_id))


@router.post("/requests/{public_id}/handled")
async def mark_handled(
    public_id: uuid.UUID, service: Vaises, ctx: Superadmin, meta: Meta
) -> VaisesRequestOut:
    return _request_out(service, await service.mark_handled(ctx, public_id, meta))


@router.post("/requests/{public_id}/reopen")
async def reopen_request(
    public_id: uuid.UUID, service: Vaises, ctx: Superadmin, meta: Meta
) -> VaisesRequestOut:
    return _request_out(service, await service.reopen(ctx, public_id, meta))


@router.post("/requests/{public_id}/erase")
async def erase_request(
    public_id: uuid.UUID, service: Vaises, ctx: Superadmin, meta: Meta
) -> VaisesRequestOut:
    return _request_out(service, await service.erase(ctx, public_id, meta))
