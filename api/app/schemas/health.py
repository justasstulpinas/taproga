from typing import Literal

from pydantic import BaseModel

from app.services.health import DependencyStatus


class HealthChecksOut(BaseModel):
    database: DependencyStatus


class HealthOut(BaseModel):
    status: Literal["ok", "degraded"]
    checks: HealthChecksOut
