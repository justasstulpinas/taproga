import type { NextApiRequest, NextApiResponse } from "next";
import { createServerClient } from "@supabase/ssr";
import { parse, serialize } from "cookie";
import Stripe from "stripe";
import { supabaseServiceRole } from "@/infra/supabase.service";
import { ENV } from "@/shared/env";

function createApiSupabaseClient(req: NextApiRequest, res: NextApiResponse) {
  return createServerClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        const parsed = parse(req.headers.cookie ?? "");

        return Object.entries(parsed).map(([name, value]) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        const previous = res.getHeader("Set-Cookie");
        const current = Array.isArray(previous)
          ? previous.map(String)
          : previous
          ? [String(previous)]
          : [];

        const next = cookiesToSet.map(({ name, value, options }) =>
          serialize(name, value, { path: "/", ...options })
        );

        res.setHeader("Set-Cookie", [...current, ...next]);
      },
    },
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const { eventId } = req.query;

  if (typeof eventId !== "string" || !eventId.trim()) {
    return res.status(400).json({ error: "INVALID_EVENT_ID" });
  }

  const supabase = createApiSupabaseClient(req, res);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return res.status(401).json({ error: "UNAUTHENTICATED" });
  }

  const { data: event, error: eventError } = await supabaseServiceRole
    .from("events")
    .select("id,host_id,tier")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    return res.status(500).json({ error: eventError.message });
  }

  if (!event) {
    return res.status(404).json({ error: "EVENT_NOT_FOUND" });
  }

  if (event.host_id !== user.id) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  if (event.tier < 3) {
    return res.status(403).json({ error: "TIER_3_REQUIRED" });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    console.error("ENV CHECK FAILED: STRIPE_SECRET_KEY missing");
    return res.status(500).json({
      error: "STRIPE_SECRET_KEY_MISSING",
    });
  }

  const priceId = process.env.STRIPE_STORAGE_RENEWAL_PRICE_ID;
  if (!priceId) {
    console.error("ENV CHECK FAILED: STRIPE_STORAGE_RENEWAL_PRICE_ID missing");
    return res.status(500).json({ error: "STRIPE_STORAGE_PRICE_MISSING" });
  }

  const stripe = new Stripe(stripeSecretKey);

  const origin =
    req.headers.origin ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  try {
    console.log("PRICE ID:", priceId);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/host/events/${eventId}?renewal=success`,
      cancel_url: `${origin}/host/events/${eventId}?renewal=cancel`,
      metadata: {
        event_id: eventId,
        type: "storage_renewal",
      },
    });

    if (!session.url) {
      return res.status(500).json({ error: "CHECKOUT_URL_MISSING" });
    }

    return res.status(200).json({ url: session.url });
  } catch (error: unknown) {
    console.error("RENEW_CHECKOUT_ERROR:", error);
    const message = error instanceof Error ? error.message : "STRIPE_ERROR";
    return res.status(500).json({ error: message });
  }
}
