import { supabase } from "@/infra/supabase.client";

export async function createEventMenu(input: {
  event_id: string;
  name: string;
  description?: string | null;
}) {
  const { error, data } = await supabase
    .from("event_menus")
    .insert({
      event_id: input.event_id,
      name: input.name,
      description: input.description ?? null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error("MENU_CREATE_FAILED");
  }

  return data;
}

export async function updateEventMenu(input: {
  id: string;
  name: string;
  description?: string | null;
}) {
  const { error } = await supabase
    .from("event_menus")
    .update({
      name: input.name,
      description: input.description ?? null,
    })
    .eq("id", input.id);

  if (error) {
    throw new Error("MENU_UPDATE_FAILED");
  }
}

export async function deleteEventMenu(id: string) {
  const { error } = await supabase
    .from("event_menus")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error("MENU_DELETE_FAILED");
  }
}
