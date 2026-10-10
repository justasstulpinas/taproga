# Ta Proga API

FastAPI backend replacing Supabase. The Next.js app (repo root) proxies `/api/v1/*` here.
Plan: [`docs/roadmap-fastapi-migration.md`](../docs/roadmap-fastapi-migration.md) · Decisions: [`docs/decisions.md`](../docs/decisions.md)

## Run locally

Requires [uv](https://docs.astral.sh/uv/). Postgres via Docker is recommended:

```bash
docker compose up -d postgres        # from repo root
cd api
cp .env.example .env
uv run python -m app.cli generate-key   # paste into ENCRYPTION_KEY in .env
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:create_app --factory --reload --port 8000
uv run python -m app.jobs.email_worker  # second terminal: delivers queued emails
```

Then `http://localhost:8000/health` and API docs at `http://localhost:8000/docs` (local only).
With `EMAIL_BACKEND=console`, verification/reset emails (with their links) print in the worker's
terminal. Without Docker, set `DATABASE_URL=sqlite+aiosqlite:///./local.db` — local only;
staging/production refuse to start on SQLite.

The Next.js app reads `API_ORIGIN` (default `http://localhost:8000`) for the `/api/v1` rewrite.

### Superadmin

Superadmins can't self-register. Create one from the CLI; it prints an `otpauth://` URI to add to
an authenticator app (2FA is mandatory for superadmins):

```bash
uv run python -m app.cli create-superadmin --email you@taproga.com
```

## Deployment notes

- Run uvicorn with `--proxy-headers --forwarded-allow-ips=<proxy IPs>` so rate limiting sees the
  real client IP rather than the proxy's.
- Run at least one `app.jobs.email_worker` process alongside the API; several are safe (rows are
  claimed with `SELECT … FOR UPDATE SKIP LOCKED`). Dead-lettered emails log at `ERROR`.
- Run `uv run python -m app.jobs.vaises_retention` once a day (cron or the host's scheduler). It
  runs once and exits, anonymising contact details of requests handled more than 730 days ago.

## Environment variables

See [`.env.example`](.env.example) — every key is documented there.

## Checks (same as CI)

```bash
uv run ruff check . && uv run ruff format --check .
uv run mypy
uv run pytest                        # SQLite per test by default; warnings are errors
TEST_DATABASE_URL=postgresql+asyncpg://taproga:taproga@localhost:5432/taproga uv run pytest
uv run pip-audit
```

## Layout

| Folder | Responsibility |
| --- | --- |
| `app/routers/` | HTTP only: parse, delegate, return. No queries, no business logic. |
| `app/services/` | Business logic and transactions. No HTTP concepts. |
| `app/repositories/` | All queries. Soft-delete filtering lives here. |
| `app/policies/` | Authorization decisions. |
| `app/schemas/` | Pydantic input/output models, always separate. |
| `app/models/` | SQLAlchemy ORM. |
| `app/integrations/` | External services (Turnstile, HaveIBeenPwned, email senders) behind small protocols. |
| `app/security/` | Password hashing, tokens, field encryption, TOTP. |
| `app/emails/` | Transactional email copy (lt/en), HTML + plain text. |
| `app/jobs/` | Background workers. |
| `app/middleware/` | Request ID + access log, error boundary, origin check, security headers. |
| `migrations/` | Alembic. Append-only once applied anywhere shared; every migration reversible. |

## Conventions

- Errors are returned as `{"error": {"code": "...", "request_id": "..."}}`. Codes live in
  `app/error_codes.py`; the frontend translates them (no user-facing copy in the API).
  Services raise `app.domain_errors` exceptions; `app/errors.py` maps them to HTTP statuses.
- Every response carries `X-Request-ID`; users can quote it to support, and it's in every log line.
- Logs are JSON; sensitive keys are redacted in the formatter (`app/logging_config.py`).
- Every superadmin mutation writes an audit entry with the superadmin as actor.
- New migrations: `uv run alembic revision --autogenerate -m "..."`, then review and hand-edit:
  migrations must not import `app` code, and non-native enums autogenerate duplicate CHECKs.

## Auth API (`/api/v1/auth`)

| Endpoint | Notes |
| --- | --- |
| `POST /register` | 202 regardless of whether the email exists. Turnstile + breach check. |
| `POST /verify-email` | Body `{token}` from the `#token=` fragment of the emailed link. |
| `POST /resend-verification` | 202 always. |
| `POST /login` | Sets the session cookie. Superadmins get `mfa_required: true`. |
| `POST /mfa` | Superadmin TOTP; rotates the session. |
| `POST /logout` | Revokes the session server-side. Idempotent. |
| `GET /me` | Current user + profile. |
| `POST /password/forgot` | 202 always. Turnstile. |
| `POST /password/reset` | Revokes every session. |
| `POST /password/change` | Revokes other sessions, re-issues this one. |

Superadmin API (`/api/v1/admin`, requires completed 2FA): `GET /users` (search, cursor
pagination), `GET /users/{id}`, `POST /users/{id}/verify-email`, `POST /users/{id}/password-reset`,
`POST /users/{id}/unlock`, `GET /audit-log`.
