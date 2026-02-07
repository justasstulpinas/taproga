import type { NextApiRequest, NextApiResponse } from "next";
import { createCheckoutSession } from "@/src/services/payments/payments.write";
import { ServiceError } from "@/src/shared/errors";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { tier, event_id } = req.body;

  try {
    const session = await createCheckoutSession({
      tier,
      eventId: event_id,
      successUrl: "http://localhost:3000/payment/success",
      cancelUrl: "http://localhost:3000/payment/cancel",
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    if (err instanceof ServiceError) {
      if (err.code === "BAD_REQUEST") {
        return res.status(400).json({ error: err.message });
      }

      return res.status(500).json({ error: err.message });
    }

    return res.status(500).json({ error: "Internal server error" });
  }
}
