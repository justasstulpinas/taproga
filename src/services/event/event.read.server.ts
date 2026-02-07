import { supabaseServiceRole } from "@/src/infra/supabase.service";
import { ServiceError } from "@/src/shared/errors";
import { EventRowForPublic } from "@/src/domain/event/event.types";

export async function getEventBySlug(
  slug: string
): Promise<EventRowForPublic | null> {
  const { data, error } = await supabaseServiceRole
    .from("events")
    .select("id,title,event_date,state,guest_access_enabled,slug")
    .eq("slug", slug)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }

  if (!data) {
    return null;
  }

  return data as EventRowForPublic;
}
