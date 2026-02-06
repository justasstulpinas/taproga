import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { STRIPE_PRICES } from "@/lib/stripe-prices";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);


export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { tier, event_id } = req.body;

    if (!tier || !event_id) {
        return res.status(400).json({ error: "Missing tier or event_id" });
    }

    const priceId = STRIPE_PRICES[tier as 1 | 2 | 3];

    if (!priceId) {
        return res.status(400).json({ error: "Invalid tier" });
    }

    const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
            {
                price: priceId,
                quantity: 1,
            },
        ],
        success_url: `http://localhost:3000/payment/success`,
        cancel_url: `http://localhost:3000/payment/cancel`,

        metadata: {
            event_id,
            tier: String(tier),
        },
        automatic_tax: { enabled: true },
    });

    return res.status(200).json({ url: session.url });
}
