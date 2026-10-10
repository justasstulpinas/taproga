from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.repositories.health import HealthRepository
from app.schemas.health import HealthChecksOut, HealthOut
from app.services.health import HealthService

router = APIRouter(tags=["health"])


def get_health_service(session: Annotated[AsyncSession, Depends(get_session)]) -> HealthService:
    return HealthService(HealthRepository(session))


@router.get("/health", response_model=HealthOut)
async def health(
    response: Response,
    service: Annotated[HealthService, Depends(get_health_service)],
) -> HealthOut:
    report = await service.check()
    if not report.healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthOut(
        status="ok" if report.healthy else "degraded",
        checks=HealthChecksOut(database=report.database),
    )
