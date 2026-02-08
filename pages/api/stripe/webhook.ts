import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { buffer } from "micro";
import { constructStripeEvent } from "@/services/payments/payments.webhook";
import { markEventPaidFromStripe } from "@/services/event/event.write.server";
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
    const rawBody = await buffer(req);
    event = constructStripeEvent(rawBody, sig);
  } catch (err: unknown) {
    return res.status(400).send("Webhook Error");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const eventId = session.metadata?.event_id;

    if (eventId) {
      try {
        await markEventPaidFromStripe(eventId, session.id);
      } catch (err: unknown) {
        const message = err instanceof ServiceError ? err.message : "Internal server error";
        return res.status(500).send(message);
      }
    }
  }

  return res.json({ received: true });
}
