/**
 * Payment rules for LeaseGuard: one-time Stripe Checkout payments only.
 *
 * Everything here is server-side and dependency-injected (store, Stripe client,
 * environment) so it can be tested without Stripe or a database. The browser
 * never supplies a price, an amount, a tier or an "unlocked" flag: the tier
 * comes from the audit's own verified reconciliation-year count.
 */
import type Stripe from "stripe";
import { decidePurchase, type NotEligibleReason, type PurchaseInput } from "@/lib/purchase-eligibility";

export type Tier = "single" | "multi";

/** Business rules. Price IDs are NOT here: they come from the environment. */
export const TIERS: Record<Tier, { amount: number; currency: "usd"; maxYears: number; priceEnv: string }> = {
  single: { amount: 4900, currency: "usd", maxYears: 1, priceEnv: "STRIPE_PRICE_ID_SINGLE" },
  multi: { amount: 14900, currency: "usd", maxYears: 5, priceEnv: "STRIPE_PRICE_ID_MULTI" },
};

/** 1 year => single, 2-5 years => multi. Unknown (legacy) or out-of-range => not purchasable. */
export function tierForYearCount(years: number | null | undefined): Tier | null {
  if (years == null || !Number.isInteger(years) || years < 1 || years > TIERS.multi.maxYears) return null;
  return years === 1 ? "single" : "multi";
}

export function priceIdFor(tier: Tier, env: Record<string, string | undefined> = process.env): string | null {
  return env[TIERS[tier].priceEnv] || null;
}

export interface PaymentRow {
  session_id: string;
  audit_id: string;
  owner_id: string;
  tier: Tier;
  status: "pending" | "paid" | "failed" | "expired" | "rejected";
}

export interface PaymentStore {
  /** Atomically register a webhook event. "duplicate_done" = already fully processed. */
  recordEvent(eventId: string, type: string): Promise<"new" | "retry" | "duplicate_done">;
  markEventProcessed(eventId: string): Promise<void>;
  getPaymentBySession(sessionId: string): Promise<PaymentRow | null>;
  createPending(row: { sessionId: string; auditId: string; ownerId: string; tier: Tier; amount: number; currency: string; livemode: boolean }): Promise<void>;
  /** Returns false (and records nothing) if the audit already has a different paid payment. */
  markPaid(sessionId: string, info: { paymentIntentId: string | null; amountTotal: number; currency: string }): Promise<boolean>;
  markStatus(sessionId: string, status: "failed" | "expired" | "rejected", reason?: string): Promise<void>;
  /** True only when a verified, paid payment exists for this audit and this owner. */
  hasPaid(auditId: string, ownerId: string): Promise<boolean>;
  /** Server-side facts about the audit used to decide the tier. */
  getAuditFacts(auditId: string): Promise<{ owner_id: string | null; status: string; recon_year_count: number | null } | null>;
  /** The audit's own stored findings, so checkout can refuse to sell an audit with nothing to unlock. */
  getPurchaseFacts(auditId: string): Promise<PurchaseInput | null>;
}

// ---------------------------------------------------------------------------
// Checkout creation
// ---------------------------------------------------------------------------

export type CheckoutResult =
  | { ok: true; url: string; tier: Tier }
  | { ok: false; reason: "not_found" | "not_ready" | "not_purchasable" | "already_paid" | "not_configured" | "price_mismatch" | "stripe_error" | NotEligibleReason };

export async function createCheckoutForAudit(args: {
  auditId: string;
  userId: string;
  /** Row-level-security-backed ownership check (user client). */
  userOwnsAudit: (auditId: string, userId: string) => Promise<boolean>;
  store: PaymentStore;
  stripe: Pick<Stripe, "prices" | "checkout">;
  baseUrl: string;
  /** True when running with a live Stripe key. The price must be from the same mode. */
  expectLivemode: boolean;
  env?: Record<string, string | undefined>;
}): Promise<CheckoutResult> {
  const { auditId, userId, store, stripe, baseUrl } = args;
  const env = args.env ?? process.env;

  if (!(await args.userOwnsAudit(auditId, userId))) return { ok: false, reason: "not_found" };

  const facts = await store.getAuditFacts(auditId);
  // Belt and braces: the server-side row must also name this user as the owner.
  if (!facts || facts.owner_id !== userId) return { ok: false, reason: "not_found" };
  if (facts.status !== "completed") return { ok: false, reason: "not_ready" };

  const tier = tierForYearCount(facts.recon_year_count);
  if (!tier) return { ok: false, reason: "not_purchasable" };
  if (await store.hasPaid(auditId, userId)) return { ok: false, reason: "already_paid" };

  // Eligibility is enforced HERE, on the server, from the audit's own stored findings. The screen hides the button
  // for the same audits, but nothing the browser does can make an audit with nothing to unlock purchasable.
  const purchaseFacts = await store.getPurchaseFacts(auditId);
  if (!purchaseFacts) return { ok: false, reason: "not_found" };
  const decision = decidePurchase(purchaseFacts);
  if (!decision.eligible) return { ok: false, reason: decision.reason };

  const priceId = priceIdFor(tier, env);
  if (!priceId) return { ok: false, reason: "not_configured" };

  try {
    // A misconfigured price ID must never charge the wrong amount.
    const price = await stripe.prices.retrieve(priceId);
    const rule = TIERS[tier];
    if (!price.active || price.livemode !== args.expectLivemode || price.type !== "one_time" || price.unit_amount !== rule.amount || price.currency !== rule.currency) {
      return { ok: false, reason: "price_mismatch" };
    }

    const metadata = { audit_id: auditId, owner_id: userId, tier };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: auditId,
      metadata,
      payment_intent_data: { metadata },
      success_url: `${baseUrl}/audit/${auditId}?checkout=success`,
      cancel_url: `${baseUrl}/audit/${auditId}?checkout=cancelled`,
    });
    if (!session.url) return { ok: false, reason: "stripe_error" };

    await store.createPending({
      sessionId: session.id, auditId, ownerId: userId, tier,
      amount: rule.amount, currency: rule.currency, livemode: session.livemode,
    });
    return { ok: true, url: session.url, tier };
  } catch {
    return { ok: false, reason: "stripe_error" };
  }
}

// ---------------------------------------------------------------------------
// Webhook handling
// ---------------------------------------------------------------------------

/**
 * Why a payment can end up "rejected" AFTER the customer was charged, so the money needs a human decision
 * (normally a refund in Stripe). The admin dashboard counts rows with these reasons.
 */
export const REFUND_REVIEW_REASONS = ["duplicate_payment_refund_needed", "not_eligible_at_payment"] as const;

export type WebhookOutcome =
  | "paid" | "duplicate" | "ignored" | "awaiting_payment"
  | "failed" | "expired" | "rejected";

export async function handleStripeEvent(
  event: Stripe.Event,
  deps: { store: PaymentStore; stripe: Pick<Stripe, "checkout">; expectLivemode: boolean; env?: Record<string, string | undefined> },
): Promise<{ outcome: WebhookOutcome; reason?: string }> {
  const { store, stripe } = deps;
  const env = deps.env ?? process.env;

  // Test events must never act on live configuration, and vice versa.
  if (event.livemode !== deps.expectLivemode) return { outcome: "ignored", reason: "livemode_mismatch" };

  const seen = await store.recordEvent(event.id, event.type);
  if (seen === "duplicate_done") return { outcome: "duplicate" };

  let result: { outcome: WebhookOutcome; reason?: string };
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      result = await fulfil(event.data.object as Stripe.Checkout.Session, store, stripe, env, deps.expectLivemode);
      break;
    case "checkout.session.async_payment_failed":
      await store.markStatus((event.data.object as Stripe.Checkout.Session).id, "failed");
      result = { outcome: "failed" };
      break;
    case "checkout.session.expired":
      await store.markStatus((event.data.object as Stripe.Checkout.Session).id, "expired");
      result = { outcome: "expired" };
      break;
    default:
      result = { outcome: "ignored", reason: "unhandled_type" };
  }
  await store.markEventProcessed(event.id);
  return result;
}

async function fulfil(
  eventSession: Stripe.Checkout.Session,
  store: PaymentStore,
  stripe: Pick<Stripe, "checkout">,
  env: Record<string, string | undefined>,
  expectLivemode: boolean,
): Promise<{ outcome: WebhookOutcome; reason?: string }> {
  const reject = async (reason: string) => {
    await store.markStatus(eventSession.id, "rejected", reason);
    return { outcome: "rejected" as const, reason };
  };

  const payment = await store.getPaymentBySession(eventSession.id);
  if (!payment) return { outcome: "ignored", reason: "unknown_session" }; // not created by our checkout
  if (payment.status === "paid") return { outcome: "duplicate" };

  // Never trust the event payload alone: re-read the session from Stripe and
  // verify against that. A forged or replayed event cannot claim a payment that
  // Stripe itself does not show as paid.
  const session = await stripe.checkout.sessions.retrieve(eventSession.id);
  if (session.livemode !== expectLivemode) return reject("livemode_mismatch");

  if (session.mode !== "payment") return reject("wrong_mode");
  // Checkout can complete before funds clear (async methods): stay pending.
  if (session.payment_status !== "paid") return { outcome: "awaiting_payment" };

  const rule = TIERS[payment.tier];
  if (session.currency !== rule.currency) return reject("wrong_currency");
  if (session.amount_total !== rule.amount) return reject("wrong_amount");

  const md = session.metadata ?? {};
  if (md.audit_id !== payment.audit_id || session.client_reference_id !== payment.audit_id) return reject("audit_mismatch");
  if (md.owner_id !== payment.owner_id) return reject("owner_mismatch");
  if (md.tier !== payment.tier) return reject("tier_mismatch");

  // The tier must still be the one the audit's own verified year count requires.
  const facts = await store.getAuditFacts(payment.audit_id);
  if (!facts || facts.owner_id !== payment.owner_id) return reject("audit_owner_changed");
  if (tierForYearCount(facts.recon_year_count) !== payment.tier) return reject("wrong_tier_for_audit");

  // Confirm exactly the expected price was purchased.
  const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 });
  const expectedPrice = priceIdFor(payment.tier, env);
  if (!expectedPrice || items.data.length !== 1 || items.data[0].price?.id !== expectedPrice || items.data[0].quantity !== 1) {
    return reject("wrong_price");
  }

  // The audit must STILL be sellable now. A session created earlier (before this rule existed, or before the audit
  // changed) may be paid late; the rule is re-run here on the audit's own stored findings, read fresh from the
  // database. Nothing from the event, the Stripe metadata or the browser is used. A read failure THROWS (Stripe
  // retries); only a definite "not eligible" answer rejects, and it records no entitlement. The customer has been
  // charged at this point, so the reason is one the admin dashboard flags for a refund decision.
  const purchaseFacts = await store.getPurchaseFacts(payment.audit_id);
  if (!purchaseFacts) throw new Error("audit findings unavailable"); // cannot decide: retry, never reject
  if (!decidePurchase(purchaseFacts).eligible) return reject("not_eligible_at_payment");

  const recorded = await store.markPaid(session.id, {
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    amountTotal: session.amount_total,
    currency: session.currency,
  });
  // The customer already unlocked this audit with an earlier payment, so this
  // second charge delivers nothing: flag it for a manual refund instead of retrying forever.
  if (!recorded) return reject("duplicate_payment_refund_needed");
  return { outcome: "paid" };
}

// ---------------------------------------------------------------------------
// Report access
// ---------------------------------------------------------------------------

export type ReportAccess =
  | { ok: true; path: string }
  | { ok: false; status: 401 | 402 | 404 };

/** Ownership AND verified payment are both required. Nothing else grants a report. */
export async function authorizeReportAccess(args: {
  userId: string | null;
  auditId: string;
  userOwnsAudit: (auditId: string, userId: string) => Promise<boolean>;
  store: PaymentStore;
  getReportPath: (auditId: string) => Promise<string | null>;
}): Promise<ReportAccess> {
  if (!args.userId) return { ok: false, status: 401 };
  if (!(await args.userOwnsAudit(args.auditId, args.userId))) return { ok: false, status: 404 };
  if (!(await args.store.hasPaid(args.auditId, args.userId))) return { ok: false, status: 402 };
  const path = await args.getReportPath(args.auditId);
  return path ? { ok: true, path } : { ok: false, status: 404 };
}
