from enum import StrEnum
from functools import lru_cache
from typing import Literal, Self

from pydantic import EmailStr, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

POSTGRES_DRIVER_PREFIX = "postgresql+asyncpg://"
TWO_YEARS_SECONDS = 63_072_000


class Environment(StrEnum):
    LOCAL = "local"
    TEST = "test"
    STAGING = "staging"
    PRODUCTION = "production"


class EmailBackend(StrEnum):
    CONSOLE = "console"  # local: prints emails to stdout
    MEMORY = "memory"  # tests: captured in-process


# Backends that actually deliver mail. Empty until a provider is chosen, which deliberately
# blocks staging/production from booting with a fake sender.
DELIVERING_EMAIL_BACKENDS: frozenset[EmailBackend] = frozenset()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Environment = Environment.LOCAL
    database_url: str
    sql_echo: bool = False
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    hsts_max_age_seconds: int = TWO_YEARS_SECONDS

    # Origin of the Next.js app; used for email links and the CSRF origin check.
    public_app_url: str = "http://localhost:3000"
    # Fernet key: encrypts secrets at rest and keys HMACs. Generate one with:
    #   uv run python -m app.cli generate-key
    encryption_key: SecretStr
    turnstile_secret_key: SecretStr | None = None
    breach_check_enabled: bool = True
    email_backend: EmailBackend = EmailBackend.CONSOLE
    email_from: str = "Ta Proga <no-reply@taproga.com>"
    # Inbox that receives every Vaises date inquiry and consultation request.
    vaises_notify_email: EmailStr | None = None

    @property
    def is_deployed(self) -> bool:
        return self.environment in {Environment.STAGING, Environment.PRODUCTION}

    @property
    def docs_enabled(self) -> bool:
        return self.environment == Environment.LOCAL

    @property
    def cookie_secure(self) -> bool:
        return self.is_deployed

    @property
    def session_cookie_name(self) -> str:
        # __Host- prefix makes browsers enforce Secure, Path=/ and no Domain attribute.
        return "__Host-tp_session" if self.cookie_secure else "tp_session"

    @model_validator(mode="after")
    def _validate_deployed_requirements(self) -> Self:
        if not self.is_deployed:
            return self
        # SQLite silently differs on types and constraints; it must never reach a real environment.
        if not self.database_url.startswith(POSTGRES_DRIVER_PREFIX):
            raise ValueError(f"{self.environment} requires a {POSTGRES_DRIVER_PREFIX} DATABASE_URL")
        if self.turnstile_secret_key is None:
            raise ValueError(f"{self.environment} requires TURNSTILE_SECRET_KEY")
        if not self.public_app_url.startswith("https://"):
            raise ValueError(f"{self.environment} requires an https PUBLIC_APP_URL")
        if self.vaises_notify_email is None:
            raise ValueError(f"{self.environment} requires VAISES_NOTIFY_EMAIL")
        if self.email_backend not in DELIVERING_EMAIL_BACKENDS:
            raise ValueError(f"{self.environment} requires a delivering EMAIL_BACKEND")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
