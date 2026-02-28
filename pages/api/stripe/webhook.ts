import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { constructStripeEvent } from "@/services/payments/payments.webhook";
import { markEventPaidFromStripe } from "@/services/event/event.write.server";
import { supabaseServiceRole } from "@/infra/supabase.service";
import { ServiceError } from "@/shared/errors";

export const config = {
  api: { bodyParser: false },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return res.status(405).end();

  const sig = req.headers["stripe-signature"];
  if (!sig || typeof sig !== "string") return res.status(400).end();

  let event: Stripe.Event;

  try {
    const rawBody = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
    event = constructStripeEvent(rawBody, sig);
  } catch (err: unknown) {
    return res.status(400).send("Webhook Error");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const eventId = session.metadata?.event_id;
    const checkoutType = session.metadata?.type;

    if (eventId) {
      try {
        if (checkoutType === "storage_renewal") {
          const renewalEventId = session.metadata?.event_id;
          if (!renewalEventId) return res.json({ received: true });

          const { data: eventRow, error } = await supabaseServiceRole
            .from("events")
            .select("id, tier, last_storage_renewal_session_id")
            .eq("id", renewalEventId)
            .single();

          if (error || !eventRow) {
            console.error("RENEW_FETCH_ERROR", error);
            return res.json({ received: true });
          }

          if (eventRow.last_storage_renewal_session_id === session.id) {
            console.log("RENEW_ALREADY_PROCESSED");
            return res.json({ received: true });
          }

          if (eventRow.tier < 3) {
            console.error("RENEW_TIER_INVALID");
            return res.json({ received: true });
          }

          const now = new Date();
          const expires = new Date(now);
          expires.setFullYear(expires.getFullYear() + 1);

          const grace = new Date(expires);
          grace.setDate(grace.getDate() + 30);

          await supabaseServiceRole
            .from("events")
            .update({
              storage_expires_at: expires.toISOString(),
              storage_grace_until: grace.toISOString(),
              last_storage_renewal_session_id: session.id,
            })
            .eq("id", renewalEventId);

          return res.json({ received: true });
        } else {
          await markEventPaidFromStripe(eventId, session.id);
        }
      } catch (err: unknown) {
        const message = err instanceof ServiceError ? err.message : "Internal server error";
        return res.status(500).send(message);
      }
    }
  }

  return res.json({ received: true });
}
