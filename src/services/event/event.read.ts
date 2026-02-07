import { supabaseClient } from "@/src/infra/supabase.client";
import { ServiceError } from "@/src/shared/errors";
import {
  EventSummary,
} from "@/src/domain/event/event.types";

export async function listHostEvents(): Promise<EventSummary[]> {
  const { data: rows, error } = await supabaseClient
    .from("events")
    .select("id, title, slug, state, guest_access_enabled")
    .order("created_at", { ascending: false });

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }

  return (rows || []) as EventSummary[];
}

export async function countEventsBySlugPrefix(
  baseSlug: string
): Promise<number | null> {
  const { count, error } = await supabaseClient
    .from("events")
    .select("id", { count: "exact", head: true })
    .ilike("slug", `${baseSlug}%`);

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }

  return count;
}
