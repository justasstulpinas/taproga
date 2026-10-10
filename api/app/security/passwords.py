from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

PASSWORD_MIN_LENGTH = 12
# Upper bound keeps a single hash from becoming a CPU denial-of-service vector.
PASSWORD_MAX_LENGTH = 128

_hasher = PasswordHasher()  # argon2id with the library's current recommended parameters

# Verified against when the account doesn't exist, so response time doesn't reveal existence.
_DUMMY_HASH = _hasher.hash("timing-equalisation-placeholder")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def _matches(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def verify_password(password_hash: str | None, password: str) -> bool:
    """Pass None for unknown accounts: the hash work still happens, the result is always False."""
    if password_hash is None:
        _matches(_DUMMY_HASH, password)
        return False
    return _matches(password_hash, password)


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)
