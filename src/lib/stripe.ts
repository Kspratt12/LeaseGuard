import Stripe from "stripe";
import { checkStripeConfig, stripeModeFromKey as modeFromKey } from "@/lib/stripe-config";

let client: Stripe | null = null;

/** "test" or "live", from the key prefix. Throws if the key is missing or unrecognised. */
export function stripeModeFromKey(key: string | undefined): "test" | "live" {
  const mode = modeFromKey(key);
  if (!mode) throw new Error("STRIPE_SECRET_KEY is missing or not a Stripe secret key.");
  return mode;
}

/**
 * Lazy server-only Stripe client. Nothing happens at import time. It refuses to
 * run unless the whole payment configuration passes checkStripeConfig (live key
 * only in Production with STRIPE_ALLOW_LIVE=true, no test key in Production,
 * valid distinct price IDs, webhook secret present). Problems are logged by name
 * only; no values are ever printed.
 */
export function getStripe(): Stripe {
  if (client) return client;
  const check = checkStripeConfig(process.env);
  if (!check.ok) {
    console.error(`[stripe] configuration refused: ${check.problems.join(" | ")}`);
    throw new Error("Stripe configuration refused.");
  }
  client = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });
  return client;
}
