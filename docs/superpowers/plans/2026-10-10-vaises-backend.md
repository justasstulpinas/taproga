# Vaises Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three `/vaises` placeholders with a real backend. That covers blocked dates, the availability check, date inquiries and consultation requests with owner notification and visitor receipt, and the `/admin/vaises` screens. It also switches superadmin sign-in to password-only.

**Architecture:** A Vaises module inside the existing FastAPI app in `api/`, using its existing layers (router, service, repository, schema, model). It reuses `Throttle`, `HumanVerifier`, `FieldEncryptor`, `SubjectHasher`, `EmailQueue` and `AuditService`. The Next.js frontend calls same-origin `/api/v1/*`, which `next.config.ts` already rewrites to FastAPI. The functions in `src/services/vaises/dateInquiry.ts` keep their names and are reimplemented over `fetch`.

**Tech Stack:**
- Backend: FastAPI, SQLAlchemy 2.0 async, Alembic, Pydantic v2, pytest + httpx (`asyncio_mode = "auto"`, warnings are errors), ruff, mypy strict, uv.
- Frontend: Next.js 16 Pages Router, React 19, Tailwind v4. Adds Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-10-vaises-backend-design.md`

## Global Constraints

- All backend commands run from `api/`: `uv run pytest`, `uv run ruff check . && uv run ruff format --check .`, `uv run mypy`. Each task ends with all three green.
- Migrations are append-only. New ones are `0002` (drop TOTP) and `0003` (Vaises tables), each reversible, with frozen enum tuples and no app imports (the pattern in `0001`).
- Public IDs are UUIDv4 (`PublicIdMixin`). Integer PKs never appear in responses, URLs or audit `target_public_id`.
- Timestamps use `UTCDateTime` (TIMESTAMPTZ). Event and blocked dates are `DATE`. "Today" means Europe/Vilnius, never the server's timezone.
- Booking window: `today ≤ date ≤ today + 3 years`, where 3 years is the same month and day three years later, or Feb 28 for Feb 29.
- Contact normalisation, matching the frontend `parseContact`:
  - An email (input contains `@`) must match `^[^\s@]+@[^\s@]+\.[^\s@]+$` and is trimmed and lowercased.
  - Otherwise it's a phone: strip `[\s\-().]`, then it must match `^\+?\d{8,15}$`.
  - Raw input is at most 320 characters.
- Rate limits, defined as `ThrottleRule` in `Rules`:
  - `VAISES_AVAILABILITY_IP` (60/hour, base lockout 1 min, max 1 hour)
  - `VAISES_SUBMIT_IP` (5/hour, 5 min, 1 day)
  - `VAISES_SUBMIT_RECIPIENT` (3/day, 1 hour, 1 day, new `SubjectKind.CONTACT`)
- Turnstile fails closed via the existing `HumanVerifier`.
- Input models use `model_config = ConfigDict(extra="forbid")`. Unknown fields return 422 `VALIDATION_ERROR`.
- Every admin mutation writes an audit entry. Audit `before` and `after` never contain the contact, encrypted or plain.
- Logs never contain the contact. Log the request `public_id` only.
- UI copy is Lithuanian and goes through the translation layer. Every mutation is optimistic, with rollback and an inline error that names the item.
- No sequential IDs or user content in emails beyond what the spec lists. The visitor receipt has no links.
- Commit at the end of every task on a feature branch, never on `main`.

## Review Focus

1. **Date strings like `2026-02-30` or `2026-2-5`**: must be rejected with 422, not crash and not be parsed leniently. Pinned in Task 4.
2. **A contact that's valid in one form but shows up again in another** (`Jonas@Example.LT ` and `jonas@example.lt`; `+370 612 34567` and `+37061234567`): must count as one recipient for the per-recipient limit. Pinned in Task 6.
3. **The same idempotency key sent twice at once** (double-tap on a slow phone): exactly one row and one pair of emails, and both calls return 202. Pinned in Task 6.
4. **Unblocking a date that has a pending inquiry**: the request row keeps `availability_at_submit = reserved`, and only new checks see `available`. Pinned in Task 7.
5. **An admin toggle that fails after the optimistic flip**: the day must flip back, keyboard focus must stay on it, and the error must name that date. Pinned in Task 12.

---

### Task 1: Password-only superadmin sign-in

**Files:**
- Modify: `api/app/services/auth.py`. `login` issues a verified session for every account type. Delete `verify_mfa` and the `mfa_required` field of `LoginResult`.
- Modify: `api/app/routers/auth.py`. Delete `POST /mfa`. `/me` stops passing `mfa_pending`.
- Modify: `api/app/schemas/auth.py`. Delete `LoginOut.mfa_required`, the `mfa_pending` field and argument on `MeOut`, and the MFA input model.
- Modify: `api/app/policies/access.py`. `ensure_fully_authenticated` checks email verification only. Delete `is_mfa_pending`.
- Modify: `api/app/services/sessions.py`. Drop the `mfa_verified` parameter and the `mfa_verified_at` handling.
- Modify: `api/app/models/user.py` and `api/app/models/auth.py`. Remove `User.totp_secret_encrypted`, `User.totp_last_used_step` and `UserSession.mfa_verified_at`.
- Modify: `api/app/domain_errors.py` and `api/app/error_codes.py`. Delete `MfaRequired`, `MfaInvalid`, `MfaNotPending` and their codes.
- Modify: `api/app/services/throttle.py`. Delete `MFA_FAILURE_ACCOUNT` and remove it from `ACCOUNT_LOCKOUTS`.
- Modify: `api/app/services/audit.py`. Delete `MFA_SUCCEEDED` and `MFA_FAILED`.
- Modify: `api/app/cli.py`. `create-superadmin` no longer generates or prints a TOTP secret.
- Delete: `api/app/security/totp.py`. Remove `pyotp` from `api/pyproject.toml` with `uv remove pyotp` if nothing else imports it.
- Create: `api/migrations/versions/20261010_1200_0002_drop_superadmin_totp.py`. The upgrade drops the three columns. The downgrade re-adds `totp_secret_encrypted TEXT NULL`, `totp_last_used_step BIGINT NULL` and `mfa_verified_at TIMESTAMPTZ NULL`.
- Modify: `api/tests/conftest.py`. `SuperadminCredentials` loses `totp_secret`, and `create_superadmin` stops setting TOTP fields.
- Modify: `api/tests/test_admin.py`. `_admin_session` becomes a plain `login`. Delete the MFA-specific tests anywhere under `api/tests/`.
- Modify: `docs/decisions.md`. Append an entry (text in Step 6).
- Test: `api/tests/test_auth_superadmin_login.py`

**Interfaces:**
- Produces: `create_superadmin(sessionmaker, email="admin@taproga.lt") -> SuperadminCredentials(email, password)` and `async def admin_login(client: AsyncClient, creds: SuperadminCredentials) -> None` in `tests/conftest.py`. Every later admin test uses these.
- Produces: `LoginOut = {user: MeOut}`.

- [ ] **Step 1: Write the failing tests** in `tests/test_auth_superadmin_login.py`

```python
async def test_superadmin_login_needs_only_password(client, sessionmaker):
    creds = await create_superadmin(sessionmaker)
    body = await login(client, creds.email, creds.password)
    assert "mfa_required" not in body
    assert (await client.get("/api/v1/admin/users")).status_code == 200

async def test_superadmin_wrong_password_counts_toward_lockout(client, sessionmaker):
    creds = await create_superadmin(sessionmaker)
    for _ in range(5):
        r = await client.post("/api/v1/auth/login", json={"email": creds.email, "password": "wrong-wrong-wrong-1"})
        assert r.json()["error"]["code"] == "INVALID_CREDENTIALS"
    r = await client.post("/api/v1/auth/login", json={"email": creds.email, "password": creds.password})
    assert r.status_code == 429

async def test_mfa_endpoint_is_gone(client):
    assert (await client.post("/api/v1/auth/mfa", json={"code": "123456"})).status_code == 404

async def test_superadmin_login_is_audited(client, sessionmaker):
    creds = await create_superadmin(sessionmaker)
    await login(client, creds.email, creds.password)
    # one auth.login_succeeded entry with actor_kind == "superadmin"
```

- [ ] **Step 2: Run** `uv run pytest tests/test_auth_superadmin_login.py -v`. Expected: the first test fails (`mfa_required` present, admin route returns 403 `MFA_REQUIRED`), and the MFA endpoint returns 200 or 422 instead of 404.
- [ ] **Step 3: Make the source changes listed in Files.** Keep `SUPERADMIN_LIFETIME` (30 min idle, 12 h absolute) unchanged.
- [ ] **Step 4: Write migration `0002`** with `revision = "0002"` and `down_revision = "0001"`.
- [ ] **Step 5: Run** `uv run pytest`, `uv run mypy` and ruff. Expected: all green, including `test_migrations_match_models_and_are_reversible`.
- [ ] **Step 6: Append to `docs/decisions.md`:**

```markdown
## 2026-10-10 — Superadmin sign-in is password-only — Confirmed
- Owner's decision for a single-operator admin: superadmin TOTP is removed (`/auth/mfa`, `security/totp.py`, migration 0002 drops the columns).
- Deliberate exception to the standard "superadmin login requires the same or stronger auth (2FA if available)"; reverses the 2026-09-29 TOTP decision.
- Still in place: escalating per-IP and per-account login lockouts, generic errors, superadmin sessions 30 min idle / 12 h absolute, audit entry on every sign-in and failure.
```

- [ ] **Step 7: Commit** with the message `feat(auth): password-only superadmin sign-in`.

---

### Task 2: Vilnius date rules

**Files:**
- Modify: `api/app/clock.py`
- Create: `api/app/services/vaises_dates.py`
- Modify: `api/app/domain_errors.py` and `api/app/error_codes.py`. Add `InvalidDate` with code `INVALID_DATE`, mapped to HTTP 422 in `app/errors.py`.
- Test: `api/tests/test_vaises_dates.py`

**Interfaces:**
- Produces: `VILNIUS = ZoneInfo("Europe/Vilnius")` and `def vilnius_today(now: datetime | None = None) -> date` in `app/clock.py`. `now` defaults to `utcnow()`.
- Produces: `BOOKING_WINDOW_YEARS = 3`, `def booking_window_end(today: date) -> date` and `def ensure_bookable(value: date, today: date) -> None` (raises `InvalidDate`) in `app/services/vaises_dates.py`.

- [ ] **Step 1: Write the failing tests**

```python
def test_vilnius_today_crosses_midnight_before_utc():
    assert vilnius_today(datetime(2026, 7, 1, 21, 30, tzinfo=UTC)) == date(2026, 7, 2)  # UTC+3 in summer

def test_vilnius_today_in_winter():
    assert vilnius_today(datetime(2026, 1, 1, 22, 30, tzinfo=UTC)) == date(2026, 1, 2)  # UTC+2

def test_vilnius_today_on_dst_change_day():
    assert vilnius_today(datetime(2026, 3, 29, 0, 30, tzinfo=UTC)) == date(2026, 3, 29)

@pytest.mark.parametrize(("value", "ok"), [
    (date(2026, 10, 9), False), (date(2026, 10, 10), True),
    (date(2029, 10, 10), True), (date(2029, 10, 11), False),
])
def test_ensure_bookable_window(value, ok): ...  # today = date(2026, 10, 10)

def test_window_end_from_feb_29():
    assert booking_window_end(date(2028, 2, 29)) == date(2031, 2, 28)
```

- [ ] **Step 2: Run** `uv run pytest tests/test_vaises_dates.py -v`. Expected: FAIL with an import error.
- [ ] **Step 3: Implement** using `zoneinfo`. `booking_window_end` uses `date.replace(year=...)` and falls back to Feb 28 on `ValueError`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(vaises): Vilnius booking-window rules`.

---

### Task 3: Vaises models and migration

**Files:**
- Create: `api/app/models/vaises.py`
- Modify: `api/app/models/__init__.py`. Export the new names.
- Create: `api/migrations/versions/20261010_1300_0003_vaises.py`. `revision = "0003"`, `down_revision = "0002"`.
- Test: the existing `api/tests/test_migrations.py` covers reversibility and model parity. Add `api/tests/test_vaises_models.py` for the constraints.

**Interfaces:**
- Produces enums: `RequestKind(DATE_INQUIRY="date_inquiry", CONSULTATION="consultation")`, `Availability(AVAILABLE="available", RESERVED="reserved")`, `ContactKind(EMAIL="email", PHONE="phone")`, `RequestStatus(NEW="new", HANDLED="handled")`.
- Produces models:
  - `BlockedDate(PublicIdMixin, TimestampMixin, Base)`: table `vaises_blocked_dates`, fields `id`, `date: date` (unique, indexed by the unique constraint), `created_by_user_id` (FK `users.id`, indexed).
  - `VaisesRequest(PublicIdMixin, TimestampMixin, Base)`: table `vaises_requests`, with exactly the spec's columns (`kind`, `event_date`, `availability_at_submit`, `contact_kind`, `contact_encrypted`, `contact_hash` (`String(64)`, indexed), `locale` (`enum_column(Locale, ...)`), `idempotency_key` (`Uuid`, unique), `status` (indexed), `handled_at`, `handled_by_user_id` (FK, indexed), `anonymised_at`, `deleted_at`). `created_at` is indexed.
  - CHECK `event_date_matches_kind`: `(kind = 'date_inquiry' AND event_date IS NOT NULL) OR (kind = 'consultation' AND event_date IS NULL)`.

- [ ] **Step 1: Write the failing tests:** a consultation with an `event_date` and a date inquiry without one both raise `IntegrityError` on commit, and a duplicate `BlockedDate.date` raises `IntegrityError`.
- [ ] **Step 2: Run** `uv run pytest tests/test_vaises_models.py -v`. Expected: FAIL on import.
- [ ] **Step 3: Implement the models and migration `0003`.** Freeze the enum tuples in the migration. The downgrade drops both tables.
- [ ] **Step 4: Run** `uv run pytest tests/test_vaises_models.py tests/test_migrations.py -v`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(vaises): blocked dates and requests tables`.

---

### Task 4: Public availability endpoint

**Files:**
- Create: `api/app/repositories/vaises.py`
- Create: `api/app/services/vaises.py`
- Create: `api/app/schemas/vaises.py`
- Create: `api/app/routers/vaises_public.py`, registered in `api/app/main.py` with `prefix=API_PREFIX`.
- Modify: `api/app/services/throttle.py`. Add `VAISES_AVAILABILITY_IP`.
- Modify: `api/app/dependencies.py`
- Test: `api/tests/test_vaises_availability.py`

**Interfaces:**
- Consumes: `vilnius_today` and `ensure_bookable` (Task 2), and `BlockedDate` (Task 3).
- Produces:
  - `VaisesRepository(session)` with `async def is_blocked(self, value: date) -> bool`. Later tasks add methods to this class.
  - `VaisesService(session, *, throttle: Throttle, encryptor, hasher, human_verifier, email_queue: EmailQueue, audit: AuditService, notify_email: str | None, today: Callable[[], date])` with `async def availability(self, value: date, meta: RequestMeta) -> Availability`.
  - `def get_today() -> date` (returns `vilnius_today()`) and `def get_vaises_service(...) -> VaisesService` in `dependencies.py`, plus the alias `Vaises = Annotated[VaisesService, Depends(get_vaises_service)]`. Tests override `get_today` with `app.dependency_overrides`.
  - `IsoDate = Annotated[date, BeforeValidator(strict_iso_date)]`, accepting only `^\d{4}-\d{2}-\d{2}$` strings that are real dates. Otherwise it raises `InvalidDate`, so a bad date returns 422 `INVALID_DATE`, not `VALIDATION_ERROR`.
  - `AvailabilityOut(date: date, availability: Availability)`.
  - Route: `GET /api/v1/vaises/availability?date=`.

- [ ] **Step 1: Write the failing tests** (today overridden to `date(2026, 10, 10)`)

```python
async def test_free_date(client): r = await get(client, "2026-11-14"); assert r.json() == {"date": "2026-11-14", "availability": "available"}
async def test_blocked_date(client, sessionmaker): ...  # insert BlockedDate(2026-11-14) -> "reserved"
@pytest.mark.parametrize("bad", ["2026-02-30", "2026-2-5", "14-11-2026", "", "2026-11-14T00:00"])
async def test_malformed_date_is_rejected(client, bad): r = await get(client, bad); assert (r.status_code, r.json()["error"]["code"]) == (422, "INVALID_DATE")
async def test_past_and_beyond_window_rejected(client): ...  # 2026-10-09 and 2029-10-11 -> 422 INVALID_DATE
async def test_response_reveals_nothing_else(client, sessionmaker): ...  # keys == {"date", "availability"}
async def test_ip_rate_limit(client): ...  # 61st call within the hour -> 429 with Retry-After header
```

- [ ] **Step 2: Run** `uv run pytest tests/test_vaises_availability.py -v`. Expected: FAIL with 404 (no route).
- [ ] **Step 3: Implement.** The service calls `throttle.hit(Rules.VAISES_AVAILABILITY_IP, meta.ip or "unknown")`, then `ensure_bookable(value, today())`, then `repository.is_blocked`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(vaises): public availability endpoint`.

---

### Task 5: Owner notification and visitor receipt emails

**Files:**
- Modify: `api/app/emails/templates.py`
- Test: `api/tests/test_vaises_emails.py`

**Interfaces:**
- Produces:
  - `EmailTemplate.VAISES_OWNER_NOTIFICATION = "vaises_owner_notification"`
  - `EmailTemplate.VAISES_RECEIPT_DATE = "vaises_receipt_date"`
  - `EmailTemplate.VAISES_RECEIPT_CONSULTATION = "vaises_receipt_consultation"`
  - Payload keys:
    - owner: `kind_label`, `date_label` (may be `""`), `availability_label` (may be `""`), `contact`, `admin_url` (the button);
    - date receipt: `date_label`;
    - consultation receipt: none.
- Change: `_Copy.button` becomes `str | None`. A template without a button link key renders no button in HTML or text. `_Copy` fields may contain `{name}` placeholders, filled with `str.format_map` from the payload, with every substituted value HTML-escaped in the HTML part.

- [ ] **Step 1: Write the failing tests**

```python
def test_owner_notification_lt():
    m = render_email(EmailTemplate.VAISES_OWNER_NOTIFICATION, Locale.LT, "owner@vaises.lt",
                     {"kind_label": "Datos užklausa", "date_label": "2026 m. lapkričio 14 d.",
                      "availability_label": "laisva", "contact": "jonas@pavyzdys.lt",
                      "admin_url": "http://localhost:3000/admin/vaises/uzklausos?id=abc"})
    assert m.subject == "Nauja užklausa: 2026 m. lapkričio 14 d."
    assert "jonas@pavyzdys.lt" in m.text and "/admin/vaises/uzklausos?id=abc" in m.html

def test_receipt_has_no_links():
    m = render_email(EmailTemplate.VAISES_RECEIPT_DATE, Locale.LT, "jonas@pavyzdys.lt", {"date_label": "2026 m. lapkričio 14 d."})
    assert "Gavome jūsų užklausą dėl 2026 m. lapkričio 14 d." in m.text
    assert "<a " not in m.html and "http" not in m.text

def test_contact_is_escaped_in_owner_html(): ...  # contact "<script>x</script>@a.lt" appears escaped
def test_every_template_has_lt_and_en(): ...  # all three templates render in Locale.LT and Locale.EN
```

- [ ] **Step 2: Run** `uv run pytest tests/test_vaises_emails.py -v`. Expected: FAIL (unknown template).
- [ ] **Step 3: Implement.** The copy comes from the spec's Emails section. The consultation owner subject is "Nauja konsultacijos užklausa". The EN copy is a faithful translation.
- [ ] **Step 4: Run** `uv run pytest tests/test_vaises_emails.py tests/test_email_delivery.py -v`. Expected: PASS, with existing templates unchanged.
- [ ] **Step 5: Commit** with the message `feat(vaises): owner notification and receipt emails`.

---

### Task 6: Submitting date inquiries and consultation requests

**Files:**
- Modify: `api/app/settings.py`. Add `vaises_notify_email: EmailStr | None = None`, required (validator) when `environment` is staging or production. Document `VAISES_NOTIFY_EMAIL` in `api/.env.example`.
- Modify: `api/app/services/throttle.py`. Add `SubjectKind.CONTACT = "contact"`, `VAISES_SUBMIT_IP` and `VAISES_SUBMIT_RECIPIENT`.
- Modify: `api/app/schemas/vaises.py`, `api/app/services/vaises.py`, `api/app/repositories/vaises.py` and `api/app/routers/vaises_public.py`.
- Test: `api/tests/test_vaises_submit.py`

**Interfaces:**
- Consumes: `EmailTemplate.VAISES_*` and payload keys (Task 5), `ensure_bookable` (Task 2), `VaisesService` (Task 4).
- Produces:
  - `Contact(kind: ContactKind, value: str)` and `def parse_contact(raw: str) -> Contact | None` in `app/schemas/vaises.py`, using the Global Constraints rules. A schema validator raises `InvalidContact` (new code `INVALID_CONTACT`, HTTP 422).
  - `DateInquiryIn(date: IsoDate, contact: ContactField, locale: Locale, idempotency_key: uuid.UUID, turnstile_token: str | None)`, with `extra="forbid"`.
  - `ConsultationIn`: the same without `date`.
  - `VaisesService.submit_date_inquiry(body: DateInquiryIn, meta) -> None` and `VaisesService.submit_consultation(body: ConsultationIn, meta) -> None`.
  - `VaisesRepository.add_request(request: VaisesRequest) -> None` and `VaisesRepository.idempotency_key_exists(key: uuid.UUID) -> bool`.
  - `def format_date_lt(value: date) -> str` (for example `"2026 m. lapkričio 14 d."`) in `app/services/vaises_dates.py`, also used by Task 8.
  - Routes `POST /api/v1/vaises/date-inquiries` and `POST /api/v1/vaises/consultation-requests`, both returning `202 {}` (the existing `AcceptedOut`).

**Submit order** (the spec's flow, as the service must implement it):
1. Run `throttle.check` on `VAISES_SUBMIT_IP` (by IP), then on `VAISES_SUBMIT_RECIPIENT` (key: the normalised contact value).
2. `human_verifier.verify(token, ip)`. On false, raise `HumanVerificationFailed`.
3. If the idempotency key exists, return.
4. Add the `VaisesRequest`:
   - `availability_at_submit` comes from `repository.is_blocked`;
   - `contact_encrypted = encryptor.encrypt(value)`;
   - `contact_hash = hasher.hash(SubjectKind.CONTACT, value)`.
5. Enqueue the owner email (`Locale.LT`, to `notify_email`; skip with a WARNING log if it isn't set locally), then the receipt if the contact is an email (in the body's locale).
6. Commit. On `IntegrityError` from `idempotency_key`, roll back and return.
7. `throttle.record` both rules. This runs after the commit, because `Throttle.record` commits its own write.

- [ ] **Step 1: Write the failing tests**

```python
async def test_date_inquiry_stores_and_queues_two_emails(client, sessionmaker): ...
    # 202; one VaisesRequest with kind=date_inquiry, status=new, availability_at_submit=available;
    # outbox: one to NOTIFY ("Nauja užklausa: 2026 m. lapkričio 14 d."), one to the visitor
async def test_phone_contact_gets_no_receipt(client, sessionmaker): ...  # outbox has only the owner email
async def test_reserved_date_is_still_accepted_and_recorded_as_reserved(client, sessionmaker): ...
async def test_client_cannot_set_availability_or_status(client): ...
    # body + {"availability": "available"} or {"status": "handled"} -> 422 VALIDATION_ERROR
async def test_contact_is_encrypted_and_not_logged(client, sessionmaker, caplog): ...
    # contact_encrypted != "jonas@pavyzdys.lt"; decrypts back; the raw contact appears in no log record
async def test_turnstile_fails_closed(client, sessionmaker): ...  # turnstile_token "bot" -> 400 HUMAN_VERIFICATION_FAILED, no row
async def test_same_idempotency_key_writes_once(client, sessionmaker): ...  # two sequential posts -> one row, two outbox rows
async def test_concurrent_same_key_writes_once(client, sessionmaker): ...  # asyncio.gather of two posts -> both 202, one row
async def test_ip_limit(client): ...  # 6th submit within an hour from one IP -> 429
async def test_recipient_limit_normalises_contact(client): ...
    # "Jonas@Example.LT ", "jonas@example.lt", "JONAS@example.lt" accepted; a 4th variant on the same day -> 429
    # same for "+370 612 34567" / "+37061234567" / "(+370) 612-34567"
async def test_invalid_contact(client): ...  # "jonas@" and "123" -> 422 INVALID_CONTACT
async def test_consultation_has_no_event_date(client, sessionmaker): ...
```

- [ ] **Step 2: Run** `uv run pytest tests/test_vaises_submit.py -v`. Expected: FAIL with 404.
- [ ] **Step 3: Implement** following the submit order above.
- [ ] **Step 4: Run** `uv run pytest`, mypy and ruff. Expected: all green.
- [ ] **Step 5: Commit** with the message `feat(vaises): date inquiry and consultation submissions`.

---

### Task 7: Admin blocked dates

**Files:**
- Create: `api/app/routers/admin_vaises.py`. `APIRouter(prefix="/admin/vaises", dependencies=[Depends(require_superadmin)])`, registered in `main.py`.
- Modify: `api/app/services/vaises.py`, `api/app/repositories/vaises.py` and `api/app/schemas/vaises.py`.
- Modify: `api/app/services/audit.py`. Add `AuditAction.VAISES_DATE_BLOCKED = "vaises.date_blocked"`, `VAISES_DATE_UNBLOCKED = "vaises.date_unblocked"` and `AuditTarget.VAISES_BLOCKED_DATE = "vaises_blocked_date"`.
- Test: `api/tests/test_admin_vaises_dates.py`

**Interfaces:**
- Consumes: `admin_login` (Task 1).
- Produces:
  - `BlockDateIn(date: IsoDate, idempotency_key: uuid.UUID)` (with `extra="forbid"`; blocking is idempotent on the date itself, and the key is accepted for client symmetry).
  - `BlockedDateOut(date: date, created_at: datetime)`.
  - `VaisesService.list_blocked(from_: date, to: date) -> list[BlockedDate]`, which raises `InvalidDate` if `to < from_` or the range is over 400 days.
  - `VaisesService.block(ctx: AuthContext, value: date, meta) -> BlockedDate`.
  - `VaisesService.unblock(ctx, value: date, meta) -> None`.
  - Routes `GET /blocked-dates?from=&to=`, `POST /blocked-dates`, `DELETE /blocked-dates/{date}` (204).

- [ ] **Step 1: Write the failing tests**

```python
@pytest.mark.parametrize(("method", "path"), DATE_ENDPOINTS)
async def test_rejects_anonymous(client, method, path): ...  # 401
@pytest.mark.parametrize(("method", "path"), DATE_ENDPOINTS)
async def test_rejects_regular_users(client, sessionmaker, method, path): ...  # verified newlywed and service -> 403
async def test_block_then_availability_reserved(client, sessionmaker): ...
async def test_block_twice_returns_same_row_and_one_audit_entry(client, sessionmaker): ...
async def test_unblock_missing_date_is_204(client, sessionmaker): ...
async def test_block_and_unblock_are_audited(client, sessionmaker): ...  # before/after contain only {"date": "..."}
async def test_unblock_keeps_existing_requests_reserved(client, sessionmaker): ...
    # submit an inquiry for a blocked date, unblock it, then the stored request still has availability_at_submit == "reserved"
    # and a new availability check returns "available"
async def test_range_over_400_days_rejected(client, sessionmaker): ...  # 422 INVALID_DATE
```

- [ ] **Step 2: Run** `uv run pytest tests/test_admin_vaises_dates.py -v`. Expected: FAIL with 404.
- [ ] **Step 3: Implement.** The admin can block any bookable date (`ensure_bookable`) and unblock any date, including past ones.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(vaises): admin blocked dates`.

---

### Task 8: Admin requests list, handle, reopen, erase

**Files:**
- Modify: `api/app/routers/admin_vaises.py`, `api/app/services/vaises.py`, `api/app/repositories/vaises.py`, `api/app/schemas/vaises.py` and `api/app/services/audit.py`.
- Test: `api/tests/test_admin_vaises_requests.py`

**Interfaces:**
- Consumes: `get_page_request` / `PageParams` (existing in `routers/admin.py`; move them to `app/pagination.py` or `routers/common.py` so both admin routers import them), and the `Cursor` keyset pattern from `AuditRepository.list_page`.
- Produces:
  - `VaisesRepository.list_requests(status: RequestStatus, page: PageRequest) -> Page[VaisesRequest]`, newest first, excluding `deleted_at IS NOT NULL`.
  - `VaisesRepository.get_request(public_id) -> VaisesRequest | None`, which also excludes soft-deleted rows.
  - `VaisesService.mark_handled(ctx, public_id, meta)`, `.reopen(ctx, public_id, meta)` and `.erase(ctx, public_id, meta)`, each returning `VaisesRequest` and raising `NotFound`.
  - `def anonymise(request: VaisesRequest, now: datetime) -> None` in `services/vaises.py`. It sets `contact_kind`, `contact_encrypted` and `contact_hash` to None and `anonymised_at = now`. Task 9 reuses it.
  - `VaisesRequestOut(id: UUID, kind, event_date: date | None, event_date_label: str | None, availability_at_submit, contact_kind, contact: str | None, status, created_at, handled_at, anonymised_at)`. `contact` is decrypted here only.
  - Audit actions `vaises.request_handled`, `vaises.request_reopened`, `vaises.request_erased`, with target `vaises_request`. `before` and `after` are `{"status": ...}` or `{"anonymised": bool}`, never the contact.
  - Routes `GET /requests?status=new|handled&limit=&cursor=`, `GET /requests/{public_id}`, and `POST /requests/{public_id}/handled|reopen|erase`.

- [ ] **Step 1: Write the failing tests**

```python
async def test_list_new_newest_first_with_cursor(client, sessionmaker): ...  # 3 requests, limit=2 -> 2 items + next_cursor; second page 1 item
async def test_limit_default_and_max(client, sessionmaker): ...  # default 25; limit=101 -> 422
async def test_handled_moves_between_tabs_and_is_idempotent(client, sessionmaker): ...
async def test_reopen(client, sessionmaker): ...
async def test_erase_removes_contact_and_audits_without_it(client, sessionmaker): ...
    # contact None in GET; the audit entry's before/after/context don't contain the address
async def test_unknown_or_soft_deleted_id_is_404(client, sessionmaker): ...
async def test_regular_user_gets_403_on_every_request_route(client, sessionmaker): ...
```

- [ ] **Step 2: Run** `uv run pytest tests/test_admin_vaises_requests.py -v`. Expected: FAIL with 404.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `uv run pytest`, mypy and ruff. Expected: all green.
- [ ] **Step 5: Commit** with the message `feat(vaises): admin request management`.

---

### Task 9: Retention job

**Files:**
- Create: `api/app/jobs/vaises_retention.py`. Its entrypoint, `uv run python -m app.jobs.vaises_retention`, runs once and exits. Schedule it daily via cron or the host's scheduler, and document that in `api/README.md`.
- Modify: `api/app/services/audit.py`. Add `AuditAction.VAISES_RETENTION_RUN = "vaises.retention_run"`.
- Test: `api/tests/test_vaises_retention.py`

**Interfaces:**
- Consumes: `anonymise` (Task 8).
- Produces: `RETENTION_AFTER_HANDLED = timedelta(days=730)` and `async def run_retention(session: AsyncSession, now: datetime) -> int`, which returns the number anonymised and writes one `SYSTEM` audit entry with `context={"anonymised": n}`.

- [ ] **Step 1: Write the failing tests:**
  - A request handled 731 days before `now` is anonymised.
  - A request handled 729 days before is untouched.
  - New (unhandled) requests are untouched at any age.
  - A second run anonymises 0 and still writes its audit entry.
- [ ] **Step 2: Run** `uv run pytest tests/test_vaises_retention.py -v`. Expected: FAIL on import.
- [ ] **Step 3: Implement** with a single `UPDATE … WHERE status='handled' AND handled_at < now - 730d AND anonymised_at IS NULL`, through the repository.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(vaises): contact retention job`.

---

### Task 10: Frontend API client and live `/vaises` forms

**Files:**
- Modify: `package.json`. Add dev dependencies `vitest`, `@testing-library/react`, `@testing-library/user-event` and `jsdom`, and the script `"test": "vitest run"`.
- Create: `vitest.config.ts` (jsdom environment, the `@` alias matching `tsconfig.json`).
- Create: `src/lib/api/client.ts`
- Create: `src/lib/api/errors.ts`
- Create: `components/vaises/Turnstile.tsx`. An invisible widget: it loads `https://challenges.cloudflare.com/turnstile/v0/api.js` once and exposes `getToken(): Promise<string>`. It renders nothing when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset, in which case `getToken` resolves `"dev"`, which local `AllowAllHumanVerifier` accepts.
- Modify: `src/services/vaises/dateInquiry.ts`, `components/vaises/DateInquiryPanel.tsx` and `components/vaises/ConsultationPanel.tsx`.
- Modify: `.env.example` (root, create it if missing). Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY=`.
- Test: `components/vaises/__tests__/DateInquiryPanel.test.tsx`, `src/services/vaises/__tests__/dateInquiry.test.ts`

**Interfaces:**
- Produces:
  - `class ApiError extends Error { code: string; status: number; retryAfterSeconds?: number; requestId?: string }`.
  - `async function apiFetch<T>(path: string, init?: RequestInit): Promise<T>`, which prefixes `/api/v1`, sends and receives JSON, includes credentials, and throws `ApiError` on non-2xx.
  - `function messageFor(error: unknown): string`, mapping `INVALID_DATE`, `INVALID_CONTACT`, `HUMAN_VERIFICATION_FAILED`, `RATE_LIMITED` and anything else to the spec's Lithuanian messages. The fallback is "Nepavyko išsiųsti. Bandykite dar kartą." For `INTERNAL_ERROR` with a `requestId`, it appends " (klaidos kodas: {requestId})" so the visitor can quote it.
  - `checkDateAvailability(isoDate: string): Promise<DateAvailability>` (signature unchanged).
  - `submitDateInquiry(inquiry: DateInquiry & { idempotencyKey: string; turnstileToken: string }): Promise<void>` and `submitConsultationRequest(contact: ContactValue, opts: { idempotencyKey: string; turnstileToken: string }): Promise<void>`. Both send `locale: "lt"`.

**Optimistic send** in both panels:
- Create `idempotencyKey = crypto.randomUUID()` once per panel open.
- On a valid submit, set `send = "sent"` immediately and fire the request.
- On rejection, set `send = "error"`, keep `contact`, and show `messageFor(error)` in the existing `role="alert"` error slot.
- Retry reuses the same key.
- Remove `MIN_SEND_DISPLAY_MS` and its `withMinimumDuration` wrapping for sends. Keep it for the date check.

- [ ] **Step 1: Write the failing tests**

```ts
test("send shows thank-you immediately, then rolls back with the contact kept on failure", async () => {
  // mock fetch: POST /api/v1/vaises/date-inquiries -> 429 {error:{code:"RATE_LIMITED"}}
  // pick a date, check, type "jonas@pavyzdys.lt", submit
  // expect thank-you text right after submit; after the rejection, the input value is "jonas@pavyzdys.lt"
  // and the alert reads "Per daug užklausų. Pabandykite vėliau."
});
test("retry reuses the idempotency key", async () => { /* two POST bodies, same idempotency_key */ });
test("checkDateAvailability maps API JSON", async () => { /* {availability:"reserved"} -> "reserved" */ });
test("messageFor falls back for unknown codes", () => { /* -> "Nepavyko išsiųsti. Bandykite dar kartą." */ });
test("messageFor shows the request id on INTERNAL_ERROR", () => { /* ApiError{code:"INTERNAL_ERROR", requestId:"abc"} -> ends with "(klaidos kodas: abc)" */ });
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL (no client).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit -p .`. Expected: PASS. Then check by hand against a local API: a real submit creates a row, and the console worker prints both emails.
- [ ] **Step 5: Commit** with the message `feat(vaises): live date check and optimistic submissions`.

---

### Task 11: Admin sign-in and admin guard

**Files:**
- Create: `pages/admin/login.tsx`
- Create: `src/lib/admin/requireSuperadmin.ts`
- Create: `components/admin/AdminLayout.tsx`. The shell for admin pages: brand, nav links "Užklausos" and "Datos", and "Atsijungti" (calls `POST /api/v1/auth/logout`).
- Create: `src/lib/i18n/admin.lt.ts`. All admin copy lives here, keyed for later EN.
- Test: `pages/admin/__tests__/login.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` and `messageFor` (Task 10).
- Produces: `async function requireSuperadmin(ctx: GetServerSidePropsContext): Promise<{ redirect: Redirect } | { props: {} }>`. It forwards the `cookie` header to `${API_ORIGIN}/api/v1/auth/me`, and redirects to `/admin/login?next=<path>` on 401 or 403 or when `account_type !== "superadmin"`. Each admin page's `getServerSideProps` uses it.

- [ ] **Step 1: Write the failing tests:**
  - Wrong credentials show "Neteisingas el. paštas arba slaptažodis." under the form.
  - The submit button is disabled while the request is in flight.
  - On success it navigates to `next` or `/admin/vaises/uzklausos`.
  - Email and password inputs have visible labels.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** The layout is mobile-first, uses the existing `--bg-main` and `--text-primary` tokens, and has 44px targets.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit -p .`. Expected: PASS. Then check by hand: `/admin/vaises/datos` redirects to login when signed out.
- [ ] **Step 5: Commit** with the message `feat(admin): superadmin sign-in and guard`.

---

### Task 12: Admin blocked-dates page

**Files:**
- Create: `pages/admin/vaises/datos.tsx`
- Create: `components/admin/vaises/BlockedDatesCalendar.tsx`. It reuses `buildMonthCells`, `LT_MONTHS`, `LT_WEEKDAYS_SHORT`, `formatFullDateLt` and `formatLongDateLt` from `src/lib/vaises/dateInquiry.ts`.
- Create: `src/services/admin/vaises.ts`
- Test: `components/admin/vaises/__tests__/BlockedDatesCalendar.test.tsx`

**Interfaces:**
- Produces:
  - `listBlockedDates(from: string, to: string): Promise<string[]>`
  - `blockDate(isoDate: string, idempotencyKey: string): Promise<void>`
  - `unblockDate(isoDate: string): Promise<void>`
  - The calendar takes `props: { initialBlocked: string[]; month: MonthCursor }` and owns its optimistic state.

**Behaviour:**
- Clicking a day toggles its local state at once and calls the API.
- On rejection it restores the previous state, keeps focus on that day button, and shows `Nepavyko užblokuoti {formatLongDateLt(date)}. Bandykite dar kartą.` (or "atblokuoti" for unblock) in a `role="alert"` region under the calendar.
- Blocked days use `aria-pressed="true"` and the ink fill.
- A list of upcoming blocked dates sits below.
- The page loads 13 months from today in `getServerSideProps`.

- [ ] **Step 1: Write the failing tests**

```tsx
test("toggle is optimistic", async () => { /* click 14 -> aria-pressed true before fetch resolves */ });
test("failed block rolls back, keeps focus, names the date", async () => {
  // fetch rejects -> aria-pressed false, document.activeElement is the 14th's button,
  // alert text "Nepavyko užblokuoti 2026 m. lapkričio 14 d. Bandykite dar kartą."
});
test("past days are disabled", () => { /* matches the public calendar */ });
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit -p .`. Expected: PASS. Then check by hand at 390px and 1280px wide.
- [ ] **Step 5: Commit** with the message `feat(admin): Vaises blocked-dates calendar`.

---

### Task 13: Admin requests page

**Files:**
- Create: `pages/admin/vaises/uzklausos.tsx`
- Create: `components/admin/vaises/RequestsList.tsx`
- Modify: `src/services/admin/vaises.ts`
- Test: `components/admin/vaises/__tests__/RequestsList.test.tsx`

**Interfaces:**
- Produces:
  - `listRequests(status: "new" | "handled", cursor?: string): Promise<{ items: VaisesRequestOut[]; next_cursor: string | null }>`
  - `markHandled(id)`, `reopen(id)` and `erase(id)`, each returning `Promise<VaisesRequestOut>`.
  - `type VaisesRequestOut` mirrors the backend schema from Task 8.

**Behaviour:**
- **Tabs:** "Naujos" and "Atsakytos". "Rodyti daugiau" uses the cursor.
- **Rows:** kind, `event_date_label`, availability at submit, a contact link (`mailto:` or `tel:`), and arrival time in Vilnius.
- **"Pažymėti atsakytu":** removes the row at once and shows "Pažymėta atsakytu · Atšaukti" for 5 s. Undo restores the row and calls `reopen`. The API call is sent immediately, not after the 5 s. On failure the row returns with an error naming the request's date or "konsultacija".
- **"Ištrinti kontaktus":** opens a confirm dialog (a native `<dialog>` or the project's dialog primitive, with focus trapped and Esc to close). Confirm is optimistic.
- **`?id=`:** scrolls to and highlights the request, fetching it via `GET /requests/{id}` if it isn't on the first page.
- **States:** a skeleton while loading; the empty states "Naujų užklausų nėra" and "Atsakytų užklausų dar nėra"; an error with "Bandyti dar kartą".

- [ ] **Step 1: Write the failing tests:**
  - Mark handled removes the row before fetch resolves.
  - Undo within 5 s calls `reopen` and restores the row.
  - A failed handle restores the row with the error.
  - Erase requires confirmation.
  - The empty state renders.
  - `?id=` highlights the matching row.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit -p .`. Expected: PASS. Then do an end-to-end check by hand:
  1. Submit on `/vaises`.
  2. The owner email appears in the console worker, and its link opens the highlighted row.
  3. Mark it handled, then undo.
- [ ] **Step 5: Commit** with the message `feat(admin): Vaises requests list`.
