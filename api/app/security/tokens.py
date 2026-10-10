import hashlib
import hmac
import secrets

TOKEN_BYTES = 32


def generate_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def hash_token(token: str) -> str:
    # Tokens carry 256 bits of randomness, so a fast unsalted hash is sufficient here.
    return hashlib.sha256(token.encode()).hexdigest()


class SubjectHasher:
    """Keyed hash for rate-limit subjects (IPs, emails) so the throttle table holds no raw PII."""

    def __init__(self, key: bytes) -> None:
        self._key = key

    def hash(self, namespace: str, value: str) -> str:
        return hmac.new(self._key, f"{namespace}:{value}".encode(), hashlib.sha256).hexdigest()
