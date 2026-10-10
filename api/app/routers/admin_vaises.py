from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response, status

from app.dependencies import Meta, Superadmin, Vaises, require_superadmin
from app.schemas.vaises import BlockDateIn, BlockedDateOut, IsoDate

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
