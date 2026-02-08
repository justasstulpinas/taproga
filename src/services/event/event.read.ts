import { supabaseClient } from "@/infra/supabase.client";
import { ServiceError } from "@/shared/errors";
import { EventSummary } from "@/domain/event/event.types";

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

export type PublicEventRow = {
  id: string;
  title: string;
  event_date: string;
  state: string;
  guest_access_enabled: boolean;
  slug: string;
};

export async function getPublicEventBySlug(
  slug: string
): Promise<PublicEventRow | null> {
  const { supabaseServiceRole } = await import("@/infra/supabase.service");

  const { data } = await supabaseServiceRole
    .from("events")
    .select("id,title,event_date,state,guest_access_enabled,slug")
    .eq("slug", slug)
    .single();

  if (!data) {
    return null;
  }

  return data as PublicEventRow;
}
