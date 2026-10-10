# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Hosts (newlyweds), primary.** Lithuanian couples planning a wedding or another celebration. They build the invitation, manage the guest list and RSVPs, and, as the platform grows, coordinate the vendors working their event. One account per couple; the partner can join as co-owner.
- **Guests.** Open a private invitation link, usually on a phone, confirm attendance, add a plus-one where allowed, and choose a menu option. They have no account.
- **Service providers.** Caterers, photographers, videographers, DJs, decorators, organisers, florists and venues working a specific event. They connect to the event through a link from the couple and see what they need for that event.
- **Superadmin.** The platform operator: fixes auth problems, manages plans and entitlements, repairs connections, edits site content, reads the audit log.

## Product Purpose

ta-proga (taproga.com) gives a couple one place to invite their guests and run their celebration: a designed digital invitation with RSVP and menu choice, a guest list they manage, and paid per-event plans that unlock more (photos, storage). Success is a couple whose guests answered on time and whose vendors worked from the same, current information.

## Positioning

Vendor coordination is the core. The couple, their guests and their vendors work from one shared event: the caterer sees real menu counts, allergies and table breakdowns; every connected service sees the same schedule, contacts and moodboard; a change the couple makes reaches everyone. A plain invitation site can't truthfully claim this, because its data stops at the RSVP.

## Operating Context

- Guests arrive from a link sent by the couple, mostly on phones, often once, with no account and no patience for setup.
- Hosts work over weeks before the event: building the invitation, chasing RSVPs, exporting guest lists.
- Weddings are time-critical: dates, RSVP deadlines and schedules are in the couple's local time (Europe/Vilnius by default, DST-aware).
- **Vaises** (`/vaises`) is the owner's own catering and events business. It lives in this codebase as its own brand page, with its own palette and type, separate from the invitation product's look.

## Capabilities and Constraints

- **Shipped:** invitation builder and templates (`/kvieciam`, `/builder`), guest RSVP with plus-one and menu choice, host dashboard with guest export, event photos for higher plans, Stripe per-event payments and storage renewal.
- **Planned** (docs/roadmap-fastapi-migration.md): FastAPI backend replacing Supabase; vendor connection by link with couple approval; shared schedule, seating, moodboard and contacts; per-vendor questionnaires; the caterer's aggregated menu and allergy view; media galleries.
- **Plans:** `planning`, `invite_planning`, `full`, bought per event. Exact entitlements are open until the roadmap's §9 questions are answered.
- **Vaises:** the date check and the inquiry and consultation forms are UI-complete, but their service calls are placeholders (`src/services/vaises/dateInquiry.ts`). No real availability data exists yet.
- **Terminology:** UI copy is Lithuanian. "Kvieciam" is the invitation product, "Vaises" the catering brand.

## Brand Commitments

- Lithuanian is the primary language. Copy uses correct Lithuanian typography („…“ quotes, `lt-LT` dates). English is planned later, so new copy should go through a translation layer instead of being hardcoded.
- Vaises's "Misija" panel copy was signed off as final on 2026-10-06. Don't rewrite it.
- `/vaises` keeps a single light palette on purpose (docs/decisions.md, 2026-10-09).

## Evidence on Hand

- Vaises photos: `public/home-photos/vaises-hero/` (landing, misija, renginiai, vestuves, komanda). `uzkandziai.jpg` is still missing.
- Template previews and mockups: `public/template-*`.
- **None yet:** testimonials, customer counts, press, pricing pages, past-event case studies, team names or bios. Don't invent any of these. Vaises's reply-time promise and service area are also unconfirmed.

## Product Principles

1. **One source of truth per fact.** A date, schedule item or menu choice is entered once and every party sees the same value. Never ask the couple to retype what the platform already knows.
2. **Guests get zero friction.** No account, no install, one link, done on a phone in under a minute.
3. **The couple owns the event.** Vendors see what the couple approved, nothing more, and every vendor's access is visible and revocable.
4. **Time is local and exact.** Dates and deadlines are shown and stored with the event's timezone. Never assume a server offset.
5. **Lithuanian first, translatable always.**

## Accessibility & Inclusion

WCAG 2.1 AA as the minimum, in every theme a screen ships: 4.5:1 body text, keyboard-operable flows, visible focus, 44px touch targets. The guest RSVP path serves every guest on the list, of any age or device, with no chance to train them, so it gets readable type and plain-language errors before anything else.
