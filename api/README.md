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

Superadmins can't self-register. Create one from the CLI (it prompts for the password); they then
sign in with email and password at `/admin/login`:

```bash
uv run python -m app.cli create-superadmin --email you@taproga.com
```

## Deployment notes

- Client IPs. Rate limiting keys on the client IP, and the browser reaches the API only through
  the Next.js `/api/v1` rewrite, which does **not** add `X-Forwarded-For`. So:
  - an edge proxy (load balancer / CDN / nginx) in front of Next must set `X-Forwarded-For` to the
    visitor's IP, and Next forwards it on the rewrite;
  - uvicorn must run with
    `--proxy-headers --forwarded-allow-ips=<edge proxy IP>,<Next host IP>`.

  Without the edge proxy header every visitor arrives as the Next host and shares one rate-limit
  bucket (one busy hour locks everyone out). Trusting forwarded headers without an edge proxy that
  overwrites them is worse: clients can forge `X-Forwarded-For` and get a fresh bucket per request.
  Staging check after deploy: call `GET /api/v1/vaises/availability?date=<a bookable date>` from two
  different networks, then
  `SELECT subject, count(*) FROM throttle_events WHERE action = 'vaises_avail_ip' GROUP BY subject;`
  must show two different subjects.
- Migration `0002` drops superadmin TOTP. A superadmin session that was still waiting for its
  second factor would count as fully signed in afterwards, so when applying it to an environment
  with live sessions, revoke every superadmin session in the same deploy:
  `UPDATE user_sessions SET revoked_at = now() WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE account_type = 'superadmin');`
- Run at least one `app.jobs.email_worker` process alongside the API; several are safe (rows are
  claimed with `SELECT … FOR UPDATE SKIP LOCKED`). Dead-lettered emails log at `ERROR`.
- Run `uv run python -m app.jobs.vaises_retention` once a day (cron or the host's scheduler). It
  runs once and exits, anonymising contact details of requests handled more than 730 days ago.
- Email goes out through a real mailbox over SMTP (`EMAIL_BACKEND=smtp`). With Hostinger:
  `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_SECURITY=ssl`, the mailbox address as
  `SMTP_USERNAME` and `EMAIL_FROM` (e.g. `Vaises <vaises@taproga.com>`), and its password as
  `SMTP_PASSWORD` in the server's environment only. Before launch, confirm SPF and DKIM are active
  for the domain in Hostinger and add a DMARC record, or receipts will land in spam. Hostinger
  plans cap daily sending; that suits Vaises, but bulk invitations later need a dedicated
  email service (a settings change, since the sender is swappable).

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
| `app/security/` | Password hashing, tokens, field encryption. |
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
| `POST /login` | Sets the session cookie (superadmins included). |
| `POST /logout` | Revokes the session server-side. Idempotent. |
| `GET /me` | Current user + profile. |
| `POST /password/forgot` | 202 always. Turnstile. |
| `POST /password/reset` | Revokes every session. |
| `POST /password/change` | Revokes other sessions, re-issues this one. |

Superadmin API (`/api/v1/admin`, superadmin session required): `GET /users` (search, cursor
pagination), `GET /users/{id}`, `POST /users/{id}/verify-email`, `POST /users/{id}/password-reset`,
`POST /users/{id}/unlock`, `GET /audit-log`.

## Vaises

Public API (`/api/v1/vaises`, no session; Turnstile on submits; every submit outcome after
validation answers 202):

| Endpoint | Notes |
| --- | --- |
| `GET /availability?date=YYYY-MM-DD` | `available` or `reserved`. Date within today .. today + 3 years (Vilnius). 60/hour per IP. |
| `POST /date-inquiries` | `{date, contact, locale, idempotency_key, turnstile_token}`. |
| `POST /consultation-requests` | Same without `date`. |

Submits are limited to 30 attempts/hour per IP (failed ones included), 5 accepted/hour per IP and
3 accepted/day per contact. Each accepted request queues an owner notification to
`VAISES_NOTIFY_EMAIL` (required in staging/production) and, for email contacts, a receipt to the
visitor. The contact is stored encrypted; the receipt's address is scrubbed from the outbox once
delivery is settled.

Superadmin API (`/api/v1/admin/vaises`, superadmin session required; every mutation is audited):

| Endpoint | Notes |
| --- | --- |
| `GET /blocked-dates?from=&to=` | At most 400 days per call. |
| `POST /blocked-dates` | `{date, idempotency_key}`. Idempotent. |
| `DELETE /blocked-dates/{date}` | Idempotent. |
| `GET /requests?status=new\|handled` | Newest first, cursor pagination. |
| `GET /requests/{id}` | Includes the decrypted contact. |
| `POST /requests/{id}/handled` · `/reopen` | Idempotent. |
| `POST /requests/{id}/erase` | Anonymises the contact and withdraws its unsent receipt. |

Retention: run `uv run python -m app.jobs.vaises_retention` daily (see Deployment notes).
