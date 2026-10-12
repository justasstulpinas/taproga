# Vaises Service Inquiries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Date inquiries record their service (Užkandžiai, Renginiai, Vestuvės) and an optional message of up to 50 words. The owner sees both in the admin and in the notification email. All three service panels use a four-step date → result → message → contact flow.

**Architecture:**
- **Backend:** extends the shipped Vaises module in `api/`, with a migration, schemas, service, email template and admin output.
- **Frontend:** generalises `DateInquiryPanel` with a `service` prop and step state. Užkandžiai and Renginiai switch to it from `ConsultationPanel`.

**Tech Stack:**
- Backend: FastAPI, SQLAlchemy 2.0 async, Alembic, Pydantic v2, pytest (warnings are errors), ruff, mypy strict.
- Frontend: Next.js 16 Pages Router, React 19, Vitest + Testing Library (no jest-dom).

**Spec:** `docs/superpowers/specs/2026-10-12-vaises-service-inquiries-design.md`. It extends `docs/superpowers/specs/2026-10-10-vaises-backend-design.md`.

## Global Constraints

- **Services:** `uzkandziai`, `renginiai`, `vestuves`.
  - LT labels: "Užkandžiai", "Renginiai", "Vestuvės".
  - Admin caps labels: "UŽKANDŽIAI", "RENGINIAI", "VESTUVĖS".
- **One shared calendar:** the availability logic is unchanged.
- **Misija and Komanda** keep `ConsultationPanel`, the consultation endpoint is unchanged, and their `service` is null.
- **Message:**
  - optional;
  - trimmed, with empty stored as null;
  - at most 50 words, counted as runs of non-whitespace (`\S+`, Unicode), and at most 600 characters;
  - a violation returns 422 `MESSAGE_TOO_LONG`.
- **Message privacy:** stored encrypted (`message_encrypted`, `FieldEncryptor`). It is never logged and never put in audit `before`/`after`, and it is cleared by erase and retention (it joins `ANONYMISED_COLUMNS`).
- **Migration** `0004`, `down_revision = "0003"`, reversible, with frozen enum tuples and no app imports. Existing `date_inquiry` rows get `service = 'vestuves'`.
- **CHECK constraint:** `service` is not null when `kind = 'date_inquiry'` and null when `kind = 'consultation'`.
- **Owner email:**
  - subject "Nauja užklausa · {service_label}: {date_label}"; consultations keep "Nauja konsultacijos užklausa";
  - new payload keys `service_label` and `message`, both possibly empty and both HTML-escaped; empty lines are omitted.
- **Receipt:** unchanged.
- **Flow copy:**
  - Result step primary button: "Toliau".
  - Message label: "Papasakokite trumpai apie savo šventę (nebūtina)".
  - Counter: "N / 50 žodžių".
  - Over-limit error: "Ne daugiau kaip 50 žodžių.".
  - Back button: "Atgal".
  - Send button: "Siųsti užklausą".
- **Checks:**
  - Backend, from `api/`: `uv run pytest`, `uv run ruff check . && uv run ruff format --check .`, `uv run mypy`.
  - Frontend, from the worktree root: `npm test` and `npx tsc --noEmit -p .`.
- Commit on `vaises-backend` at the end of every task.

## Review Focus

1. **A message of only whitespace or newlines:** stored as null, not as an empty or blank string. Pinned in Task 2.
2. **Exactly 50 words including Lithuanian words and emoji** (e.g. "Ačiū 🎉"): accepted. 51 words is rejected. Pinned in Task 2.
3. **One 601-character "word" with no spaces:** rejected by the character cap even though it is a single word. Pinned in Task 2.
4. **HTML or `{braces}` in the message:** escaped in the owner email's HTML and never re-interpreted as a template field. Pinned in Task 3.
5. **Changing the date after typing a message:** the flow goes back to step 1, but the message is still there when the visitor returns to the message step. Pinned in Task 4.

---

### Task 1: Service and message columns

**Files:**
- Modify: `api/app/models/vaises.py`
- Create: `api/migrations/versions/20261012_1200_0004_vaises_service_message.py`
- Test: `api/tests/test_vaises_models.py` and `api/tests/test_migrations.py`

**Interfaces:**
- Produces:
  - `class Service(StrEnum): UZKANDZIAI = "uzkandziai"; RENGINIAI = "renginiai"; VESTUVES = "vestuves"` and `SERVICE_LABELS_LT: Mapping[Service, str]` in `app/models/vaises.py`.
  - `VaisesRequest.service: Mapped[Service | None]` (indexed) and `VaisesRequest.message_encrypted: Mapped[str | None]` (Text).
  - `ANONYMISED_COLUMNS = ("contact_kind", "contact_encrypted", "contact_hash", "message_encrypted")`.
  - CHECK `service_matches_kind`.

- [ ] **Step 1: Write the failing tests.**
  - In `test_vaises_models.py`: a `date_inquiry` without `service` raises `IntegrityError`, a `consultation` with `service` raises `IntegrityError`, and a `date_inquiry` with `service=Service.RENGINIAI` and a `message_encrypted` value commits.
  - In `test_migrations.py`: `test_0004_backfills_existing_date_inquiries_as_vestuves`. It upgrades to `0003`, inserts one `date_inquiry` and one `consultation` row with raw SQL, upgrades to `head`, and asserts the inquiry has `service = 'vestuves'` and the consultation has `NULL`. It then downgrades to `0003` and asserts the `service` column is gone. Use the module's existing `alembic_config` fixture.
- [ ] **Step 2: Run** `uv run pytest tests/test_vaises_models.py tests/test_migrations.py -v`. Expected: FAIL (import error for `Service`).
- [ ] **Step 3: Implement the model changes and migration `0004`.**
  - **Upgrade** with `batch_alter_table`:
    1. add `service` as nullable;
    2. run `UPDATE vaises_requests SET service = 'vestuves' WHERE kind = 'date_inquiry'`;
    3. add `message_encrypted`, the index, and the CHECK.
  - **Downgrade:** drops them.
- [ ] **Step 4: Run** the same tests plus `test_migrations_match_models_and_are_reversible`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(vaises): service and message columns`.

---

### Task 2: Accept, validate and store service and message

**Files:**
- Modify: `api/app/schemas/vaises.py`, `api/app/services/vaises.py`, `api/app/error_codes.py`, `api/app/errors.py`, `api/app/routers/admin_vaises.py` (output build)
- Test: `api/tests/test_vaises_submit.py`, `api/tests/test_admin_vaises_requests.py`, `api/tests/test_vaises_retention.py`

**Interfaces:**
- Consumes: `Service` and `ANONYMISED_COLUMNS` (Task 1).
- Produces:
  - `MESSAGE_MAX_WORDS = 50` and `MESSAGE_MAX_CHARS = 600`.
  - `MessageField = Annotated[str | None, BeforeValidator(clean_message)]`. `clean_message` trims, returns `None` when empty, and raises `PydanticCustomError("message_too_long", ...)` past either limit.
  - `DateInquiryIn` gains `service: Service` (required) and `message: MessageField = None`. `ConsultationIn` is unchanged and still rejects a `message` field.
  - `ErrorCode.MESSAGE_TOO_LONG` mapped to 422 in `_CODE_BY_VALIDATION_TYPE`.
  - `VaisesService.submit_date_inquiry` stores `service` and `message_encrypted = encryptor.encrypt(message)` when present.
  - `VaisesService.reveal_message(request: VaisesRequest) -> str | None`.
  - `VaisesRequestOut` gains `service: Service | None` and `message: str | None`, decrypted only in the admin output.

- [ ] **Step 1: Write the failing tests** (in `test_vaises_submit.py` unless noted)

```python
async def test_service_is_required(client): ...            # body without "service" -> 422 VALIDATION_ERROR
async def test_unknown_service_rejected(client): ...      # "service": "misija" -> 422 VALIDATION_ERROR
async def test_message_is_trimmed_and_encrypted(client, sessionmaker): ...
    # message "  Mums reikia vakarienės 80 svečių.  " -> row.message_encrypted decrypts to the trimmed text,
    # != plaintext; row.service == Service.RENGINIAI; the message appears in no log record (caplog)
@pytest.mark.parametrize("blank", ["", "   ", "\n\t "])
async def test_blank_message_stored_as_null(client, sessionmaker, blank): ...   # Review Focus 1
async def test_fifty_words_with_lithuanian_and_emoji_accepted(client): ...      # Review Focus 2: " ".join(["žodis"] * 48 + ["Ačiū", "🎉"]) -> 202
async def test_fifty_one_words_rejected(client): ...      # 422 MESSAGE_TOO_LONG, no row written
async def test_single_601_char_word_rejected(client): ... # Review Focus 3: "a" * 601 -> 422 MESSAGE_TOO_LONG
async def test_consultation_rejects_message_field(client): ...  # 422 VALIDATION_ERROR
```

In `test_admin_vaises_requests.py`: the list and the single GET include `service` and the decrypted `message`, and a consultation has `service: null` and `message: null`. Erase sets `message` to null.

In `test_vaises_retention.py`: the existing bulk-versus-`anonymise()` equality test now also covers `message_encrypted` (it iterates `ANONYMISED_COLUMNS`). Add a row with a message so the column is non-null before anonymisation.

- [ ] **Step 2: Run** `uv run pytest tests/test_vaises_submit.py tests/test_admin_vaises_requests.py tests/test_vaises_retention.py -v`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Existing tests that post date inquiries without `service` must be updated to send `"service": "vestuves"`. Also update the shared helper in `tests/test_vaises_submit.py` if one builds the body.
- [ ] **Step 4: Run** the full backend checks. Expected: all green.
- [ ] **Step 5: Commit** with the message `feat(vaises): store service and optional message on date inquiries`.

---

### Task 3: Service and message in the owner notification

**Files:**
- Modify: `api/app/emails/templates.py` and `api/app/services/vaises.py` (owner payload)
- Test: `api/tests/test_vaises_emails.py` and `api/tests/test_vaises_submit.py`

**Interfaces:**
- Consumes: `SERVICE_LABELS_LT` (Task 1) and stored `service`/`message` (Task 2).
- Produces:
  - Owner payload keys `service_label` (empty for consultations) and `message` (decrypted plaintext from the request body, empty when none).
  - LT subject `"Nauja užklausa · {service_label}: {date_label}"`; `subject_without_date` stays.
  - Body lines "Paslauga: {service_label}" and "Žinutė: {message}", each omitted when empty, with EN equivalents.

- [ ] **Step 1: Write the failing tests**

```python
def test_owner_subject_names_the_service():
    m = render_email(OWNER, Locale.LT, "o@x.lt", {**base, "service_label": "Vestuvės", "message": ""})
    assert m.subject == "Nauja užklausa · Vestuvės: 2026 m. lapkričio 14 d."
    assert "Žinutė" not in m.text
def test_message_is_escaped_and_not_reinterpreted():   # Review Focus 4
    m = render_email(OWNER, Locale.LT, "o@x.lt", {**base, "service_label": "Renginiai", "message": "<b>hi</b> {date_label}"})
    assert "&lt;b&gt;hi&lt;/b&gt; {date_label}" in m.html
    assert "<b>hi</b> {date_label}" in m.text
def test_consultation_subject_unchanged(): ...         # empty date_label/service_label -> "Nauja konsultacijos užklausa"
```

In `test_vaises_submit.py`: the queued owner email's payload has `service_label == "Renginiai"` and the message. The receipt payload is unchanged.

- [ ] **Step 2: Run** `uv run pytest tests/test_vaises_emails.py tests/test_vaises_submit.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement.** The message reaches the outbox only in the owner payload, and the worker already clears payloads after delivery.
- [ ] **Step 4: Run** the full backend checks. Expected: green.
- [ ] **Step 5: Commit** with the message `feat(vaises): service and message in owner notification`.

---

### Task 4: Four-step flow for all three services

**Files:**
- Modify: `src/services/vaises/dateInquiry.ts`, `components/vaises/DateInquiryPanel.tsx`, `pages/vaises/index.tsx`, `styles/globals.css` (message step styles, using `--vaises-*` tokens)
- Test: `components/vaises/__tests__/DateInquiryPanel.test.tsx` and `src/services/vaises/__tests__/dateInquiry.test.ts`

**Interfaces:**
- Produces:
  - `type VaisesService = "uzkandziai" | "renginiai" | "vestuves"`.
  - `DateInquiry` gains `service: VaisesService` and `message: string`.
  - `submitDateInquiry` sends `service` and sends `message` only when non-blank.
  - `countWords(text: string): number`, which counts `\S+` runs, in `src/lib/vaises/dateInquiry.ts`.
  - `DateInquiryPanel` props gain `service: VaisesService`.
  - In `pages/vaises/index.tsx`, the `detailCta` union becomes `{ kind: "date-inquiry"; service: VaisesService } | { kind: "consultation" }`:
    - Užkandžiai, Renginiai and Vestuvės use `date-inquiry` with their service and the label "Teirautis dėl datos".
    - Misija and Komanda use `consultation`.

**Step state:** `"date" | "result" | "message" | "contact" | "sent"`.
- The existing `check`/`send` states fold into it. Optimistic send, the stale-send key guard and the idempotency-key rules are kept.
- A failed send returns to `"contact"`, keeping both the contact and the message.
- Changing the date returns to `"date"` and clears the key but keeps the message.
- Each step change focuses its heading or first field.

- [ ] **Step 1: Write the failing tests**

```tsx
test.each([["uzkandziai"], ["renginiai"], ["vestuves"]])("sends service %s", ...)      // POST body.service matches the prop
test("steps go date → result → message → contact, and Atgal keeps typed text", ...)
test("counter shows N / 50 žodžių; 51 words shows 'Ne daugiau kaip 50 žodžių.' and disables Toliau", ...)
test("changing the date keeps the typed message", ...)                                  // Review Focus 5
test("a failed send returns to the contact step with message and contact intact", ...)
test("blank message is not sent", ...)                                                  // body has no "message" key
```

In `dateInquiry.test.ts`: `countWords("  Ačiū 🎉  labai\nlaukiame ")` returns `4`, and `countWords("")` returns `0`.

- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - Update the page wiring so Užkandžiai and Renginiai render `DateInquiryPanel`.
  - Keep `ConsultationPanel` for Misija and Komanda.
  - Existing panel tests that pass no `service` should use `service="vestuves"`.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit -p .`. Expected: green. Then check by hand on `http://localhost:3100/vaises` at 390px and 1280px: all three services reach the message and contact steps, and Misija still opens the contact-only form.
- [ ] **Step 5: Commit** with the message `feat(vaises): service-aware date → message → contact flow`.

---

### Task 5: Service and message in the admin list

**Files:**
- Modify: `src/services/admin/vaises.ts`, `components/admin/vaises/RequestsList.tsx`, `src/lib/i18n/admin.lt.ts`, `styles/globals.css` (`.admin-request-message`)
- Test: `components/admin/vaises/__tests__/RequestsList.test.tsx`

**Interfaces:**
- Consumes: `VaisesRequestOut.service` and `.message` (Task 2).
- Produces:
  - The TS `VaisesRequestOut` gains `service: "uzkandziai" | "renginiai" | "vestuves" | null` and `message: string | null`.
  - `adminLt.requests.serviceLabels: Record<service, string>`, equal to `{ uzkandziai: "Užkandžiai", renginiai: "Renginiai", vestuves: "Vestuvės" }`. The caps come from CSS, like the current kind label.

**Behaviour:**
- A date inquiry's small label shows its service label instead of "Datos užklausa". The row's `aria-label` uses the service label too.
- The message appears under the meta line as `<p className="admin-request-message">`: muted, wrapping, `white-space: pre-line`.
- It is absent when null or when the request is erased.

- [ ] **Step 1: Write the failing tests:**
  - A renginiai request shows "Renginiai" and its message.
  - A consultation still shows "Konsultacija" with no message.
  - An erased request shows no message.
  - A message with a newline keeps the line break (check `textContent` and the class).
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit -p .`. Expected: green.
- [ ] **Step 5: Commit** with the message `feat(admin): show service and message on Vaises requests`.
