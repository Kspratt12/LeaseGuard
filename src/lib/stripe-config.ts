/**
 * Production safety guard for Stripe configuration. Pure (no Stripe SDK, no
 * network) so it is fully testable. getStripe() refuses to run unless this passes.
 *
 * Intended environments:
 *   Vercel Production : live key (sk_live_), STRIPE_ALLOW_LIVE=true, live price IDs
 *   Vercel Preview/Dev: test key (sk_test_) only, test price IDs
 *
 * Whether a price ID is really a live or test price is verified at checkout time
 * against Stripe itself (price.livemode must equal the key's mode).
 */

export type StripeMode = "test" | "live";

export interface StripeConfigCheck {
  ok: boolean;
  mode: StripeMode | null;
  problems: string[];
}

export function stripeModeFromKey(key: string | undefined): StripeMode | null {
  if (key?.startsWith("sk_test_") || key?.startsWith("rk_test_")) return "test";
  if (key?.startsWith("sk_live_") || key?.startsWith("rk_live_")) return "live";
  return null;
}

export function checkStripeConfig(env: Record<string, string | undefined>): StripeConfigCheck {
  const problems: string[] = [];
  const mode = stripeModeFromKey(env.STRIPE_SECRET_KEY);
  const deployment = env.VERCEL_ENV; // "production" | "preview" | "development" | undefined

  if (!mode) problems.push("STRIPE_SECRET_KEY is missing or is not a Stripe secret key.");
  if (!env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) problems.push("STRIPE_WEBHOOK_SECRET is missing or is not a webhook signing secret.");

  const single = env.STRIPE_PRICE_ID_SINGLE;
  const multi = env.STRIPE_PRICE_ID_MULTI;
  if (!single?.startsWith("price_")) problems.push("STRIPE_PRICE_ID_SINGLE is missing or is not a price ID.");
  if (!multi?.startsWith("price_")) problems.push("STRIPE_PRICE_ID_MULTI is missing or is not a price ID.");
  if (single && single === multi) problems.push("STRIPE_PRICE_ID_SINGLE and STRIPE_PRICE_ID_MULTI must be different prices.");

  if (mode === "live") {
    if (deployment !== "production") problems.push("A live Stripe key is only allowed in the Vercel Production environment.");
    if (env.STRIPE_ALLOW_LIVE !== "true") problems.push("Live payments require STRIPE_ALLOW_LIVE=true.");
    if (env.APP_BASE_URL && !env.APP_BASE_URL.startsWith("https://")) problems.push("APP_BASE_URL must be https in live mode.");
  }
  if (mode === "test" && deployment === "production") {
    problems.push("A test Stripe key is not allowed in the Vercel Production environment (customers could not really pay).");
  }

  return { ok: problems.length === 0, mode, problems };
}
