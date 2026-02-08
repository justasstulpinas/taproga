import type { NextApiRequest, NextApiResponse } from 'next';
import { updateGuestRSVP, RSVPError } from '@/services/guest/guest.write';



type Body = {
  eventId?: string;
  guestId?: string;
  rsvpStatus?: 'yes' | 'no';
  verified?: boolean;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const { eventId, guestId, rsvpStatus, verified } = req.body as Body;

  if (!eventId || !guestId || !rsvpStatus) {
    return res.status(400).json({ error: 'INVALID_PAYLOAD' });
  }

  try {
    await updateGuestRSVP({
      eventId,
      guestId,
      rsvpStatus,
      verified: Boolean(verified),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof RSVPError) {
      switch (err.code) {
        case 'NOT_VERIFIED':
          return res.status(403).json({ error: 'NOT_VERIFIED' });
        case 'EVENT_NOT_ACTIVE':
          return res.status(409).json({ error: 'EVENT_NOT_ACTIVE' });
        case 'GUEST_ACCESS_DISABLED':
          return res.status(403).json({ error: 'GUEST_ACCESS_DISABLED' });
        case 'RSVP_DEADLINE_PASSED':
          return res.status(410).json({ error: 'RSVP_DEADLINE_PASSED' });
        case 'GUEST_NOT_FOUND':
          return res.status(404).json({ error: 'GUEST_NOT_FOUND' });
      }
    }

    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
