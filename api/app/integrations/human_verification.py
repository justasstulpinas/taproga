import logging
from typing import Protocol

import httpx

logger = logging.getLogger(__name__)

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TURNSTILE_TIMEOUT_SECONDS = 5.0


class HumanVerifier(Protocol):
    async def verify(self, token: str | None, ip: str | None) -> bool: ...


class TurnstileVerifier:
    def __init__(self, http: httpx.AsyncClient, secret_key: str) -> None:
        self._http = http
        self._secret_key = secret_key

    async def verify(self, token: str | None, ip: str | None) -> bool:
        if not token:
            return False
        data = {"secret": self._secret_key, "response": token}
        if ip:
            data["remoteip"] = ip
        try:
            response = await self._http.post(
                TURNSTILE_VERIFY_URL, data=data, timeout=TURNSTILE_TIMEOUT_SECONDS
            )
            response.raise_for_status()
        except httpx.HTTPError:
            # Fail closed: bot protection that silently switches off is worse than a retry.
            logger.error("turnstile_unavailable", exc_info=True)
            return False
        return bool(response.json().get("success"))


class AllowAllHumanVerifier:
    """Local/test only; settings validation prevents this in staging/production."""

    async def verify(self, token: str | None, ip: str | None) -> bool:
        return True
