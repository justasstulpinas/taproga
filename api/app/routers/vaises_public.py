from fastapi import APIRouter

from app.dependencies import Meta, Vaises
from app.schemas.vaises import AvailabilityOut, IsoDate

router = APIRouter(prefix="/vaises", tags=["vaises"])


@router.get("/availability", response_model=AvailabilityOut)
async def availability(date: IsoDate, service: Vaises, meta: Meta) -> AvailabilityOut:
    return AvailabilityOut(date=date, availability=await service.availability(date, meta))
