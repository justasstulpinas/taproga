import Stripe from "stripe";
import { stripe } from "@/src/infra/stripe.client";
import { ENV } from "@/src/shared/env";
import { ServiceError } from "@/src/shared/errors";

export function constructStripeEvent(
  rawBody: Buffer,
  signature: string
): Stripe.Event {
  try {
    return stripe.webhooks.constructEvent(
      rawBody,
      signature,
      ENV.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    throw new ServiceError("STRIPE_ERROR", "Webhook Error", error);
  }
}
