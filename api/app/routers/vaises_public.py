from fastapi import APIRouter, status

from app.dependencies import Meta, Vaises
from app.schemas.auth import AcceptedOut
from app.schemas.vaises import AvailabilityOut, ConsultationIn, DateInquiryIn, IsoDate

router = APIRouter(prefix="/vaises", tags=["vaises"])


@router.get("/availability", response_model=AvailabilityOut)
async def availability(date: IsoDate, service: Vaises, meta: Meta) -> AvailabilityOut:
    return AvailabilityOut(date=date, availability=await service.availability(date, meta))


@router.post("/date-inquiries", status_code=status.HTTP_202_ACCEPTED)
async def submit_date_inquiry(body: DateInquiryIn, service: Vaises, meta: Meta) -> AcceptedOut:
    await service.submit_date_inquiry(body, meta)
    return AcceptedOut()


@router.post("/consultation-requests", status_code=status.HTTP_202_ACCEPTED)
async def submit_consultation(body: ConsultationIn, service: Vaises, meta: Meta) -> AcceptedOut:
    await service.submit_consultation(body, meta)
    return AcceptedOut()
