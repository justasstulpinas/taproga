from datetime import UTC, datetime

import pyotp

TOTP_ISSUER = "Ta Proga"
TOTP_INTERVAL_SECONDS = 30
# Accept one step either side for clock drift.
TOTP_VALID_WINDOW = 1


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=TOTP_ISSUER)


def matching_totp_step(secret: str, code: str, at: datetime) -> int | None:
    """Returns the time-step the code belongs to, or None if it is invalid at `at`."""
    totp = pyotp.TOTP(secret)
    current_step = int(at.timestamp()) // TOTP_INTERVAL_SECONDS
    for offset in range(-TOTP_VALID_WINDOW, TOTP_VALID_WINDOW + 1):
        step = current_step + offset
        step_time = datetime.fromtimestamp(step * TOTP_INTERVAL_SECONDS, tz=UTC)
        if totp.verify(code, for_time=step_time, valid_window=0):
            return step
    return None
