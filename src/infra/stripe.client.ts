import Stripe from "stripe";
import { ENV } from "@/src/shared/env";

export const stripe = new Stripe(ENV.STRIPE_SECRET_KEY);
