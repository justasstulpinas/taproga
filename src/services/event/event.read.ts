import { supabaseClient } from "@/infra/supabase.client";
import { ServiceError } from "@/shared/errors";
import { EventSummary } from "@/domain/event/event.types";

/**
 * Public invitation page fetch
 */
export async function getPublicEventBySlug(slug: string) {
  const { data, error } = await supabaseClient
    .from("events")
    .select(`
      id,
      title,
      event_date,
      state,
      slug,
      tier,
      menu_enabled,
      guest_access_enabled,
      last_critical_update_at
    `)
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * Host dashboard fetch
 */
export async function listHostEvents(): Promise<EventSummary[]> {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (!session) {
    throw new ServiceError(
      "UNAUTHENTICATED",
      "User is not authenticated"
    );
  }

  const hostEmail = session.user.email?.trim().toLowerCase();
  if (!hostEmail) {
    throw new ServiceError("UNAUTHENTICATED", "Host email is missing");
  }

  const { data, error } = await supabaseClient
    .from("events")
    .select(`
      id,
      slug,
      title,
      event_date,
      tier,
      guest_access_enabled,
      state,
      created_at
    `)
    .eq("host_email", hostEmail)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ServiceError(
      "SUPABASE_ERROR",
      error.message,
      error
    );
  }

  return (data ?? []) as EventSummary[];
}

/**
 * Slug collision detection
 */
export async function countEventsBySlugPrefix(
  prefix: string
): Promise<number> {
  const { count, error } = await supabaseClient
    .from("events")
    .select("id", { count: "exact", head: true })
    .ilike("slug", `${prefix}%`);

  if (error) {
    throw new ServiceError(
      "SUPABASE_ERROR",
      error.message,
      error
    );
  }

  return count ?? 0;
}
