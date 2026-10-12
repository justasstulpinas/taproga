import pytest
from pydantic import ValidationError

from app.settings import SMTP_SSL_PORT, EmailBackend, Environment, SmtpSecurity
from tests.conftest import make_settings

POSTGRES_URL = "postgresql+asyncpg://user:pass@db.invalid/taproga"


def _deployed(environment: Environment, **overrides: object) -> dict[str, object]:
    values: dict[str, object] = {
        "environment": environment,
        "database_url": POSTGRES_URL,
        "turnstile_secret_key": "turnstile-secret",
        "public_app_url": "https://taproga.com",
    }
    values.update(overrides)
    return values


@pytest.mark.parametrize("environment", [Environment.STAGING, Environment.PRODUCTION])
def test_deployed_environments_reject_sqlite(environment: Environment) -> None:
    with pytest.raises(ValidationError, match=r"postgresql\+asyncpg"):
        make_settings(**_deployed(environment, database_url="sqlite+aiosqlite:///local.db"))


@pytest.mark.parametrize("environment", [Environment.STAGING, Environment.PRODUCTION])
def test_deployed_environments_require_turnstile(environment: Environment) -> None:
    with pytest.raises(ValidationError, match="TURNSTILE_SECRET_KEY"):
        make_settings(**_deployed(environment, turnstile_secret_key=None))


@pytest.mark.parametrize("backend", [EmailBackend.CONSOLE, EmailBackend.MEMORY])
def test_deployed_environments_refuse_fake_email_backends(backend: EmailBackend) -> None:
    with pytest.raises(ValidationError, match="EMAIL_BACKEND"):
        make_settings(**_deployed(Environment.PRODUCTION, email_backend=backend))


@pytest.mark.parametrize("environment", [Environment.STAGING, Environment.PRODUCTION])
def test_deployed_environments_require_vaises_notify_email(environment: Environment) -> None:
    with pytest.raises(ValidationError, match="VAISES_NOTIFY_EMAIL"):
        make_settings(**_deployed(environment, vaises_notify_email=None))


def test_deployed_environments_require_https_app_url() -> None:
    with pytest.raises(ValidationError, match="https"):
        make_settings(
            **_deployed(Environment.PRODUCTION, public_app_url="http://taproga.com"),
            email_backend=EmailBackend.CONSOLE,
        )


SMTP_VALUES: dict[str, object] = {
    "email_backend": EmailBackend.SMTP,
    "smtp_host": "smtp.hostinger.com",
    "smtp_username": "vaises@taproga.com",
    "smtp_password": "mailbox-app-password",
}


@pytest.mark.parametrize("missing", ["smtp_host", "smtp_username", "smtp_password"])
def test_smtp_backend_requires_its_connection_settings(missing: str) -> None:
    with pytest.raises(ValidationError, match=missing.upper()):
        make_settings(**{**SMTP_VALUES, missing: None})


def test_deployed_environment_accepts_smtp_over_ssl() -> None:
    settings = make_settings(
        **_deployed(Environment.PRODUCTION, vaises_notify_email="owner@taproga.com", **SMTP_VALUES)
    )

    assert settings.smtp_security is SmtpSecurity.SSL
    assert settings.smtp_port == SMTP_SSL_PORT


def test_deployed_environment_refuses_unencrypted_smtp() -> None:
    with pytest.raises(ValidationError, match="SMTP_SECURITY"):
        make_settings(
            **_deployed(
                Environment.PRODUCTION,
                vaises_notify_email="owner@taproga.com",
                smtp_security=SmtpSecurity.NONE,
                **SMTP_VALUES,
            )
        )


def test_local_environment_allows_sqlite_and_insecure_cookies() -> None:
    settings = make_settings(environment=Environment.LOCAL)

    assert settings.docs_enabled
    assert not settings.is_deployed
    assert not settings.cookie_secure
    assert settings.session_cookie_name == "tp_session"
