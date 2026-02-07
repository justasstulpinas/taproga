import { supabaseClient } from "@/src/infra/supabase.client";
import { buildEventDate, buildUniqueSlug, slugifyEventTitle } from "@/src/domain/event/event.rules";
import { NewEventInput } from "@/src/domain/event/event.types";
import { requireSession } from "@/src/services/auth/auth.read";
import { countEventsBySlugPrefix } from "@/src/services/event/event.read";
import { ServiceError } from "@/src/shared/errors";

export async function toggleGuestAccess(eventId: string, enabled: boolean) {
  const { error } = await supabaseClient
    .from("events")
    .update({ guest_access_enabled: !enabled })
    .eq("id", eventId);

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }
}

export async function createEvent(input: NewEventInput) {
  const baseSlug = slugifyEventTitle(input.title);
  const existingCount = await countEventsBySlugPrefix(baseSlug);
  const slug = buildUniqueSlug(baseSlug, existingCount);

  const session = await requireSession();

  const { data, error } = await supabaseClient
    .from("events")
    .insert({
      title: input.title,
      event_date: buildEventDate(input.date, input.time),
      event_timezone: input.timezone,
      slug,
      tier: 1,
      host_id: session.user.id,
    })
    .select("draft_token")
    .single();

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }

  if (!data) {
    throw new ServiceError("SUPABASE_ERROR", "Failed to create event");
  }

  return { slug, draftToken: data.draft_token } as const;
}
