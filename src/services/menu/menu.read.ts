import { supabase } from "@/infra/supabase.client";

export async function getEventMenus(eventId: string) {
  const { data, error } = await supabase
    .from("event_menus")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("MENU_READ_FAILED");
  }

  return data || [];
}
