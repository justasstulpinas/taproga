import { supabaseServiceRole } from "@/infra/supabase.service";
import { GuestVerificationRecord } from "@/domain/guest/guest.types";

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
  verified: boolean;
};

export async function updateGuestRSVP({
  eventId,
  guestId,
  rsvpStatus,
  verified,
}: UpdateGuestRSVPInput): Promise<void> {
  if (!verified) {
    throw new RSVPError("NOT_VERIFIED");
  }

  const { error, data } = await supabaseServiceRole
    .from("guests")
    .update({
      rsvp_status: rsvpStatus,
      rsvp_at: new Date().toISOString(),
    })
    .eq("id", guestId)
    .eq("event_id", eventId)
    .select("id")
    .single();

  if (error) {
    if (error.message.includes("RSVP_DEADLINE_PASSED")) {
      throw new RSVPError("RSVP_DEADLINE_PASSED");
    }

    throw new RSVPError("UNKNOWN");
  }

  if (!data) {
    throw new RSVPError("GUEST_NOT_FOUND");
  }
}

export function setVerificationRecord(
  key: string,
  record: GuestVerificationRecord
) {
  sessionStorage.setItem(key, JSON.stringify(record));
}

export function clearVerificationRecord(key: string) {
  sessionStorage.removeItem(key);
}

export function setVerificationAttempts(key: string, attempts: number) {
  sessionStorage.setItem(key, String(attempts));
}

export function clearVerificationAttempts(key: string) {
  sessionStorage.removeItem(key);
}
