import { supabase } from "@/infra/supabase.client";

export async function createEventMenu(params: {
  eventId: string;
  title: string;
  description?: string;
}) {
  const { error } = await supabase
    .from("event_menus")
    .insert({
      event_id: params.eventId,
      title: params.title,
      description: params.description ?? null,
    });

  if (error) {
    throw new Error("MENU_CREATE_FAILED");
  }
}
