import { NewEventInput } from "@/src/domain/event/event.types";

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
