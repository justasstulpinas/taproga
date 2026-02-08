import Stripe from "stripe";
import { stripe } from "@/infra/stripe.client";
import { ENV } from "@/shared/env";
import { ServiceError } from "@/shared/errors";

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
  } catch (error: unknown) {
    throw new ServiceError("STRIPE_ERROR", "Webhook Error", error);
  }
}
