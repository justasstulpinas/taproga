# Architectural Decisions

Append-only. Never edit a past entry — supersede it with a new one that references it.
Status: **Confirmed** (product owner agreed) · **Proposed** (default in use, awaiting confirmation).

---

## 2026-09-29 — Platform pivot (from roadmap planning session) — Confirmed
- Full backend migration Supabase → FastAPI. No data migration; clean rebuild.
- Existing Next.js frontend is reused; visual design and layout unchanged.
- Two profile types (Newlywed, Service) on a shared `User`.
- Services connect through one per-event link and self-declare their service type; superadmin can connect manually.
- Services are free; revenue is Newlywed plans: planning / e-invite + planning / full (adds media).
- Superadmin in v1: site content, service account fixes, manual connections, plan management.
- Seating is in v1 (reverses the earlier v2 deferral). Direct messaging is cut.
- Media: two pools (photographer album with consent-gated cross-sharing; guest pool with own-delete + newlywed moderation). A 6-digit code is the access boundary, not the URL slug. Guest media tags come from the wedding-day schedule.
- Rejected: separate user tables per type (splits auth); in-app messaging (contact details suffice).

## 2026-09-29 — Backend lives in `api/` in this repo — Confirmed
- Monorepo; Next.js stays at the root to avoid churn. `api/` is a uv project with a committed `uv.lock`.
- Alembic folder is named `migrations/` so it can't shadow the `alembic` package.

## 2026-09-29 — Frontend reaches the API via a same-origin Next.js rewrite — Proposed
- `next.config.ts` rewrites `/api/v1/*` → `API_ORIGIN`. Browser calls stay same-origin, so auth cookies are first-party (`HttpOnly; Secure; SameSite=Lax`) and no CORS is configured.
- The rewrite runs after filesystem routes, so legacy `pages/api/*` handlers keep working during migration.
- Large uploads will go directly to object storage via presigned URLs, not through the proxy.
- Rejected: separate `api.` subdomain with CORS (more cookie/CORS surface for no benefit).
- Depends on hosting (open question Q11 in the roadmap).

## 2026-09-29 — API errors are codes, not messages — Confirmed
- Envelope `{"error": {"code", "request_id", ...}}`. The frontend owns all copy through its translation layer.
- Validation errors return only field location and error type, never the submitted value.

## 2026-09-29 — Unhandled exceptions are caught inside the middleware stack — Confirmed
- Starlette's built-in 500 handler sits outside user middleware, so its responses would lack `X-Request-ID` and security headers. `ErrorBoundaryMiddleware` produces the 500 instead.

## 2026-09-29 — Postgres only for deployed environments — Confirmed
- Settings refuse to start staging/production on a non-`postgresql+asyncpg` URL.
- Tests default to in-memory SQLite for speed; CI runs them against Postgres 17 via `TEST_DATABASE_URL`.

## 2026-09-29 — Local infrastructure added per phase — Confirmed
- `docker-compose.yml` has only Postgres for now. Redis (rate limiting, jobs), MinIO (S3) and Mailpit (email) get added in the phase that first needs them.

## 2026-09-29 — Open product questions use recommended defaults until answered — Proposed
The defaults in roadmap §9 (service approval required, per-event plans, one profile type per account, co-owner login, guest pool not visible to services, seating visible to caterer/organizer/venue only, magic-link login dropped) are assumptions. Phase 1 depends on Q4, Q5 and Q10; they must be confirmed before Phase 1 models are migrated anywhere shared.

## 2026-09-29 — Answers to roadmap §9 Q4, Q5, Q10 and email provider — Confirmed
- **Q4:** one account type per account (Newlywed or Service), chosen at registration. Superadmin is a third type, created only via CLI.
- **Q5:** partners can both log in; the owner invites the partner as co-owner. Implemented with events in Phase 2.
- **Q10:** magic-link login dropped. Password + email verification + reset only.
- **Email provider:** deferred. Code sends through an `EmailSender` protocol; staging/production refuse to boot until a delivering backend is added.

## 2026-09-29 — Server-side sessions instead of JWT access/refresh tokens — Confirmed
- Cookie holds a random 256-bit token; the DB stores its SHA-256. Logout, password change/reset and idle expiry revoke immediately — a stateless JWT would keep working until expiry, contradicting "a logged-out token must actually stop working".
- Replaces the standards' "short-lived access token, rotating refresh token" wording: the token is rotated on login, on 2FA completion and on password change (session fixation), and sessions have idle + absolute timeouts (users 7d/30d, superadmins 30min/12h).
- Cookie: `HttpOnly; SameSite=Lax; Path=/`, plus `Secure` and the `__Host-` prefix when deployed. An Origin check on state-changing requests adds CSRF defence in depth.
- Rejected: JWT + refresh rotation (more moving parts, weaker revocation, no benefit for a single first-party frontend).

## 2026-09-29 — Rate limiting and email queue live in Postgres, not Redis — Confirmed
- `throttle_events` backs per-IP and per-account limits with escalating (doubling, capped) lockouts. Account subjects are HMACs of the email, so unknown emails behave identically and the table holds no raw PII.
- `email_outbox` is a transactional outbox: rows commit with the change that caused them; `app.jobs.email_worker` delivers with exponential retry and dead-letters after 8 attempts. One-time links in `payload` are cleared after send or dead-letter.
- Why: no Redis dependency yet, and both need durability anyway. Revisit if request volume makes these tables hot.
- Follow-up: a cleanup job for old `throttle_events`, revoked/expired `user_sessions` and used `auth_tokens`.

## 2026-09-29 — Auth hardening choices — Confirmed
- Emailed tokens go in the URL fragment (`/verify-email#token=…`), which browsers never send to servers, so they don't leak via logs or Referer.
- HaveIBeenPwned check fails **open** (an outage must not block signups); Turnstile fails **closed** (bot protection must not silently switch off).
- Registration, resend and forgot-password return the same 202 whether or not the email exists. Sign-up against an existing email emails its owner instead (throttled).
- Unknown-email logins still run an Argon2 verification so timing doesn't reveal account existence.
- Superadmin TOTP secrets are Fernet-encrypted with `ENCRYPTION_KEY`; each accepted TOTP step is recorded to block replay.

## 2026-09-29 — PII at rest — Proposed
- `users.email` is plaintext: it's the login lookup key and has a unique constraint. Encrypting it needs a blind index; not worth it yet given disk-level encryption at the database host.
- Profile phone numbers are not written by any endpoint yet. Proposal: encrypt them with `FieldEncryptor` when profile editing lands (Phase 3).
- `audit_log.actor_user_id` references `users.id`, so user rows can't be hard-deleted. GDPR erasure will anonymise the user row (email/name/phone scrubbed) rather than delete it — to design with the account-deletion path.

## 2026-10-09 — /vaises keeps a single light palette, no dark mode — Confirmed
- The page is photo-led: full-bleed, darkened black-and-white photos with cream text panels. Its look is the same whatever the visitor's OS theme.
- This is a deliberate exception to UI-STANDARDS' "every screen works in light and dark". It applies only to /vaises; app screens still need both themes.
- Rejected: a dark variant of the cream panels. It would mean redesigning the brand surface for little gain on a one-visit marketing page.

## 2026-10-10 — Superadmin sign-in is password-only — Confirmed
- Owner's decision for a single-operator admin: superadmin TOTP is removed (`/auth/mfa`, `security/totp.py`, migration 0002 drops the columns).
- Deliberate exception to the standard "superadmin login requires the same or stronger auth (2FA if available)"; reverses the 2026-09-29 TOTP decision.
- Still in place: escalating per-IP and per-account login lockouts, generic errors, superadmin sessions 30 min idle / 12 h absolute, audit entry on every sign-in and failure.
