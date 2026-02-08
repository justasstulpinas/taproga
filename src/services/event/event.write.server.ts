import { supabaseServiceRole } from "@/infra/supabase.service";
import { ServiceError } from "@/shared/errors";
import { EventState } from "@/domain/event/event.types";

export async function markEventPaidFromStripe(eventId: string, sessionId: string) {
  const { error } = await supabaseServiceRole
    .from("events")
    .update({
      state: EventState.Paid,
      paid_at: new Date().toISOString(),
      stripe_session_id: sessionId,
    })
    .eq("id", eventId);

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }
}
