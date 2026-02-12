import { supabaseServiceRole } from "@/infra/supabase.service";

export type RSVPStatus = "yes" | "no";

export class RSVPError extends Error {
  code:
    | "GUEST_NOT_FOUND"
    | "NOT_VERIFIED"
    | "EVENT_NOT_ACTIVE"
    | "GUEST_ACCESS_DISABLED"
    | "RSVP_DEADLINE_PASSED"
    | "UNKNOWN";

  constructor(code: RSVPError["code"]) {
    super(code);
    this.code = code;
  }
}

type UpdateGuestRSVPInput = {
  eventId: string;
  guestId: string;
  rsvpStatus: RSVPStatus;
  menuChoice: string | null;
  verified: boolean;
};

export async function updateGuestRSVP({
  eventId,
  guestId,
  rsvpStatus,
  menuChoice,
  verified,
}: UpdateGuestRSVPInput): Promise<void> {
  if (!verified) {
    throw new RSVPError("NOT_VERIFIED");
  }

  const { error, data } = await supabaseServiceRole
    .from("guests")
    .update({
      rsvp: rsvpStatus, // FIXED COLUMN
      rsvp_at: new Date().toISOString(),
      menu_choice: menuChoice,
    })
    .eq("id", guestId)
    .eq("event_id", eventId)
    .select("id")
    .single();

  if (error) {
    throw new RSVPError("UNKNOWN");
  }

  if (!data) {
    throw new RSVPError("GUEST_NOT_FOUND");
  }
}
