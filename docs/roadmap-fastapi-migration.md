# Implementation Plan — FastAPI Migration & Platform Expansion

Status: **draft, awaiting confirmation of open questions (§9)**. No production code until those are answered.
Scope rule: **visual design and layout stay as they are.** New screens reuse existing components, tokens, fonts and panel styles; they don't introduce a new design language.

---

## 0. Current State (what we're migrating from)

| Area | Today | Notes found while reading the code |
| --- | --- | --- |
| Frontend | Next.js 16, Pages Router, Tailwind v4, framer-motion | Keep. |
| Data | Supabase Postgres: `events`, `guests`, `menus` / `event_menus`, `event_photos` | `guest.write.ts` reads `menus` but `menu.write.ts` writes `event_menus` — two menu tables. `guests` has both `rsvp` and `rsvp_status`. `events` has both `event_date` and `wedding_date`. |
| Ownership | RLS by `host_email = auth.email()`; storage RLS by `host_id = auth.uid()` | Two different ownership keys. New model: `owner_user_id` only. |
| Auth | Supabase Auth (password + magic link), client-side session in localStorage/cookies | Replace entirely. |
| Guest access | Name + selected phrase → HMAC guest token (`guest.session.ts`, 12h) | Phrase is derived from the public slug (`kviečiame į {slug} šventę`), so anyone with the URL can pass it. |
| Event content | `events.panels` JSONB (panel list incl. schedule items inside the schedule panel) | Schedule must become first-class data (§3.5) because it now feeds services and media tags. |
| Photos | `event-photos` bucket, base64 upload through Next API, tier ≥ 3, storage expiry + grace, Stripe renewal | Declared MIME only (`image/jpeg`), no content sniffing, no EXIF strip. |
| Payments | Stripe Checkout, per-event tier 1–3, webhook marks paid / renews storage | Keep Stripe, re-map tiers (§3.3). |
| Time | `buildEventDate` hard-codes `+02:00` | Wrong in summer (Vilnius is +03:00 under DST) — i.e. wrong for most weddings. Fix with IANA tz in the new backend. |
| Data access in pages | Several pages (`builder/start.tsx`, `host/[eventId].tsx`, …) import `supabaseClient` / `createSupabaseServerClient` directly | These are the frontend rewiring hot spots. |

No data migration: Supabase is decommissioned after parity (§7, Phase 2).

---

## 1. Target Architecture

```
taproga.com  ──►  Next.js (existing app, UI unchanged)
                    │  browser: fetch('/api/...')           ─┐
                    │  SSR:     server-to-server + cookie fwd ├─► FastAPI  ──► PostgreSQL
                    └  next.config rewrites /api/* ─────────┘      │  ├──► Redis (rate limits, job queue)
                                                                   │  ├──► S3-compatible object storage
                                                                   │  └──► Email provider, Stripe, Turnstile
                                                              Worker (background jobs)
```

**Decision (recommended): keep the frontend talking to a same-origin `/api/*`.** Next rewrites `/api/*` to FastAPI, so:
- auth cookies are first-party on `taproga.com` (`HttpOnly; Secure; SameSite=Lax`), no CORS on the authenticated API;
- existing `src/services/*` functions keep their signatures and get reimplemented over `fetch` → pages change minimally;
- large uploads (photos/video) bypass Next and go **directly to object storage via presigned URLs**, so rewrite body limits don't matter.

**Repo layout (recommended):** monorepo, Next stays at root to avoid churn; backend in `api/`.

```
api/
  app/
    main.py            # app factory, middleware (security headers, request ID, gzip, CORS allowlist)
    settings.py        # single Pydantic Settings
    routers/           # HTTP only
    services/          # business logic, transactions
    repositories/      # all queries; soft-delete + tenant scoping enforced here
    policies/          # authorization decisions
    schemas/           # Pydantic in/out models (separate)
    models/            # SQLAlchemy 2.0 ORM
    jobs/              # background tasks
    i18n/              # email + API message catalogs (lt, en)
  alembic/
  tests/
  pyproject.toml + uv.lock
docker-compose.yml     # postgres, redis, minio (local S3), mailpit, api, worker
```

**Stack:** FastAPI, SQLAlchemy 2.0 async + asyncpg, Alembic, Pydantic v2, Argon2id (`argon2-cffi`), PyJWT, Redis (rate limiting + queue), Celery or Dramatiq worker, `boto3`/`aioboto3` for S3, `python-magic` + Pillow for uploads, `pyotp` for superadmin 2FA, Stripe SDK, structlog (JSON logs), Sentry. Postgres everywhere except optional local SQLite — but since we need JSONB/TIMESTAMPTZ and a Postgres container is one `docker compose up`, **recommend Postgres locally too**.

---

## 2. Identity & Auth

### 2.1 Model
- `users` — id (int PK), public_id (UUIDv4, unique), email (unique, citext), password_hash, email_verified_at, locale, is_superadmin, totp_secret (encrypted, superadmin only), created_at, deleted_at.
- `newlywed_profiles` — 1:1 users; display names (bride/groom or partner A/B), phone.
- `service_profiles` — 1:1 users; business_name, contact_name, phone, email_public, website, instagram, default_service_type.
- A user may hold **one** profile type in v1 (see §9-Q4).
- `refresh_tokens` — hashed, family_id for rotation + reuse detection, revoked_at.
- `auth_tokens` — single-use email verification / password reset, hashed, expires 30 min, used_at.

### 2.2 Flows (all endpoints rate-limited per IP **and** per account, escalating backoff)
- `POST /auth/register` (Turnstile, 12+ chars, breached-password check via HIBP k-anonymity, choose account type) → verification email.
- `POST /auth/verify-email`, `POST /auth/resend-verification`
- `POST /auth/login` → short-lived access JWT (15 min) + rotating refresh token, both HttpOnly cookies. Unverified → specific "verify your email" state, no authenticated actions.
- `POST /auth/refresh`, `POST /auth/logout` (revokes family), `POST /auth/password/forgot` (Turnstile), `POST /auth/password/reset` (revokes all sessions).
- Superadmin: same login + mandatory TOTP step.
- Generic "invalid credentials" everywhere; never reveal whether an email exists.
- Magic-link login: **dropped** unless you want it kept (§9-Q10).

### 2.3 Guest access (no account)
Two separate guest gates, both issuing short-lived signed, HttpOnly guest cookies scoped to one event:
1. **Invitation gate** (existing name + verification UX kept visually) — backed by a per-event random secret instead of the slug-derived phrase.
2. **Media gate** — 6-digit code (§5).

---

## 3. Domain Model

All user-facing records: UUIDv4 `public_id`, `created_at/updated_at` TIMESTAMPTZ, `deleted_at` soft delete. Every FK indexed.

### 3.1 Events
- `events` — owner_user_id, couple_slug (cosmetic), title, event_date (DATE), timezone (IANA, default `Europe/Vilnius`), ceremony/reception times, venue_name/address/lat/lng, plan (§3.3), state, guest_access_enabled, rsvp_deadline (TIMESTAMPTZ), menu_enabled, plus_one_enabled, invite_secret_hash, panels (JSONB — design config only), theme/template_id, last_critical_update_at.
- `event_co_owners` — optional second newlywed login on the same event (§9-Q5).

### 3.2 Guests, RSVP, Menu
- `guests` — event_id, name, email (encrypted), group/household, plus_one_allowed, plus_one_name, plus_one_attending, rsvp_status enum, rsvp_at, menu_option_id, **dietary_notes / allergies** (new; feeds caterer), table_id (seating).
- `menu_options` — one table (resolves `menus` vs `event_menus`), event_id, name, description, is_active, sort_order.

### 3.3 Plans & payments
- `plans` enum: `planning`, `invite_planning`, `full`. Stored on the event (per-event purchase, like today) — confirm (§9-Q2).
- `entitlements` derived from plan in one policy module (`policies/entitlements.py`): can_invite, can_rsvp, can_media, storage_quota, etc. Superadmin comps/overrides write `plan_overrides` + audit entry.
- `payments` — stripe_session_id (unique → idempotent webhook), amount_minor (int cents), currency, kind (`plan_purchase`, `plan_upgrade`, `storage_renewal`), status.
- Storage expiry fields kept (`storage_expires_at`, `storage_grace_until`) for `full`.

### 3.4 Service connection
- `service_types` — controlled vocabulary table (code, i18n label key, enabled actions): photographer, videographer, dj, caterer, decorator, organizer, florist, venue, other. Seeded by migration; editable by superadmin.
- `event_connect_links` — event_id, token (random, hashed), created_by, revoked_at. One active link per event; newlyweds can rotate.
- `event_connections` — event_id, service_profile_id, declared_service_type, status (`pending` / `connected` / `removed`), connected_via (`self_link` / `superadmin_manual`), approved_by, approved_at.
- **Recommended:** a connection starts `pending` and newlyweds approve it, because approval exposes contacts/schedule/seating (§9-Q3).

### 3.5 Planning dashboard ("vital info")
- `schedule_items` — event_id, starts_at (TIMESTAMPTZ), ends_at, title, description, location, sort_order, visible_to_guests. **Single source of truth** for: the invitation's Schedule panel, the services dashboard, and guest-media tags.
- `seating_tables` — event_id, name, capacity, shape, sort_order.
- `seat_assignments` — guest_id (+ plus-one flag), table_id, seat_no nullable. `SELECT … FOR UPDATE` / version column on table capacity.
- `moodboard_items` — event_id, kind (image / link / note), storage_key or url, caption, sort_order. One shared board, newlywed-owned, read-only for services.
- Contacts view — derived from connected `service_profiles` + newlywed profile; no separate table.

### 3.6 Per-service actions
- `questionnaire_templates` — service_type, version, JSON schema of questions (platform-defined in v1).
- `questionnaire_responses` — event_connection_id, template_version, answers JSONB, submitted_at. Service sends → newlyweds answer → service reads.
- Caterer: read-only aggregated view — menu option counts, dietary/allergy list, per-table breakdown. No new table.
- Other service types: base dashboard only in v1 (vital info, schedule, contacts, moodboard) until §9-Q1 is answered.

### 3.7 Media (see §5)
`media_galleries`, `media_items`, `photo_share_grants`, `media_access_attempts`.

### 3.8 Platform
- `audit_log` — append-only (no UPDATE/DELETE grants for the app role), actor_user_id, actor_kind (user/superadmin/guest/system), action, target_type, target_id, before/after JSONB, ip, request_id, at.
- `site_content` — key, locale, value (text/markdown), image storage_key, updated_by — for superadmin-editable copy/photos.

---

## 4. Authorization (policies/)

| Actor | Can |
| --- | --- |
| Newlywed (owner / co-owner) | Everything on own events: edit info, schedule, seating, guests, moodboard, invite, connect link, approve/remove services, answer questionnaires, moderate guest media, view photographer album. |
| Service (connected, status=connected) | Read vital info, schedule, contacts, moodboard; seating read-only (§9-Q7); own-type actions; photographer: upload/manage album, decide share grants; other services: request share grants. |
| Service (pending/removed) | Nothing on that event beyond "waiting for approval". |
| Guest (invite cookie) | Read invitation, submit/modify own RSVP. |
| Media viewer (code cookie) | View galleries per §5; upload to guest pool; delete own uploads. |
| Superadmin | Cross-tenant, every action audited, attributed to the superadmin not the user. |

Every rule gets a negative test (403 for the wrong actor). Tenant scoping (event_id + actor) enforced in repositories.

---

## 5. Photo & Video Storage

**URL:** `taproga.com/{couple-slug}/{gallery_uuid}` → code gate → gallery. Slug is cosmetic; the handler resolves by UUID only and ignores a mismatching slug (redirects to canonical).

- `media_galleries` — event_id, public_id, access_code_hash (6 digits, Argon2), code_rotated_at, enabled. Newlyweds see/rotate code; share via their own channels (platform email optional, §9-Q8).
- Code brute-force protection: 1M combinations is small → per-IP + per-gallery attempt limits with escalating lockout, `media_access_attempts` table, alert on spikes. Successful entry → signed gallery cookie (e.g. 30 days).
- `media_items` — gallery_id, pool (`photographer` / `guest`), kind (photo/video), storage_key, thumb_key, size, width/height/duration, uploader_service_id | uploader_guest_token_hash, uploader_display_name, schedule_item_id (tag, guest pool only), status (`uploading` / `processing` / `ready` / `rejected`), deleted_at, deleted_by_kind.
- Upload flow: `POST /media/uploads` → presigned (multipart for video) URL → client uploads direct to S3 → `POST /media/uploads/{id}/complete` → worker job: magic-byte check against allowlist (jpeg/png/webp/heic → jpeg; mp4/mov), re-encode images + strip EXIF, generate thumbnails / video poster, mark ready. Size caps at storage-policy level and in app.
- Guest "delete own": anonymous uploader token (random, HttpOnly cookie, hash stored on item). Newlyweds can delete any guest item (soft delete + audit).
- Tags: guest pool items tagged with `schedule_items`; gallery filter by tag. Deleting a schedule item → items keep a null tag (or "Other").
- Photographer album: only the connected photographer uploads. Downloads served via short-lived signed URLs with `Content-Disposition: attachment`.
- `photo_share_grants` — gallery_id, photographer_service_id, requested_by_service_id, scope (whole album / selected items), status (`pending` / `approved` / `denied` / `revoked`), required_attribution_text, decided_at. UI shows the attribution text on approved downloads; enforcement is out of platform scope (document in the UI and terms).
- Storage expiry for `full` plan kept (expiry + grace + Stripe renewal); expired → read-only, then purge job after grace.

---

## 6. Frontend Changes (design unchanged)

### 6.1 Plumbing
- Add `src/infra/api.client.ts` (browser fetch, JSON, error mapping, auto-refresh on 401) and `src/infra/api.server.ts` (SSR, forwards cookies). Generate TS types from FastAPI's OpenAPI (`openapi-typescript`) so schemas stay in sync.
- `next.config.ts`: rewrite `/api/:path*` → FastAPI; security headers.
- Remove `@supabase/*`, `src/infra/supabase.*.ts`, `lib/supabaseClient.ts`, `stripe` package from the frontend.
- Delete all `pages/api/*` handlers (logic moves to FastAPI): `rsvp`, `resolve-guest`, `guest/*`, `events/[eventId]/photos/*`, `storage/renew`, `host/.../export-guests`, `stripe/*`, `home/*` (→ `site_content`), `_devs`, `hello`. Also the stray `pages/host/events/uzpisop`.

### 6.2 Rewire existing screens (same markup, new data source)
| File(s) | Change |
| --- | --- |
| `src/services/**` | Reimplement each function over `api.client`/`api.server`, keep signatures where possible. `src/domain/**` rules move to backend policies; frontend keeps only UX-level validation. |
| `pages/login.tsx`, `pages/register.tsx`, `src/ui/host/LoginPage.tsx` | New auth API; register gains account-type step (Newlywed / Service) and Turnstile; strength meter. |
| `pages/builder/start.tsx`, `components/builder/*`, `components/onboarding/*`, `pages/host/new.tsx`, `pages/host/onboarding.tsx` | Draft → `POST /events`; plan selection instead of tier 1–3. |
| `pages/host/[eventId].tsx`, `src/ui/host/HostEventDetailPage.tsx` | Panel editor saves via API. Schedule editor writes `schedule_items` instead of panel content. |
| `pages/host/index.tsx`, `src/ui/host/HostHomePage.tsx` | List events via API. |
| `pages/host/events/[id]/menu.tsx`, `export.tsx` | Menu options + CSV export via API (CSV UTF-8 BOM for Lithuanian chars in Excel). |
| `pages/[slug]/index.tsx`, `[slug]/invite.tsx`, `pages/e/[slug].tsx`, `pages/events/[slug]/*` | Public event + guest session via API. |
| `components/invitation/panels/SchedulePanel.tsx` | Reads event `schedule_items` (visible_to_guests). |
| `components/invitation/panels/RsvpPanel.tsx`, `src/ui/guest/RSVPButtons.tsx`, `components/guest/MenuSelect.tsx` | Add dietary/allergy field (existing field styles). |
| `pages/payment/*`, `components/home/PricingSection.tsx` | Three plans; checkout via API. |
| `pages/home.tsx`, `pages/kvieciam/*`, `pages/vaises/*`, `components/home/*` | Hero photos/copy from `site_content` where superadmin-editable (§9-Q9). |

### 6.3 New screens (built from existing components)
- Auth: `/verify-email`, `/forgot-password`, `/reset-password`, expired/used link states.
- Newlywed planning dashboard `/host/[eventId]/…` tabs: Overview (vital info), Schedule, Guests, Seating (table list + assign; drag-and-drop optional), Services (connect link, pending approvals, contacts), Moodboard, Media. Plan-gated tabs show upgrade CTA.
- Service side: `/connect/[token]` (log in / register as service → declare type → pending), `/service` (my events), `/service/events/[eventId]` (vital info, schedule, contacts, moodboard, type-specific action: questionnaire / caterer view / album upload / share requests).
- Media: `/[coupleSlug]/[galleryId]` code gate → tabs Photographer / Guests, tag filter, upload, delete own.
- Superadmin `/admin`: users & services search, force-verify, trigger reset, unlock, plan override/comp, manual service connection, service types, site content editor, audit log (read-only).
- Error pages: designed 403 and 500 (with correlation ID) alongside existing `404.tsx`.

---

## 7. Phases

Each phase ends with tests green + the Definition of Done checklist.

**Phase 0 — Foundations (backend skeleton)**
`api/` scaffold, Settings, docker-compose (Postgres, Redis, MinIO, Mailpit), Alembic baseline, structured logging + request ID, `/health` (DB + Redis), security headers, error handler (no leaks), ruff + mypy + pytest in CI, pip-audit, gitleaks scan of existing history (`.env.local` is present locally — confirm it was never committed).

**Phase 1 — Auth, accounts, superadmin core, audit log**
Users/profiles, all auth flows, rate limiting, Turnstile, email templates (lt/en, HTML + text), superadmin login + TOTP, audit log, minimal `/admin` (users list, force-verify, reset, unlock). Frontend: api client, login/register/verify/reset screens.

**Phase 2 — Invitation parity → Supabase switch-off**
Events, panels, guests, RSVP, menu options, invite gate, CSV export, Stripe (3 plans) + idempotent webhook, schedule as table. Frontend rewired for builder, host dashboard, public invite. Remove Supabase from code; decommission the project.

**Phase 3 — Planning platform**
Service types, connect link, connection approval, service dashboard, contacts, moodboard, seating, questionnaires, caterer view. Superadmin: manual connect, service account fixes, plan overrides.

**Phase 4 — Media**
Object storage, galleries + code gate, photographer album, share grants, guest pool with tags and moderation, video, processing jobs, storage expiry/renewal.

**Phase 5 — Content CMS + launch hardening**
`site_content` editor, pre-launch checklist (HSTS, CSP, SPF/DKIM/DMARC, backups + restore test, account deletion/export path, load test media uploads).

Rough ordering rationale: Phase 2 before 3 because the planning features need events/guests/schedule; Phase 4 last because it has the most infra and cost risk.

---

## 8. Risks & Dependencies
- **Video storage cost/egress** — unbounded without per-plan quotas; decide quotas before Phase 4. Prefer storage with cheap egress (Cloudflare R2 / Hetzner / Backblaze).
- **Guest PII exposed to services** (names, allergies, seating) — needs clear consent text on RSVP and a GDPR deletion path.
- **6-digit code** is a weak secret by itself — rate limiting is the real control; monitor.
- **Single-dependency bottlenecks:** Stripe (payments), email provider (verification/reset), object storage. Flag, don't abstract prematurely.
- **HEIC from iPhones** — needs `pillow-heif`; otherwise most guest uploads fail.
- **Timeline** — this is effectively a new product on top of the invite; Phases 3–4 are larger than Phases 0–2 combined.

---

## 9. Open Questions (need answers before Phase 0 code)

Recommended defaults in **bold**.

1. **Per-service actions** beyond photographer/videographer/caterer? **v1: base dashboard for all types; questionnaire for photographer + videographer; caterer view. Others later.**
2. **Plans per event or per account?** Prices? Upgrade path planning → invite → full (pay difference)? **Per event, upgrade pays difference.**
3. **Service connection needs newlywed approval?** **Yes — pending until approved; link rotatable.**
4. **One account = one profile type?** (e.g. a photographer who is also getting married) **Yes in v1; use a second email otherwise.**
5. **Both partners log in to the same event?** **Yes — co-owner invite.**
6. **Who can view the guest pool** — guests with code only, or also connected services? **Guests + newlyweds; services not by default.**
7. **Which services see seating/guest names?** **Caterer, organizer, venue; others don't.**
8. **How the 6-digit code reaches guests** — newlyweds share it themselves, or platform emails guests with emails on file? **Newlyweds share; optional email blast later.**
9. **Which site content is superadmin-editable** — landing hero photos + headline copy only, or all marketing pages? **Hero photos, headlines, pricing copy, template gallery.**
10. **Keep magic-link login?** **Drop — password + verification only.**
11. **Hosting** — where do Next and FastAPI run, and which object storage/email provider? (Affects cookie domain and Phase 0.)
12. **Video limits** — max size/duration per upload and total quota per plan.
13. **Planning-only plan and guests** — seating needs a guest list; allow manual guest entry without invitations? **Yes.**
