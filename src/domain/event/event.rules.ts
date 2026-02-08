import { NewEventInput } from "@/src/domain/event/event.types";
import { EventForRSVP } from './event.types';

export function slugifyEventTitle(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[ą]/g, "a")
    .replace(/[č]/g, "c")
    .replace(/[ęė]/g, "e")
    .replace(/[į]/g, "i")
    .replace(/[š]/g, "s")
    .replace(/[ųū]/g, "u")
    .replace(/[ž]/g, "z")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildUniqueSlug(baseSlug: string, existingCount: number | null): string {
  return existingCount && existingCount > 0
    ? `${baseSlug}-${existingCount + 1}`
    : baseSlug;
}

export function buildVerificationPhrase(slug: string): string {
  return `kviečiame į ${slug.toLowerCase()} šventę`;
}

export function buildEventDate(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+02:00`); // Europe/Vilnius
}

export function getNewEventValidationError(
  input: Pick<NewEventInput, "title" | "date" | "time">
): string | null {
  if (!input.title.trim()) {
    return "Title is required";
  }
  if (!input.date) {
    return "Date is required";
  }
  if (!input.time) {
    return "Time is required";
  }
  return null;
}

export type RSVPDecision =
  | 'allowed'
  | 'event_not_active'
  | 'guest_access_disabled'
  | 'rsvp_closed';

export function canGuestRSVP(
  event: EventForRSVP,
  now: Date
): RSVPDecision {
  if (event.state !== 'active') {
    return 'event_not_active';
  }

  if (!event.guest_access_enabled) {
    return 'guest_access_disabled';
  }

  if (event.rsvp_deadline) {
    const deadline = new Date(event.rsvp_deadline);
    if (now > deadline) {
      return 'rsvp_closed';
    }
  }

  return 'allowed';
}

export function canGuestViewEvent(event: { state: string; guest_access_enabled: boolean }): boolean {
  const PUBLIC_STATE = 'active';

  if (event.state !== PUBLIC_STATE) {
    return false;
  }

  if (!event.guest_access_enabled) {
    return false;
  }

  return true;
}
