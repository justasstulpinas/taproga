# Vaises backend — design

Date: 2026-10-10 · Status: awaiting review · Sub-project 1 of 6 (see "Programme" below)

## Goal

Make `/vaises` (the owner's catering business page) real. A visitor checks a date and sees the true answer, then sends a date inquiry or a consultation request. The owner is emailed at once and manages everything in `/admin/vaises`. Today all three calls are placeholders in `src/services/vaises/dateInquiry.ts`.

**Done when:** a real visitor checks a date and gets an answer driven by the owner's blocked dates. They send a request and, if they gave an email address, receive a receipt. The owner gets an email within a minute and finds the request waiting in `/admin/vaises`, where they mark it answered.

## Programme

This is the first of six sub-projects. All of them are built on the existing `api/` backend (Phase 1: accounts, sessions, rate limiting, Turnstile, email outbox, audit log), and each gets its own spec, plan and build:

1. **Vaises** (this spec)
   - 1b. Vaises menu offers (next; own spec). The owner edits dinner and "one bite" menus with categories and prices in the admin. Every save creates an immutable version. Each customer gets a personal secret link to `/vaises/meniu`, frozen to the exact version they were sent, and can reopen it at any time.
2. Kvieciam core: events, panels, guests, guest access, RSVP, menu, CSV export
3. Kvieciam payments: per-event plans, Stripe, entitlements, admin overrides
4. Supabase switch-off
5. Planning platform: vendor connections, schedule, seating, moodboard, caterer view
6. Media

## Decisions confirmed with the owner

| Topic | Decision |
|---|---|
| Availability source | The owner blocks dates by hand. A date is reserved if and only if it is blocked. No per-day capacity, no calendar sync. |
| Booking window | Today (Europe/Vilnius) up to 3 years ahead. |
| Blocked-date data | Only the date, plus who blocked it and when. No notes. |
| Unblocking | Deletes the row. The audit log keeps the before and after. |
| Request storage | One table for both kinds (date inquiry, consultation). |
| Availability endpoint | Public. Rate-limited, no Turnstile. |
| Request handling | The owner is emailed for every request, and every request is also listed in the admin. |
| Who manages | Only the owner, as superadmin. No new roles. |
| Visitor receipt | Sent only when the contact is an email address. |
| Admin sign-in | Email and password only. Superadmin TOTP is removed; see "Superadmin sign-in change". |
| UI behaviour | Every mutation is optimistic, with rollback on failure. |
| Retention | Contact details are anonymised 24 months after a request is handled. |

## Architecture

All new code sits in `api/`, using its existing layers:

```
routers/       vaises_public.py, admin_vaises.py      HTTP only
services/      vaises.py                              availability, submit, handle, erase
repositories/  vaises.py                              all queries; excludes soft-deleted requests
policies/      access.py (existing)                   require_superadmin for admin routes
schemas/       vaises.py                              separate In/Out models; In models whitelist fields
models/        vaises.py                              BlockedDate, VaisesRequest
jobs/          vaises_retention.py                    daily anonymisation
emails/        templates.py (+2 templates)            owner notification, visitor receipt
```

The frontend keeps calling same-origin `/api/v1/*`, and `next.config.ts` already rewrites that to FastAPI. The three functions in `src/services/vaises/dateInquiry.ts` keep their names and signatures and are reimplemented over `fetch`.

## Data model

Both tables follow the `api/` conventions: integer PK internally, `public_id` UUIDv4 as the external identity, TIMESTAMPTZ via `UTCDateTime`, enums as VARCHAR + CHECK via `enum_column`, and deterministic constraint names. One new reversible Alembic migration creates both tables.

### `vaises_blocked_dates`

| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| public_id | uuid, unique | |
| date | DATE, unique, not null | A calendar date with no time or timezone. |
| created_by_user_id | FK users.id, not null, indexed | |
| created_at, updated_at | TIMESTAMPTZ | |

### `vaises_requests`

| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| public_id | uuid, unique | |
| kind | enum `date_inquiry` / `consultation` | |
| event_date | DATE, nullable | CHECK: not null when `kind = date_inquiry`, null otherwise. |
| availability_at_submit | enum `available` / `reserved`, nullable | Computed on the server at submit time. The client's value is never trusted. Null for consultations. |
| contact_kind | enum `email` / `phone`, nullable | Null once anonymised. |
| contact_encrypted | text, nullable | Encrypted with `FieldEncryptor`. Null once anonymised. |
| contact_hash | varchar(64), nullable, indexed | Keyed HMAC of the normalised contact, used for per-recipient throttling. Null once anonymised. |
| locale | enum `lt` / `en` | Sets the receipt's language. |
| idempotency_key | uuid, unique | Supplied by the client. |
| status | enum `new` / `handled`, indexed | |
| handled_at | TIMESTAMPTZ, nullable | |
| handled_by_user_id | FK users.id, nullable, indexed | |
| anonymised_at | TIMESTAMPTZ, nullable | |
| created_at, updated_at | TIMESTAMPTZ | `created_at` is indexed (list order). |
| deleted_at | TIMESTAMPTZ, nullable | Soft delete. The repository filters these rows out of every query. |

Contacts are normalised before hashing and encryption, using the same rules as the frontend's `parseContact`: emails trimmed and lowercased, phone numbers stripped of separators.

## API

All dates in requests and responses are `YYYY-MM-DD`. "Today" is computed in `Europe/Vilnius` via `app.clock`, never the server's timezone.

### Public (no session)

| Method and path | Body / query | Response | Protection |
|---|---|---|---|
| `GET /api/v1/vaises/availability` | `?date=YYYY-MM-DD` | `200 {date, availability: "available" \| "reserved"}` | `VAISES_AVAILABILITY_IP`: 60/hour, escalating lockout |
| `POST /api/v1/vaises/date-inquiries` | `{date, contact, locale, idempotency_key, turnstile_token}` | `202 {}` | Turnstile (fails closed), `VAISES_SUBMIT_IP` 5/hour, `VAISES_SUBMIT_RECIPIENT` 3/day |
| `POST /api/v1/vaises/consultation-requests` | `{contact, locale, idempotency_key, turnstile_token}` | `202 {}` | Same as date inquiries |

Input models accept only the listed fields (`extra="forbid"`). A body that carries `status`, `availability` or any other field is rejected. Validation:

- **date:** a real calendar date, ≥ today, ≤ today + 3 years.
- **contact:** a valid email or phone number (8–15 digits after normalisation), at most 320 characters.
- **locale:** `lt` or `en`.

The 202 body is identical whether or not a receipt was queued.

### Admin (superadmin session required)

| Method and path | Purpose |
|---|---|
| `GET /api/v1/admin/vaises/blocked-dates?from=&to=` | Blocked dates in a range of at most 400 days, ordered by date. |
| `POST /api/v1/admin/vaises/blocked-dates` `{date, idempotency_key}` | Block a date. Idempotent: blocking an already-blocked date returns the existing row. |
| `DELETE /api/v1/admin/vaises/blocked-dates/{date}` | Unblock. Unblocking a date that isn't blocked returns 204. |
| `GET /api/v1/admin/vaises/requests?status=new\|handled&limit=&cursor=` | Cursor-paginated, newest first. Default limit 25, max 100 (existing `PageLimit`). |
| `GET /api/v1/admin/vaises/requests/{public_id}` | One request (for the email deep link). |
| `POST /api/v1/admin/vaises/requests/{public_id}/handled` | Mark handled. Idempotent. |
| `POST /api/v1/admin/vaises/requests/{public_id}/reopen` | Back to `new`. Idempotent. |
| `POST /api/v1/admin/vaises/requests/{public_id}/erase` | Anonymise immediately (GDPR request). |

Every admin mutation writes an `audit_log` entry: actor, action, target public ID, before and after, IP and request ID. The before and after never contain the decrypted contact.

Out models list their fields explicitly. The request Out model returns the decrypted contact only to admin endpoints.

## Request flow

### Availability check

1. Validate the date.
2. Throttle by IP.
3. Look up the date in `vaises_blocked_dates`.
4. Return the result. It reveals nothing about who booked the date.

### Submitting a request

1. Validate the body.
2. Check the per-IP limit, then the per-recipient limit (by `contact_hash`), then Turnstile. A failure returns the matching error code and writes nothing.
3. **Idempotency:** if `idempotency_key` already exists, return 202 without writing.
4. In one transaction:
   - insert the request, with `availability_at_submit` re-computed on the server;
   - enqueue the owner notification to `VAISES_NOTIFY_EMAIL`;
   - if `contact_kind = email`, enqueue the visitor receipt.
5. Record the throttle hits and return 202.

A race between two requests with the same idempotency key is resolved by its unique constraint: the second insert fails, and the service returns 202.

The existing `email_worker` delivers with exponential retry and dead-letters after 8 attempts, so the form never waits on the email provider.

## Emails

Both templates are added to `app/emails/templates.py` with LT and EN copy, HTML and plain text, sent from `EMAIL_FROM`.

- **Owner notification.**
  - Subject: "Nauja užklausa: {date}" or "Nauja konsultacijos užklausa".
  - Body: kind, date, availability at submit, the contact, and a button to `{PUBLIC_APP_URL}/admin/vaises/uzklausos?id={public_id}`.
  - Always in Lithuanian.
- **Visitor receipt.**
  - Date inquiry: "Gavome jūsų užklausą dėl {date}. Susisieksime su jumis el. paštu." Consultation: "Gavome jūsų užklausą. Susisieksime su jumis el. paštu."
  - No links, and nothing the visitor typed except the formatted date, so the template can't be used for injection or phishing.
  - In the visitor's `locale`.

New setting: `VAISES_NOTIFY_EMAIL` (required in staging and production; documented in `.env.example`).

## Superadmin sign-in change

The owner chose password-only sign-in for the admin. This is a deliberate exception to the project standard ("2FA if available") and reverses the Phase 1 decision.

**Changes:**
- `AuthService.login` issues a fully verified session for superadmins.
- Remove `verify_mfa`, the `POST /auth/mfa` route, `app/security/totp.py`, the `MfaInvalid` and `MfaNotPending` errors, the `MFA_FAILURE_ACCOUNT` throttle rule and its tests, and the TOTP step in `app.cli create-superadmin`.
- A new reversible migration drops `users.totp_secret_encrypted`, `users.totp_last_used_step` and `user_sessions.mfa_verified_at`. Its downgrade re-adds them as nullable.
- Add a `docs/decisions.md` entry recording the exception, the reason (owner's choice, single operator) and what still protects the account.

**What still protects it:**
- the existing escalating lockouts per IP and per account;
- generic "invalid credentials" errors;
- superadmin sessions of 30 minutes idle and 12 hours absolute;
- an audit entry on every sign-in and failed attempt.

## Frontend

### Admin

All admin pages are server-checked via `GET /api/v1/auth/me`. A visitor without a superadmin session is redirected to `/admin/login`. Admin copy is Lithuanian and goes through the translation layer.

- **`/admin/login`:** email and password, with labels, inline errors, a disabled and loading submit, and a generic failure message. On success it goes to `/admin/vaises/uzklausos`.
- **`/admin/vaises/datos`:**
  - A month calendar reusing the public calendar's grid, weekday row and today marker, with blocked days filled in ink. Clicking toggles block and unblock.
  - A list of upcoming blocked dates sits below.
  - Mobile-first, with 44px targets.
- **`/admin/vaises/uzklausos`:**
  - Tabs for New and Handled, newest first, with "Rodyti daugiau" (cursor pagination).
  - Each row shows the kind, event date, availability at submit, contact (`tel:` or `mailto:` link) and arrival time.
  - "Pažymėti atsakytu" marks a row answered, with a 5-second "Atšaukti" undo.
  - "Ištrinti kontaktus" (erase) asks for confirmation in a dialog.
  - `?id=` highlights the request opened from the email.
  - States: loading skeleton, a designed empty state ("Naujų užklausų nėra"), and an error with retry.

### Public `/vaises`

- **Date check:** not optimistic, because it needs the server's answer. It keeps the existing "Tikriname datą…" state and minimum display time.
- **Sending:** optimistic.
  - On a valid submit, the thank-you state shows immediately and the request goes out in the background.
  - On failure, the form comes back with the typed contact preserved and a specific message for each error code.
  - Each form instance creates one `idempotency_key` when it opens, and a retry reuses it.
  - The 600ms minimum send display is removed.
- **Turnstile:** an invisible widget on both forms (site key from `NEXT_PUBLIC_TURNSTILE_SITE_KEY`). It shows a challenge only when Cloudflare asks for one.

### Optimistic pattern

Every admin mutation applies its change locally, sends the request with an idempotency key, and on failure restores the previous state with an inline error naming the item. For example: "Nepavyko užblokuoti lapkričio 14 d. Bandykite dar kartą."

## Errors

The API returns `{error: {code, message, request_id}}` using the existing error handler and `error_codes.py`. New codes:

| Code | HTTP | Frontend message (lt) |
|---|---|---|
| `INVALID_DATE` | 422 | "Pasirinkite datą nuo šiandien iki 3 metų į priekį." |
| `INVALID_CONTACT` | 422 | "Įveskite el. pašto adresą arba telefono numerį." |
| `HUMAN_VERIFICATION_FAILED` (existing) | 400 | "Nepavyko patvirtinti, kad esate žmogus. Bandykite dar kartą." |
| `RATE_LIMITED` (existing) | 429 + `Retry-After` | "Per daug užklausų. Pabandykite vėliau." |
| `NOT_FOUND` (existing) | 404 | Admin only. |

A 500 shows a generic message with the request ID. Nothing internal reaches the client.

## Data protection

- Contacts are encrypted at rest and decrypted only in admin responses.
- Logs carry the request's `public_id`, never the contact. The existing log redaction stays.
- **Retention:** the `vaises_retention` job runs daily. It anonymises requests handled more than 24 months ago (sets the contact fields to null and `anonymised_at`), and writes one summary audit entry per run. It is idempotent and safe to run twice.
- **Erasure:** the admin `erase` endpoint applies the same anonymisation immediately, with its own audit entry.

## Testing

pytest + httpx `AsyncClient`, run on SQLite by default and on Postgres via `TEST_DATABASE_URL` in CI, following the existing suite.

- **Availability:**
  - free vs reserved;
  - past date, today, today + 3 years, and one day beyond;
  - the Vilnius midnight boundary, and a DST-transition day;
  - an invalid date string;
  - IP rate limit.
- **Submit:**
  - the happy path for both kinds, checking the row and the outbox rows created in one transaction;
  - no receipt for phone contacts;
  - the client's `availability` field is rejected;
  - extra fields are rejected;
  - per-IP and per-recipient limits;
  - Turnstile failing closed;
  - a repeated idempotency key writes nothing;
  - a concurrent duplicate key still returns 202 with one row;
  - the contact is stored encrypted and is absent from logs.
- **Admin authorisation:**
  - every admin route returns 401 when signed out and 403 for a verified non-superadmin;
  - an unknown or soft-deleted request ID returns 404.
- **Admin behaviour:**
  - block and unblock are idempotent;
  - range limit;
  - pagination default and max;
  - handled, reopen and erase each write audit entries without the contact.
- **Retention job:**
  - anonymises only requests handled more than 24 months ago;
  - is idempotent.
- **Superadmin login:**
  - succeeds with password only;
  - wrong password increments the lockout;
  - `/auth/mfa` returns 404;
  - the migration upgrades and downgrades cleanly.
- **Frontend:**
  - a failed send restores the form with the contact preserved and reuses the idempotency key;
  - a failed admin toggle restores the day and shows the error.

## Out of scope

- **Menu offers.** These are sub-project 1b. The planned extension point: 1b adds a nullable link from an offer to a `vaises_requests` row (by `public_id`) and a "Sukurti pasiūlymą" action on each request in the admin list. Nothing in this spec should make that link hard to add. No offer columns are created here.
- Calendar sync, per-day capacity, staff roles, customer accounts, payments or deposits, and any Kvieciam work. These belong to later sub-projects or have been explicitly declined.

## Open items

None blocking. Before launch: set `VAISES_NOTIFY_EMAIL` and the Turnstile keys in each environment, and confirm the sender domain's SPF, DKIM and DMARC (already on the pre-launch checklist).
