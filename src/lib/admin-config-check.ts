/**
 * Read-only launch checks for the payment and email configuration, shown on the administrator dashboard so the
 * REAL production site can report its own setup. Nothing here changes anything, and no secret, price id, webhook
 * secret, address or customer record is ever returned: only a label, pass/fail and a short plain description.
 *
 * Everything outside the world is injected so the logic is testable without Stripe or a database.
 */
import { checkStripeConfig, stripeModeFromKey } from "@/lib/stripe-config";
import { TIERS, priceIdFor, type Tier } from "@/lib/payments";

export interface ConfigCheck {
  label: string;
  /** true = good, false = needs attention, null = could not be checked from here */
  ok: boolean | null;
  detail: string;
}

export interface ConfigDeps {
  env: Record<string, string | undefined>;
  stripe: {
    prices: { retrieve(id: string): Promise<{ active: boolean; type: string; currency: string; unit_amount: number | null; livemode: boolean }> };
    webhookEndpoints: { list(p: { limit: number }): Promise<{ data: Array<{ url: string; status: string; enabled_events: string[]; livemode: boolean }> }> };
  } | null;
  /** True when the confirmation-email columns exist on the payments table. */
  emailColumnsExist(): Promise<boolean>;
  siteUrl: string;
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

export async function runConfigChecks(deps: ConfigDeps): Promise<ConfigCheck[]> {
  const out: ConfigCheck[] = [];
  const { env } = deps;

  const cfg = checkStripeConfig(env);
  out.push({
    label: "Stripe settings",
    ok: cfg.ok,
    detail: cfg.ok ? `${cfg.mode === "live" ? "Live" : "Test"} mode, webhook secret and both price settings present.` : `Needs attention: ${cfg.problems.join(" ")}`,
  });

  const mode = stripeModeFromKey(env.STRIPE_SECRET_KEY);
  for (const tier of ["single", "multi"] as Tier[]) {
    const label = `${tier === "single" ? "One-year" : "Multi-year"} price in Stripe`;
    const id = priceIdFor(tier, env);
    if (!deps.stripe || !id) {
      out.push({ label, ok: null, detail: "Could not check (Stripe is not configured here)." });
      continue;
    }
    try {
      const p = await deps.stripe.prices.retrieve(id);
      const rule = TIERS[tier];
      const problems: string[] = [];
      if (!p.active) problems.push("the price is archived");
      if (p.type !== "one_time") problems.push("it is not a one-time price");
      if (p.currency !== rule.currency) problems.push("wrong currency");
      if (p.unit_amount !== rule.amount) problems.push(`Stripe charges ${p.unit_amount == null ? "an unset amount" : usd(p.unit_amount)} but the site sells it for ${usd(rule.amount)}`);
      if (mode && p.livemode !== (mode === "live")) problems.push("the price is from a different mode than the key");
      out.push({ label, ok: problems.length === 0, detail: problems.length === 0 ? `${usd(rule.amount)} USD, active, one-time, ${p.livemode ? "live" : "test"} mode. Matches the website.` : `Needs attention: ${problems.join("; ")}.` });
    } catch {
      out.push({ label, ok: null, detail: "Stripe did not return this price (the key may not have permission to read prices)." });
    }
  }

  if (!deps.stripe) {
    out.push({ label: "Stripe webhook endpoint", ok: null, detail: "Could not check." });
  } else {
    try {
      const list = await deps.stripe.webhookEndpoints.list({ limit: 20 });
      const want = `${deps.siteUrl.replace(/\/$/, "")}/api/stripe/webhook`;
      const ep = list.data.find((e) => e.url.replace(/\/$/, "") === want);
      if (!ep) out.push({ label: "Stripe webhook endpoint", ok: false, detail: "No endpoint is registered for this site's /api/stripe/webhook address." });
      else {
        const needed = ["checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"];
        const have = new Set(ep.enabled_events);
        const missing = have.has("*") ? [] : needed.filter((n) => !have.has(n));
        out.push({
          label: "Stripe webhook endpoint",
          ok: ep.status === "enabled" && missing.length === 0,
          detail: ep.status !== "enabled" ? "The endpoint exists but is disabled." : missing.length ? `Enabled, but these events are not selected: ${missing.join(", ")}.` : "Registered and enabled for the checkout events the site handles.",
        });
      }
    } catch {
      out.push({ label: "Stripe webhook endpoint", ok: null, detail: "Could not list endpoints (the key may not have permission). Check the Stripe dashboard instead." });
    }
  }

  out.push({
    label: "Confirmation email provider",
    ok: !!env.RESEND_API_KEY?.startsWith("re_"),
    detail: env.RESEND_API_KEY?.startsWith("re_") ? `Provider key present. Sending from ${env.EMAIL_FROM || "the default sender (noreply@leaseguard.io)"}.` : "RESEND_API_KEY is not set, so purchase confirmation emails are NOT sent.",
  });
  const cols = await deps.emailColumnsExist().catch(() => false);
  out.push({
    label: "Confirmation email bookkeeping (database)",
    ok: cols,
    detail: cols ? "The payments table has the confirmation-email columns." : "The confirmation-email migration has not been applied, so no confirmation email will be sent.",
  });
  return out;
}
