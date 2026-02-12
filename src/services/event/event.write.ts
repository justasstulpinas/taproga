import { EventState, NewEventInput } from "@/domain/event/event.types";
import { supabaseClient } from "@/infra/supabase.client";
import { requireSession } from "@/services/auth/auth.read";
import { ServiceError } from "@/shared/errors";

function slugifyTitle(title: string): string {
  return title
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

function validateCreateEventInput(input: NewEventInput): {
  title: string;
  eventDateIso: string;
} {
  const title = input.title.trim();

  if (!title) {
    throw new ServiceError("BAD_REQUEST", "Title is required");
  }

  if (!input.event_date) {
    throw new ServiceError("BAD_REQUEST", "Event date is required");
  }

  const parsedDate = new Date(input.event_date);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new ServiceError("BAD_REQUEST", "Event date is invalid");
  }

  return { title, eventDateIso: parsedDate.toISOString() };
}

async function buildUniqueSlug(baseSlug: string): Promise<string> {
  let suffix = 1;
  let candidate = baseSlug || "event";

  while (suffix < 1000) {
    const { count, error } = await supabaseClient
      .from("events")
      .select("id", { head: true, count: "exact" })
      .eq("slug", candidate);

    if (error) {
      throw new ServiceError("SUPABASE_ERROR", error.message, error);
    }

    if (!count) {
      return candidate;
    }

    suffix += 1;
    candidate = `${baseSlug || "event"}-${suffix}`;
  }

  throw new ServiceError("SUPABASE_ERROR", "Failed to generate unique slug");
}

export async function createEvent(input: NewEventInput) {
  const session = await requireSession();
  const hostId = session.user.id?.trim();
  const hostEmail = session.user.email?.trim().toLowerCase();

  if (!hostId) {
    throw new ServiceError("UNAUTHENTICATED", "Host id is required");
  }

  if (!hostEmail) {
    throw new ServiceError("UNAUTHENTICATED", "Host email is required");
  }

  const { title, eventDateIso } = validateCreateEventInput(input);
  const slug = await buildUniqueSlug(slugifyTitle(title));

  const { data, error } = await supabaseClient
    .from("events")
    .insert({
      title,
      event_date: eventDateIso,
      host_id: hostId,
      host_email: hostEmail,
      slug,
      tier: input.tier ?? 1,
      state: EventState.Draft,
    })
    .select("id, slug")
    .single();

  if (error || !data) {
    throw new ServiceError(
      "SUPABASE_ERROR",
      error?.message ?? "Failed to create event",
      error
    );
  }

  return data;
}

export async function toggleGuestAccess(eventId: string, enabled: boolean) {
  if (!eventId.trim()) {
    throw new ServiceError("BAD_REQUEST", "Event id is required");
  }

  const { error } = await supabaseClient
    .from("events")
    .update({ guest_access_enabled: !enabled })
    .eq("id", eventId);

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }
}
