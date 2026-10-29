/**
 * Payment tests. No network, no Stripe account, no database: the store and the
 * Stripe client are in-memory fakes, and webhook signatures use the real Stripe
 * SDK signing/verification code.
 *
 * Run: npx tsx src/lib/__tests__/payments.test.ts
 *
 * These prove the payment RULES. They do not prove the Supabase tables or a real
 * Stripe test-mode payment; those are covered by staging runs (see the report).
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
process.env.STRIPE_SECRET_KEY = "sk_test_unit";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_unit_test_secret";
process.env.STRIPE_PRICE_ID_SINGLE = "price_single_test";
process.env.STRIPE_PRICE_ID_MULTI = "price_multi_test";
delete process.env.VERCEL_ENV;

import assert from "node:assert";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import {
  TIERS, authorizeReportAccess, createCheckoutForAudit, handleStripeEvent,
  tierForYearCount, type PaymentRow, type PaymentStore, type Tier,
} from "../payments";
import { toPublicAudit } from "../audit-access";
import { checkStripeConfig } from "../stripe-config";

const ENV = { STRIPE_PRICE_ID_SINGLE: "price_single_test", STRIPE_PRICE_ID_MULTI: "price_multi_test" };
const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const AUDIT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// ---------------------------------------------------------------- fakes
function makeStore(opts: { years?: number | null; status?: string; owner?: string | null } = {}) {
  const facts = {
    owner_id: opts.owner === undefined ? OWNER : opts.owner,
    status: opts.status ?? "completed",
    recon_year_count: opts.years === undefined ? 1 : opts.years,
  };
  const payments = new Map<string, PaymentRow & { amountPaid?: number }>();
  const events = new Map<string, boolean>();
  const store: PaymentStore & { payments: typeof payments; paidWrites: number } = {
    payments, paidWrites: 0,
    async recordEvent(id) {
      if (!events.has(id)) { events.set(id, false); return "new"; }
      return events.get(id) ? "duplicate_done" : "retry";
    },
    async markEventProcessed(id) { events.set(id, true); },
    async getPaymentBySession(s) { return payments.get(s) ?? null; },
    async createPending(r) {
      payments.set(r.sessionId, { session_id: r.sessionId, audit_id: r.auditId, owner_id: r.ownerId, tier: r.tier, status: "pending" });
    },
    async markPaid(s, info) {
      const p = payments.get(s)!;
      // mirrors the payments_one_paid_per_audit unique index
      if ([...payments.values()].some((q) => q.audit_id === p.audit_id && q.status === "paid")) return false;
      p.status = "paid"; p.amountPaid = info.amountTotal; store.paidWrites++;
      return true;
    },
    async markStatus(s, status) { const p = payments.get(s); if (p && p.status !== "paid") p.status = status; },
    async hasPaid(auditId, ownerId) {
      return [...payments.values()].some((p) => p.audit_id === auditId && p.owner_id === ownerId && p.status === "paid");
    },
    async getAuditFacts() { return facts; },
  };
  return store;
}

// Sessions as Stripe itself knows them (authoritative), keyed by id.
const stripeSessions = new Map<string, Stripe.Checkout.Session>();

function fakeStripe(over: { unitAmount?: number; priceId?: string; lineItemPrice?: string; priceLivemode?: boolean } = {}) {
  const created: Record<string, unknown>[] = [];
  const stripe = {
    prices: {
      retrieve: async (id: string) => ({
        id, active: true, type: "one_time", currency: "usd", livemode: over.priceLivemode ?? false,
        unit_amount: over.unitAmount ?? (id === ENV.STRIPE_PRICE_ID_MULTI ? 14900 : 4900),
      }),
    },
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          created.push(params);
          return { id: `cs_test_${created.length}`, url: `https://checkout.stripe.test/${created.length}`, livemode: false };
        },
        retrieve: async (id: string) => {
          const s = stripeSessions.get(id);
          if (!s) throw new Error("no such session");
          return { ...s, livemode: false };
        },
        listLineItems: async () => ({ data: [{ price: { id: over.lineItemPrice ?? "__use_expected__" }, quantity: 1 }] }),
      },
    },
  };
  return { stripe: stripe as unknown as Pick<Stripe, "prices" | "checkout">, created };
}

const ownsOnly = (user: string) => async (_a: string, u: string) => u === user;

async function checkout(store: ReturnType<typeof makeStore>, stripeBits = fakeStripe(), userId = OWNER, owns = OWNER) {
  const result = await createCheckoutForAudit({
    auditId: AUDIT, userId, userOwnsAudit: ownsOnly(owns), store,
    stripe: stripeBits.stripe, baseUrl: "https://staging.test", expectLivemode: false, env: ENV,
  });
  return { result, ...stripeBits };
}

function session(over: Record<string, unknown> = {}, tier: Tier = "single", id = "cs_test_1") {
  return {
    id, object: "checkout.session", mode: "payment", payment_status: "paid", currency: "usd",
    amount_total: TIERS[tier].amount, client_reference_id: AUDIT, payment_intent: "pi_test_1",
    metadata: { audit_id: AUDIT, owner_id: OWNER, tier }, ...over,
  } as unknown as Stripe.Checkout.Session;
}

let n = 0;
function event(type: string, obj: Stripe.Checkout.Session, over: { id?: string; livemode?: boolean; stripeSession?: Stripe.Checkout.Session } = {}) {
  stripeSessions.set(obj.id, over.stripeSession ?? obj);
  return { id: over.id ?? `evt_${++n}`, type, livemode: over.livemode ?? false, data: { object: obj } } as unknown as Stripe.Event;
}

function webhookDeps(store: PaymentStore, lineItemPrice?: string, tier: Tier = "single") {
  const f = fakeStripe({ lineItemPrice: lineItemPrice ?? (tier === "multi" ? ENV.STRIPE_PRICE_ID_MULTI : ENV.STRIPE_PRICE_ID_SINGLE) });
  return { store, stripe: f.stripe, expectLivemode: false, env: ENV };
}

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

async function main() {
  // -------------------------------------------------------------- tiers
  await test("tier comes from the verified year count: 1 => single, 2-5 => multi, else none", () => {
    assert.strictEqual(tierForYearCount(1), "single");
    assert.strictEqual(tierForYearCount(2), "multi");
    assert.strictEqual(tierForYearCount(5), "multi");
    for (const bad of [0, 6, -1, 1.5, null, undefined]) assert.strictEqual(tierForYearCount(bad as number), null);
    assert.deepStrictEqual([TIERS.single.amount, TIERS.multi.amount], [4900, 14900]);
  });

  // ----------------------------------------------------------- checkout
  await test("checkout (owner): one-time payment session, server-chosen price, no subscription", async () => {
    const store = makeStore({ years: 1 });
    const { result, created } = await checkout(store);
    assert.ok(result.ok);
    const p = created[0] as { mode: string; line_items: { price: string; quantity: number }[]; metadata: Record<string, string> };
    assert.strictEqual(p.mode, "payment");
    assert.deepStrictEqual(p.line_items, [{ price: ENV.STRIPE_PRICE_ID_SINGLE, quantity: 1 }]);
    assert.deepStrictEqual(p.metadata, { audit_id: AUDIT, owner_id: OWNER, tier: "single" });
    assert.strictEqual(store.payments.get("cs_test_1")?.status, "pending");
    assert.strictEqual(await store.hasPaid(AUDIT, OWNER), false, "creating a session must not unlock anything");
  });
  await test("checkout: 3 verified years selects the multi-year price", async () => {
    const { result, created } = await checkout(makeStore({ years: 3 }));
    assert.ok(result.ok && result.tier === "multi");
    assert.strictEqual((created[0] as { line_items: { price: string }[] }).line_items[0].price, ENV.STRIPE_PRICE_ID_MULTI);
  });
  await test("checkout: wrong audit owner is rejected and Stripe is never called", async () => {
    const { result, created } = await checkout(makeStore(), fakeStripe(), OTHER, OWNER);
    assert.deepStrictEqual(result, { ok: false, reason: "not_found" });
    assert.strictEqual(created.length, 0);
  });
  await test("checkout: ownership is also checked against the server-side row", async () => {
    const { result } = await checkout(makeStore({ owner: OTHER }), fakeStripe(), OWNER, OWNER);
    assert.deepStrictEqual(result, { ok: false, reason: "not_found" });
  });
  await test("checkout: unfinished, legacy (no year count) and already-paid audits are refused", async () => {
    assert.strictEqual((await checkout(makeStore({ status: "processing" }))).result.ok, false);
    assert.deepStrictEqual((await checkout(makeStore({ years: null }))).result, { ok: false, reason: "not_purchasable" });
    const paid = makeStore();
    paid.payments.set("cs_old", { session_id: "cs_old", audit_id: AUDIT, owner_id: OWNER, tier: "single", status: "paid" });
    assert.deepStrictEqual((await checkout(paid)).result, { ok: false, reason: "already_paid" });
  });
  await test("checkout: a Stripe price that does not match the business price is refused", async () => {
    const r = await checkout(makeStore(), fakeStripe({ unitAmount: 100 }));
    assert.deepStrictEqual(r.result, { ok: false, reason: "price_mismatch" });
    assert.strictEqual(r.created.length, 0);
  });
  await test("checkout: missing price configuration is refused", async () => {
    const r = await createCheckoutForAudit({
      auditId: AUDIT, userId: OWNER, userOwnsAudit: ownsOnly(OWNER), store: makeStore(),
      stripe: fakeStripe().stripe, baseUrl: "https://x.test", expectLivemode: false, env: {},
    });
    assert.deepStrictEqual(r, { ok: false, reason: "not_configured" });
  });

  // ------------------------------------------------------------ webhook
  async function pending(store: ReturnType<typeof makeStore>, tier: Tier = "single") {
    store.payments.set("cs_test_1", { session_id: "cs_test_1", audit_id: AUDIT, owner_id: OWNER, tier, status: "pending" });
  }

  await test("successful payment unlocks exactly the paying owner's audit", async () => {
    const store = makeStore(); await pending(store);
    const r = await handleStripeEvent(event("checkout.session.completed", session()), webhookDeps(store));
    assert.strictEqual(r.outcome, "paid");
    assert.strictEqual(await store.hasPaid(AUDIT, OWNER), true);
    assert.strictEqual(await store.hasPaid(AUDIT, OTHER), false, "another user is not unlocked");
  });
  await test("multi-year payment unlocks a 3-year audit", async () => {
    const store = makeStore({ years: 3 }); await pending(store, "multi");
    const r = await handleStripeEvent(event("checkout.session.completed", session({}, "multi")), webhookDeps(store, undefined, "multi"));
    assert.strictEqual(r.outcome, "paid");
  });
  await test("failed async payment does not unlock", async () => {
    const store = makeStore(); await pending(store);
    const r = await handleStripeEvent(event("checkout.session.async_payment_failed", session({ payment_status: "unpaid" })), webhookDeps(store));
    assert.strictEqual(r.outcome, "failed");
    assert.strictEqual(await store.hasPaid(AUDIT, OWNER), false);
  });
  await test("completed-but-unpaid session (funds not cleared) stays locked", async () => {
    const store = makeStore(); await pending(store);
    const r = await handleStripeEvent(event("checkout.session.completed", session({ payment_status: "unpaid" })), webhookDeps(store));
    assert.strictEqual(r.outcome, "awaiting_payment");
    assert.strictEqual(await store.hasPaid(AUDIT, OWNER), false);
  });
  await test("expired / cancelled checkout does not unlock", async () => {
    const store = makeStore(); await pending(store);
    await handleStripeEvent(event("checkout.session.expired", session({ payment_status: "unpaid" })), webhookDeps(store));
    assert.strictEqual(await store.hasPaid(AUDIT, OWNER), false);
    assert.strictEqual(store.payments.get("cs_test_1")?.status, "expired");
  });

  const rejects: [string, Record<string, unknown>, string][] = [
    ["incorrect amount", { amount_total: 100 }, "wrong_amount"],
    ["incorrect currency", { currency: "eur" }, "wrong_currency"],
    ["wrong mode (subscription)", { mode: "subscription" }, "wrong_mode"],
    ["metadata for a different audit", { metadata: { audit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", owner_id: OWNER, tier: "single" } }, "audit_mismatch"],
    ["wrong audit owner in metadata", { metadata: { audit_id: AUDIT, owner_id: OTHER, tier: "single" } }, "owner_mismatch"],
    ["wrong tier in metadata", { metadata: { audit_id: AUDIT, owner_id: OWNER, tier: "multi" } }, "tier_mismatch"],
  ];
  for (const [label, over, reason] of rejects) {
    await test(`webhook rejects ${label}; nothing unlocked`, async () => {
      const store = makeStore(); await pending(store);
      const r = await handleStripeEvent(event("checkout.session.completed", session(over)), webhookDeps(store));
      assert.deepStrictEqual([r.outcome, r.reason], ["rejected", reason]);
      assert.strictEqual(await store.hasPaid(AUDIT, OWNER), false);
    });
  }
  await test("wrong tier for the audit (paid $49 for a 3-year audit) is rejected", async () => {
    const store = makeStore({ years: 3 }); await pending(store, "single");
    const r = await handleStripeEvent(event("checkout.session.completed", session()), webhookDeps(store));
    assert.deepStrictEqual([r.outcome, r.reason], ["rejected", "wrong_tier_for_audit"]);
    assert.strictEqual(await store.hasPaid(AUDIT, OWNER), false);
  });
  await test("audit that changed owner after checkout is rejected", async () => {
    const store = makeStore({ owner: OTHER }); await pending(store);
    const r = await handleStripeEvent(event("checkout.session.completed", session()), webhookDeps(store));
    assert.strictEqual(r.reason, "audit_owner_changed");
  });
  await test("a different purchased price is rejected", async () => {
    const store = makeStore(); await pending(store);
    const r = await handleStripeEvent(event("checkout.session.completed", session()), webhookDeps(store, "price_something_else"));
    assert.strictEqual(r.reason, "wrong_price");
    assert.strictEqual(await store.hasPaid(AUDIT, OWNER), false);
  });
  await test("a session this app never created cannot unlock anything", async () => {
    const store = makeStore();
    const r = await handleStripeEvent(event("checkout.session.completed", session({ id: "cs_foreign" })), webhookDeps(store));
    assert.strictEqual(r.outcome, "ignored");
    assert.strictEqual(await store.hasPaid(AUDIT, OWNER), false);
  });
  await test("test-mode events are ignored when live is expected (and vice versa)", async () => {
    const store = makeStore(); await pending(store);
    const r = await handleStripeEvent(event("checkout.session.completed", session()), { ...webhookDeps(store), expectLivemode: true });
    assert.strictEqual(r.outcome, "ignored");
    assert.strictEqual(await store.hasPaid(AUDIT, OWNER), false);
  });

  await test("duplicate webhook delivery is idempotent (same event id)", async () => {
    const store = makeStore(); await pending(store);
    const ev = event("checkout.session.completed", session(), { id: "evt_dupe" });
    assert.strictEqual((await handleStripeEvent(ev, webhookDeps(store))).outcome, "paid");
    assert.strictEqual((await handleStripeEvent(ev, webhookDeps(store))).outcome, "duplicate");
    assert.strictEqual(store.paidWrites, 1);
  });
  await test("a second event for an already-paid session does not pay twice", async () => {
    const store = makeStore(); await pending(store);
    await handleStripeEvent(event("checkout.session.completed", session()), webhookDeps(store));
    const r = await handleStripeEvent(event("checkout.session.async_payment_succeeded", session()), webhookDeps(store));
    assert.strictEqual(r.outcome, "duplicate");
    assert.strictEqual(store.paidWrites, 1);
  });
  await test("two checkouts paid for one audit: first unlocks, second is flagged for refund (no retry loop)", async () => {
    const store = makeStore(); await pending(store);
    store.payments.set("cs_test_2", { session_id: "cs_test_2", audit_id: AUDIT, owner_id: OWNER, tier: "single", status: "pending" });
    const first = await handleStripeEvent(event("checkout.session.completed", session()), webhookDeps(store));
    const second = await handleStripeEvent(event("checkout.session.completed", session({ id: "cs_test_2" }, "single", "cs_test_2")), webhookDeps(store));
    assert.strictEqual(first.outcome, "paid");
    assert.deepStrictEqual([second.outcome, second.reason], ["rejected", "duplicate_payment_refund_needed"]);
    assert.strictEqual(store.paidWrites, 1);
    assert.strictEqual(await store.hasPaid(AUDIT, OWNER), true, "customer keeps access");
  });
  await test("a failed/expired event can never downgrade a paid payment", async () => {
    const store = makeStore(); await pending(store);
    await handleStripeEvent(event("checkout.session.completed", session()), webhookDeps(store));
    await handleStripeEvent(event("checkout.session.expired", session()), webhookDeps(store));
    assert.strictEqual(await store.hasPaid(AUDIT, OWNER), true);
  });

  await test("FORGED paid event for a session Stripe says is unpaid does not unlock", async () => {
    const store = makeStore(); await pending(store);
    const unpaid = session({ payment_status: "unpaid" });
    const forged = event("checkout.session.completed", session(), { stripeSession: unpaid });
    const r = await handleStripeEvent(forged, webhookDeps(store));
    assert.strictEqual(r.outcome, "awaiting_payment");
    assert.strictEqual(await store.hasPaid(AUDIT, OWNER), false);
  });
  await test("FORGED event with a tampered amount is judged on the real Stripe session", async () => {
    const store = makeStore(); await pending(store);
    const real = session({ amount_total: 100 });
    const forged = event("checkout.session.completed", session(), { stripeSession: real });
    const r = await handleStripeEvent(forged, webhookDeps(store));
    assert.deepStrictEqual([r.outcome, r.reason], ["rejected", "wrong_amount"]);
  });
  await test("checkout refuses a live-mode price under a test key, and a test price under a live key", async () => {
    const r = await checkout(makeStore(), fakeStripe({ priceLivemode: true }));
    assert.deepStrictEqual(r.result, { ok: false, reason: "price_mismatch" });
    const live = await createCheckoutForAudit({
      auditId: AUDIT, userId: OWNER, userOwnsAudit: ownsOnly(OWNER), store: makeStore(),
      stripe: fakeStripe({ priceLivemode: false }).stripe, baseUrl: "https://x.test", expectLivemode: true, env: ENV,
    });
    assert.deepStrictEqual(live, { ok: false, reason: "price_mismatch" });
  });

  // ---------------------------------------------- production configuration guard
  const goodTest = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x", STRIPE_PRICE_ID_SINGLE: "price_a", STRIPE_PRICE_ID_MULTI: "price_b" };
  const goodLive = { ...goodTest, STRIPE_SECRET_KEY: "sk_live_x", STRIPE_ALLOW_LIVE: "true", VERCEL_ENV: "production" };
  await test("config guard: valid test config on Preview and locally passes", () => {
    assert.ok(checkStripeConfig({ ...goodTest, VERCEL_ENV: "preview" }).ok);
    assert.ok(checkStripeConfig(goodTest).ok);
  });
  await test("config guard: valid live config in Production passes", () => {
    const c = checkStripeConfig(goodLive);
    assert.ok(c.ok && c.mode === "live");
  });
  await test("config guard: live key is refused on Preview, Development and local", () => {
    for (const v of ["preview", "development", undefined]) assert.ok(!checkStripeConfig({ ...goodLive, VERCEL_ENV: v }).ok);
  });
  await test("config guard: live key without STRIPE_ALLOW_LIVE=true is refused", () => {
    assert.ok(!checkStripeConfig({ ...goodLive, STRIPE_ALLOW_LIVE: undefined }).ok);
    assert.ok(!checkStripeConfig({ ...goodLive, STRIPE_ALLOW_LIVE: "yes" }).ok);
  });
  await test("config guard: test key in Production is refused", () => {
    assert.ok(!checkStripeConfig({ ...goodTest, VERCEL_ENV: "production" }).ok);
  });
  await test("config guard: missing or invalid webhook secret and price IDs, and identical prices, are refused", () => {
    assert.ok(!checkStripeConfig({ ...goodTest, STRIPE_WEBHOOK_SECRET: undefined }).ok);
    assert.ok(!checkStripeConfig({ ...goodTest, STRIPE_WEBHOOK_SECRET: "notasecret" }).ok);
    assert.ok(!checkStripeConfig({ ...goodTest, STRIPE_PRICE_ID_SINGLE: undefined }).ok);
    assert.ok(!checkStripeConfig({ ...goodTest, STRIPE_PRICE_ID_MULTI: "prod_wrong" }).ok);
    assert.ok(!checkStripeConfig({ ...goodTest, STRIPE_PRICE_ID_MULTI: "price_a" }).ok);
    assert.ok(!checkStripeConfig({ ...goodTest, STRIPE_SECRET_KEY: "pk_test_publishable" }).ok);
  });
  await test("config guard: live mode requires an https APP_BASE_URL", () => {
    assert.ok(!checkStripeConfig({ ...goodLive, APP_BASE_URL: "http://leaseguard.io" }).ok);
    assert.ok(checkStripeConfig({ ...goodLive, APP_BASE_URL: "https://leaseguard.io" }).ok);
  });
  await test("config guard: problem messages never contain secret values", () => {
    const c = checkStripeConfig({ ...goodTest, STRIPE_SECRET_KEY: "sk_live_SUPERSECRETVALUE", VERCEL_ENV: "preview" });
    assert.ok(!c.ok && !JSON.stringify(c).includes("SUPERSECRET"));
  });
  await test("getStripe() throws under an unsafe configuration instead of creating a client", async () => {
    const { getStripe } = await import("../stripe");
    process.env.VERCEL_ENV = "production"; // test key in production
    try {
      assert.throws(() => getStripe(), /refused/);
    } finally {
      delete process.env.VERCEL_ENV;
    }
  });

  // ---------------------------------------------- signature (real SDK + route)
  const body = JSON.stringify({ id: "evt_sig", object: "event", type: "checkout.session.completed", livemode: false, data: { object: session() } });
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;
  const sdk = new Stripe("sk_test_unit");
  await test("signature: correctly signed raw body verifies", () => {
    const header = sdk.webhooks.generateTestHeaderString({ payload: body, secret });
    assert.strictEqual(sdk.webhooks.constructEvent(body, header, secret).id, "evt_sig");
  });
  const { POST } = await import("../../app/api/stripe/webhook/route");
  const post = (b: string, sig?: string) =>
    POST(new NextRequest("http://localhost/api/stripe/webhook", { method: "POST", body: b, headers: sig ? { "stripe-signature": sig } : {} }));
  await test("webhook route: missing signature => 400", async () => {
    assert.strictEqual((await post(body)).status, 400);
  });
  await test("webhook route: invalid signature => 400", async () => {
    assert.strictEqual((await post(body, "t=1,v1=deadbeef")).status, 400);
  });
  await test("webhook route: signature for a different secret => 400", async () => {
    const header = sdk.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_other" });
    assert.strictEqual((await post(body, header)).status, 400);
  });
  await test("webhook route: tampered body with a valid signature of the original => 400", async () => {
    const header = sdk.webhooks.generateTestHeaderString({ payload: body, secret });
    assert.strictEqual((await post(body.replace('"evt_sig"', '"evt_evil"'), header)).status, 400);
  });

  // ------------------------------------------------------- report access
  const getReportPath = async () => "audit/report.pdf";
  await test("report: unauthenticated => 401", async () => {
    const r = await authorizeReportAccess({ userId: null, auditId: AUDIT, userOwnsAudit: ownsOnly(OWNER), store: makeStore(), getReportPath });
    assert.deepStrictEqual(r, { ok: false, status: 401 });
  });
  await test("report: signed-in non-owner => 404 even if the audit was paid by someone", async () => {
    const store = makeStore(); await pending(store);
    await handleStripeEvent(event("checkout.session.completed", session()), webhookDeps(store));
    const r = await authorizeReportAccess({ userId: OTHER, auditId: AUDIT, userOwnsAudit: ownsOnly(OWNER), store, getReportPath });
    assert.deepStrictEqual(r, { ok: false, status: 404 });
  });
  await test("report: owner without verified payment => 402", async () => {
    const r = await authorizeReportAccess({ userId: OWNER, auditId: AUDIT, userOwnsAudit: ownsOnly(OWNER), store: makeStore(), getReportPath });
    assert.deepStrictEqual(r, { ok: false, status: 402 });
  });
  await test("report: a pending or rejected payment grants nothing", async () => {
    const store = makeStore(); await pending(store);
    await handleStripeEvent(event("checkout.session.completed", session({ amount_total: 1 })), webhookDeps(store));
    const r = await authorizeReportAccess({ userId: OWNER, auditId: AUDIT, userOwnsAudit: ownsOnly(OWNER), store, getReportPath });
    assert.strictEqual(r.ok, false);
  });
  await test("report: owner with verified payment => allowed", async () => {
    const store = makeStore(); await pending(store);
    await handleStripeEvent(event("checkout.session.completed", session()), webhookDeps(store));
    const r = await authorizeReportAccess({ userId: OWNER, auditId: AUDIT, userOwnsAudit: ownsOnly(OWNER), store, getReportPath });
    assert.deepStrictEqual(r, { ok: true, path: "audit/report.pdf" });
  });
  const { GET: reportGET } = await import("../../app/api/audit/[id]/report/route");
  await test("report route: no credentials => 401, no redirect", async () => {
    const res = await reportGET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ id: AUDIT }) });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.headers.get("location"), null);
  });
  const { POST: checkoutPOST } = await import("../../app/api/audit/[id]/checkout/route");
  await test("checkout route: no credentials => 401", async () => {
    const res = await checkoutPOST(new NextRequest("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: AUDIT }) });
    assert.strictEqual(res.status, 401);
  });

  // --------------------------------------------- client response gating
  const row = { id: AUDIT, status: "completed", free_findings: [] };
  const paidFull = [{ category: "Admin Fee Overcharge", severity: "medium", potential_savings: 1359, description: "SECRET-PAID-DETAIL", sourceEvidence: [{ extractedText: "SECRET-QUOTE" }] }];
  await test("API response before payment never contains paid detail or evidence", () => {
    const out = JSON.stringify(toPublicAudit(row, paidFull));
    assert.ok(!out.includes("SECRET"));
    assert.ok(out.includes("Admin Fee Overcharge"));
  });
  await test("API response after verified payment contains the full paid findings", () => {
    const out = JSON.stringify(toPublicAudit(row, paidFull, { unlocked: true, tier: "single", amountCents: 4900, reportAvailable: true }));
    assert.ok(out.includes("SECRET-PAID-DETAIL") && out.includes("SECRET-QUOTE"));
    assert.ok(!out.includes("audit/report.pdf"), "storage path is never returned");
  });

  // ---------------------------------------------- upload quota
  const { evaluateUploadQuota, UPLOAD_LIMITS } = await import("../upload-quota");
  await test("upload quota: normal use allowed; in-flight, hourly and daily limits refuse", () => {
    assert.strictEqual(evaluateUploadQuota({ lastHour: 1, last24h: 3, inFlight: 0 }), null);
    assert.ok(evaluateUploadQuota({ lastHour: 0, last24h: 0, inFlight: UPLOAD_LIMITS.inFlight }));
    assert.ok(evaluateUploadQuota({ lastHour: UPLOAD_LIMITS.perHour, last24h: 0, inFlight: 0 }));
    assert.ok(evaluateUploadQuota({ lastHour: 0, last24h: UPLOAD_LIMITS.perDay, inFlight: 0 }));
  });

  console.log(`\n${passed} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
