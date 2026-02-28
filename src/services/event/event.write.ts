import { NewEventInput } from "@/domain/event/event.types";
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

async function buildUniqueSlug(title: string): Promise<string> {
  const baseSlug = slugifyTitle(title) || "event";
  let candidate = baseSlug;

  for (let suffix = 1; suffix < 1000; suffix += 1) {
    const { count, error } = await supabaseClient
      .from("events")
      .select("id", { head: true, count: "exact" })
      .eq("slug", candidate);

    if (error) {
      throw new ServiceError("SUPABASE_ERROR", error.message, error);
    }

    if ((count ?? 0) === 0) {
      return candidate;
    }

    candidate = `${baseSlug}-${suffix + 1}`;
  }

  throw new ServiceError("SUPABASE_ERROR", "Failed to generate clean slug");
}

export async function createEvent(input: NewEventInput) {
  const session = await requireSession();
  const hostId = session.user.id;
  const hostEmail = session.user.email;

  if (!hostId) {
    throw new ServiceError("UNAUTHENTICATED", "Host id is required");
  }

  if (!hostEmail) {
    throw new ServiceError("UNAUTHENTICATED", "Host email is required");
  }

  if (!input.title?.trim()) {
    throw new ServiceError("BAD_REQUEST", "Title is required");
  }

  if (!input.event_date) {
    throw new ServiceError("BAD_REQUEST", "Event date is required");
  }

  const generatedSlug = await buildUniqueSlug(input.title);
  const tier = input.tier ?? 1;

  const { data, error } = await supabaseClient
    .from("events")
    .insert({
      title: input.title,
      slug: generatedSlug,
      event_date: input.event_date,
      tier,
      host_id: hostId,
      host_email: hostEmail,
      state: "draft",
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

  return {
    id: data.id,
    slug: data.slug,
  };
}

export async function toggleGuestAccess(eventId: string, enabled: boolean) {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) {
    throw new ServiceError("BAD_REQUEST", "Event id is required");
  }

  const session = await requireSession();
  const hostEmail = session.user.email?.trim().toLowerCase();

  if (!hostEmail) {
    throw new ServiceError("UNAUTHENTICATED", "Host email is required");
  }

  const { data, error } = await supabaseClient
    .from("events")
    .update({
      guest_access_enabled: enabled,
      last_critical_update_at: new Date().toISOString(),
    })
    .eq("id", normalizedEventId)
    .eq("host_email", hostEmail)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }

  if (!data) {
    throw new ServiceError("NOT_FOUND", "Event not found");
  }
}
