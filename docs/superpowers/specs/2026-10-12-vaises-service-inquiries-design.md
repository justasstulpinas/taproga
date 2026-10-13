# Vaises service inquiries — design

Date: 2026-10-12 · Status: awaiting review · Extends `2026-10-10-vaises-backend-design.md` (shipped on branch `vaises-backend`)

## Goal

Visitors can inquire about **Užkandžiai**, **Renginiai** or **Vestuvės**, not only Vestuvės. Each inquiry records which service it is for and can carry a short optional message. The owner sees the service and the message in the admin and in the notification email.

**Done when:** from each of the three service panels a visitor picks a date, sees whether it is free, optionally writes up to 50 words, leaves a contact and sends. The owner's email subject names the service, and the admin row shows the service and the message.

## Decisions confirmed with the owner

| Topic | Decision |
|---|---|
| Services | `uzkandziai`, `renginiai`, `vestuves`. |
| Availability | One shared calendar. A blocked date is taken for all three services. |
| Misija and Komanda | Unchanged: contact-only consultation, no date, no message. Shown in the admin as "Konsultacija". |
| Message | Optional. At most 50 words. |
| Flow | Separate steps: date → result → message → contact. |

## Data model

New reversible migration `0004` (`down_revision = "0003"`) adds to `vaises_requests`:

| Column | Type | Notes |
|---|---|---|
| `service` | enum `uzkandziai` / `renginiai` / `vestuves`, nullable, indexed | Null for consultations. CHECK: not null when `kind = date_inquiry`, null when `kind = consultation`. |
| `message_encrypted` | text, nullable | The message encrypted with `FieldEncryptor`. It is free text that often contains names or phone numbers, so it is treated like the contact. |

- **Data migration:** existing `date_inquiry` rows get `service = 'vestuves'`, because Vestuvės was the only service with a date flow. The downgrade drops both columns.
- **Anonymisation:** `message_encrypted` joins `ANONYMISED_COLUMNS`. Admin "Ištrinti kontaktus" and the 24-month retention job therefore clear it too.

## API

`POST /api/v1/vaises/date-inquiries` body becomes `{date, service, message?, contact, locale, idempotency_key, turnstile_token}`. Unknown fields are still rejected.

- `service`: required, one of the three values.
- `message`: optional.
  - Leading and trailing whitespace is trimmed.
  - An empty value is stored as null.
  - At most **50 words** (counted as runs of non-whitespace) and at most **600 characters**.
  - Breaking either limit returns 422 with the new code `MESSAGE_TOO_LONG`, through the same validation-error mapping used for `INVALID_DATE`.

`POST /api/v1/vaises/consultation-requests` is unchanged.

The admin `VaisesRequestOut` gains:
- `service` (nullable);
- `message`, decrypted for the admin only, and null once anonymised.

The availability endpoint is unchanged (one shared calendar).

## Emails

**Owner notification:**
- **Subject:** "Nauja užklausa · {Paslauga}: {date}". `Paslauga` is "Užkandžiai", "Renginiai" or "Vestuvės". Consultations keep "Nauja konsultacijos užklausa".
- **Body:** gains a "Paslauga" line and, when present, the message. Both are HTML-escaped like every other payload value.
- **New payload keys:** `service_label` and `message` (both may be empty). Empty lines are omitted, as they are today.

The visitor receipt is unchanged.

## Admin

- **Kind label:** the small label above the date shows the service in caps ("VESTUVĖS", "RENGINIAI", "UŽKANDŽIAI") instead of "Datos užklausa". Consultations keep "Konsultacija" as their title.
- **Message:** shown under the date and status line in muted text, wrapping. It is absent when there is none, and when the contact has been erased.

## Visitor flow (`DateInquiryPanel`)

The panel takes a `service` prop.
- **Užkandžiai and Renginiai** switch from `ConsultationPanel` to `DateInquiryPanel` with their service.
- **Vestuvės** passes `vestuves`.
- **Misija and Komanda** keep `ConsultationPanel`.

**Steps** (one at a time, inside the existing side panel):

1. **Date:** calendar → "Tikrinti", as today.
2. **Result:** "Jūsų data laisva" or "Data jau rezervuota", the date line, and the existing subtitle, with "Keisti datą". The primary button becomes **"Toliau"**.
3. **Message:**
   - Label: "Papasakokite trumpai apie savo šventę (nebūtina)".
   - A textarea, with a live counter "N / 50 žodžių".
   - Over 50 words: the counter turns into the error colour, an inline message reads "Ne daugiau kaip 50 žodžių.", and "Toliau" is disabled.
   - "Atgal" returns to the result step.
4. **Contact:**
   - The existing contact field and validation.
   - **"Siųsti užklausą"** sends.
   - "Atgal" returns to the message step, and the typed message is kept.
5. **Sent:** the short thank-you as now. Sending stays optimistic. On failure it rolls back to the contact step with the error, and both the message and the contact are kept.

**Focus and state:**
- Each step moves keyboard focus to its first field or heading.
- The step's buttons stay in the pinned action row on mobile.
- Changing the date resets to step 1 and clears the idempotency key. It does **not** clear the typed message.

Copy lives with the panel's existing strings.

## Testing

**Backend (pytest):**
- **Submitting:**
  - service required, and an invalid value returns 422;
  - the message is trimmed, and an empty message is stored as null;
  - exactly 50 words is accepted, 51 is rejected with `MESSAGE_TOO_LONG`, and so is anything over 600 characters;
  - the message is stored encrypted and never logged;
  - the notification subject and body include the service and the escaped message.
- **Admin and retention:**
  - the admin output includes the service and the decrypted message;
  - erase and retention clear the message.
- **Migration:** existing date inquiries get `vestuves`, the CHECK constraint holds, and upgrade and downgrade are reversible.

**Frontend (Vitest):**
- each of the three service panels sends its own `service`;
- the steps move in order, and "Atgal" keeps entered text;
- the counter, and the over-limit state disabling "Toliau";
- a failed send restores the contact step with the message and contact intact;
- Misija and Komanda still show the contact-only form.

## Out of scope

Per-service calendars, a service picker on Misija or Komanda, filtering the admin by service, and changes to the visitor receipt.
