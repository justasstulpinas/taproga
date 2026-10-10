from dataclasses import dataclass

import httpx

from app.integrations.breach_check import BreachChecker, DisabledBreachChecker, HibpBreachChecker
from app.integrations.human_verification import (
    AllowAllHumanVerifier,
    HumanVerifier,
    TurnstileVerifier,
)
from app.settings import Settings


@dataclass(frozen=True)
class Integrations:
    breach_checker: BreachChecker
    human_verifier: HumanVerifier


def build_integrations(settings: Settings, http: httpx.AsyncClient) -> Integrations:
    breach_checker: BreachChecker = (
        HibpBreachChecker(http) if settings.breach_check_enabled else DisabledBreachChecker()
    )
    # Settings validation guarantees a secret in staging/production.
    human_verifier: HumanVerifier = (
        TurnstileVerifier(http, settings.turnstile_secret_key.get_secret_value())
        if settings.turnstile_secret_key is not None
        else AllowAllHumanVerifier()
    )
    return Integrations(breach_checker=breach_checker, human_verifier=human_verifier)
