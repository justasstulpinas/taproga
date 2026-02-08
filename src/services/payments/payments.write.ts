import Stripe from "stripe";
import { stripe } from "@/infra/stripe.client";
import { STRIPE_PRICES } from "@/shared/constants";
import { ServiceError } from "@/shared/errors";

export async function createCheckoutSession(input: {
  tier: number | string;
  eventId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const { tier, eventId, successUrl, cancelUrl } = input;

  if (!tier || !eventId) {
    throw new ServiceError("BAD_REQUEST", "Missing tier or event_id");
  }

  const priceId = STRIPE_PRICES[tier as 1 | 2 | 3];

  if (!priceId) {
    throw new ServiceError("BAD_REQUEST", "Invalid tier");
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        event_id: eventId,
        tier: String(tier),
      },
      automatic_tax: { enabled: true },
    });

    return session;
  } catch (error: unknown) {
    throw new ServiceError("STRIPE_ERROR", "Stripe error", error);
  }
}
