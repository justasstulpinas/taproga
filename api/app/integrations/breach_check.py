import hashlib
import logging
from typing import Protocol

import httpx

logger = logging.getLogger(__name__)

HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/{prefix}"
HIBP_TIMEOUT_SECONDS = 3.0
SHA1_PREFIX_LENGTH = 5


class BreachChecker(Protocol):
    async def is_breached(self, password: str) -> bool: ...


class HibpBreachChecker:
    """HaveIBeenPwned k-anonymity check: only a 5-char SHA-1 prefix leaves the server."""

    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http

    async def is_breached(self, password: str) -> bool:
        digest = hashlib.sha1(password.encode(), usedforsecurity=False).hexdigest().upper()
        prefix, suffix = digest[:SHA1_PREFIX_LENGTH], digest[SHA1_PREFIX_LENGTH:]
        try:
            response = await self._http.get(
                HIBP_RANGE_URL.format(prefix=prefix),
                headers={"Add-Padding": "true"},
                timeout=HIBP_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
        except httpx.HTTPError:
            # Fail open: an HIBP outage must not block every signup. Length rules still apply.
            logger.warning("breach_check_unavailable", exc_info=True)
            return False

        for line in response.text.splitlines():
            candidate, _, count = line.partition(":")
            if candidate == suffix and count.strip() != "0":
                return True
        return False


class DisabledBreachChecker:
    async def is_breached(self, password: str) -> bool:
        return False
