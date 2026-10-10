import logging
from dataclasses import dataclass
from enum import StrEnum

from sqlalchemy.exc import SQLAlchemyError

from app.repositories.health import HealthRepository

logger = logging.getLogger(__name__)


class DependencyStatus(StrEnum):
    OK = "ok"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class HealthReport:
    database: DependencyStatus

    @property
    def healthy(self) -> bool:
        return self.database is DependencyStatus.OK


class HealthService:
    def __init__(self, repository: HealthRepository) -> None:
        self._repository = repository

    async def check(self) -> HealthReport:
        try:
            await self._repository.ping_database()
        except (SQLAlchemyError, OSError):
            logger.warning("health_check_database_unavailable", exc_info=True)
            return HealthReport(database=DependencyStatus.UNAVAILABLE)
        return HealthReport(database=DependencyStatus.OK)
