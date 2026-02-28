import { supabaseServiceRole } from "@/infra/supabase.service";
import { ServiceError } from "@/shared/errors";
import { EventState } from "@/domain/event/event.types";

export async function markEventPaidFromStripe(eventId: string, sessionId: string) {
  const normalizedEventId = eventId.trim();
  const normalizedSessionId = sessionId.trim();

  if (!normalizedEventId) {
    throw new ServiceError("BAD_REQUEST", "Event id is required");
  }

  if (!normalizedSessionId) {
    throw new ServiceError("BAD_REQUEST", "Stripe session id is required");
  }

  const { data: event, error: fetchError } = await supabaseServiceRole
    .from("events")
    .select("id,state,event_date,tier")
    .eq("id", normalizedEventId)
    .maybeSingle();

  if (fetchError) {
    throw new ServiceError("SUPABASE_ERROR", fetchError.message, fetchError);
  }

  if (!event) {
    throw new ServiceError("NOT_FOUND", "Event not found");
  }

  if (event.state !== EventState.Draft) {
    throw new ServiceError("BAD_REQUEST", "Event state must be draft");
  }

  let storageExpiresAt: string | null = null;
  let storageGraceUntil: string | null = null;

  if (event.tier >= 3) {
    if (!event.event_date) {
      throw new ServiceError("BAD_REQUEST", "Event date is required");
    }

    const eventDate = new Date(event.event_date);
    if (Number.isNaN(eventDate.getTime())) {
      throw new ServiceError("BAD_REQUEST", "Event date is invalid");
    }

    const expiresAt = new Date(eventDate);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const graceUntil = new Date(expiresAt);
    graceUntil.setDate(graceUntil.getDate() + 30);

    storageExpiresAt = expiresAt.toISOString();
    storageGraceUntil = graceUntil.toISOString();
  }

  const { data: updatedEvent, error: updateError } = await supabaseServiceRole
    .from("events")
    .update({
      state: EventState.Paid,
      paid_at: new Date().toISOString(),
      stripe_session_id: normalizedSessionId,
      storage_expires_at: storageExpiresAt,
      storage_grace_until: storageGraceUntil,
    })
    .eq("id", normalizedEventId)
    .eq("state", EventState.Draft)
    .select("id")
    .maybeSingle();

  if (updateError) {
    throw new ServiceError("SUPABASE_ERROR", updateError.message, updateError);
  }

  if (!updatedEvent) {
    throw new ServiceError("BAD_REQUEST", "Event state must be draft");
  }
}

type UpdatePostEventSettingsInput = {
  eventId: string;
  hostId: string;
  postEventEnabled: boolean;
  guestPhotoUploadEnabled: boolean;
};

export async function updatePostEventSettings({
  eventId,
  hostId,
  postEventEnabled,
  guestPhotoUploadEnabled,
}: UpdatePostEventSettingsInput) {
  const normalizedEventId = eventId.trim();
  const normalizedHostId = hostId.trim();

  if (!normalizedEventId) {
    throw new ServiceError("BAD_REQUEST", "Event id is required");
  }

  if (!normalizedHostId) {
    throw new ServiceError("UNAUTHENTICATED", "Host id is required");
  }

  const { data: event, error: eventError } = await supabaseServiceRole
    .from("events")
    .select("id,tier,host_id")
    .eq("id", normalizedEventId)
    .eq("host_id", normalizedHostId)
    .maybeSingle();

  if (eventError) {
    throw new ServiceError("SUPABASE_ERROR", eventError.message, eventError);
  }

  if (!event) {
    throw new ServiceError("NOT_FOUND", "Event not found");
  }

  if (
    (postEventEnabled === true || guestPhotoUploadEnabled === true) &&
    event.tier < 3
  ) {
    throw new ServiceError("FORBIDDEN", "Tier 3 required");
  }

  const { error: updateError } = await supabaseServiceRole
    .from("events")
    .update({
      post_event_enabled: postEventEnabled,
      guest_photo_upload_enabled: guestPhotoUploadEnabled,
    })
    .eq("id", normalizedEventId)
    .eq("host_id", normalizedHostId);

  if (updateError) {
    throw new ServiceError("SUPABASE_ERROR", updateError.message, updateError);
  }
}
