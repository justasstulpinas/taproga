import type { NextApiRequest, NextApiResponse } from "next";
import { updateGuestRSVP, RSVPError } from "@/services/guest/guest.write";

type Body = {
  eventId?: string;
  guestId?: string;
  rsvpStatus?: "yes" | "no";
  menuChoice?: string | null;
  verified?: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const { eventId, guestId, rsvpStatus, menuChoice, verified } = req.body as Body;

  if (!eventId || !guestId || !rsvpStatus) {
    return res.status(400).json({ error: "INVALID_PAYLOAD" });
  }

  try {
    await updateGuestRSVP({
      eventId,
      guestId,
      rsvpStatus,
      menuChoice: menuChoice ?? null,
      verified: Boolean(verified),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof RSVPError) {
      return res.status(400).json({ error: err.code });
    }
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}
