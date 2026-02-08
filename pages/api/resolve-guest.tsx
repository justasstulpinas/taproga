import type { NextApiRequest, NextApiResponse } from "next";
import { resolveGuest } from "@/services/guest/guest.read";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const { eventId, name } = req.body ?? {};

  if (typeof eventId !== "string" || typeof name !== "string") {
    return res.status(400).json({ error: "INVALID_PAYLOAD" });
  }

  try {
    const { guestId } = await resolveGuest({ eventId, name });
    return res.status(200).json({ guestId });
  } catch (err) {
    console.error("resolve-guest failed", err);
    return res.status(500).json({ error: "GUEST_RESOLUTION_FAILED" });
  }
}
