/**
 * The launch-check panel: reports real mismatches (price, mode, webhook, email), and never returns a secret.
 * Run: npx tsx src/lib/__tests__/admin-config-check.test.ts
 */
import assert from "node:assert/strict";
import { runConfigChecks, type ConfigDeps } from "../admin-config-check";

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  console.log("  ✓", name);
}

const SECRET = "sk_live_SECRETVALUE123";
const WH = "whsec_SECRETWEBHOOK123";
const env = { STRIPE_SECRET_KEY: SECRET, STRIPE_WEBHOOK_SECRET: WH, STRIPE_PRICE_ID_SINGLE: "price_single_abc", STRIPE_PRICE_ID_MULTI: "price_multi_abc", STRIPE_ALLOW_LIVE: "true", VERCEL_ENV: "production", RESEND_API_KEY: "re_SECRETRESEND123" };
const goodPrice = (amount: number) => ({ active: true, type: "one_time", currency: "usd", unit_amount: amount, livemode: true });
const deps = (over: Partial<ConfigDeps> = {}, prices: Record<string, ReturnType<typeof goodPrice>> = {}): ConfigDeps => ({
  env,
  siteUrl: "https://www.leaseguard.io",
  emailColumnsExist: async () => true,
  stripe: {
    prices: { retrieve: async (id: string) => prices[id] ?? (id === "price_single_abc" ? goodPrice(4900) : goodPrice(14900)) },
    webhookEndpoints: { list: async () => ({ data: [{ url: "https://www.leaseguard.io/api/stripe/webhook", status: "enabled", enabled_events: ["checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"], livemode: true }] }) },
  },
  ...over,
});

(async () => {
  await t("a correct setup passes every check", async () => {
    const r = await runConfigChecks(deps());
    assert.ok(r.every((c) => c.ok === true), JSON.stringify(r.filter((c) => c.ok !== true)));
    assert.equal(r.length, 6);
  });

  await t("a price that differs from the website is reported with both amounts", async () => {
    const r = await runConfigChecks(deps({}, { price_single_abc: goodPrice(5900) }));
    const c = r.find((x) => /One-year/.test(x.label))!;
    assert.equal(c.ok, false);
    assert.match(c.detail, /\$59/);
    assert.match(c.detail, /\$49/);
  });

  await t("an archived, recurring, wrong-currency or wrong-mode price is flagged", async () => {
    const bad = { active: false, type: "recurring", currency: "eur", unit_amount: 14900, livemode: false };
    const r = await runConfigChecks(deps({}, { price_multi_abc: bad }));
    const c = r.find((x) => /Multi-year/.test(x.label))!;
    assert.equal(c.ok, false);
    for (const w of [/archived/, /one-time/, /currency/, /different mode/]) assert.match(c.detail, w);
  });

  await t("a missing or incomplete webhook endpoint is reported", async () => {
    const none = await runConfigChecks(deps({ stripe: { prices: deps().stripe!.prices, webhookEndpoints: { list: async () => ({ data: [] }) } } }));
    assert.equal(none.find((c) => /webhook endpoint/.test(c.label))!.ok, false);
    const partial = await runConfigChecks(deps({ stripe: { prices: deps().stripe!.prices, webhookEndpoints: { list: async () => ({ data: [{ url: "https://www.leaseguard.io/api/stripe/webhook", status: "enabled", enabled_events: ["checkout.session.completed"], livemode: true }] }) } } }));
    const c = partial.find((x) => /webhook endpoint/.test(x.label))!;
    assert.equal(c.ok, false);
    assert.match(c.detail, /checkout\.session\.expired/);
  });

  await t("missing email key or migration is reported as not sending", async () => {
    const r = await runConfigChecks(deps({ env: { ...env, RESEND_API_KEY: undefined }, emailColumnsExist: async () => false }));
    assert.equal(r.find((c) => /email provider/.test(c.label))!.ok, false);
    assert.match(r.find((c) => /email provider/.test(c.label))!.detail, /NOT sent/);
    assert.equal(r.find((c) => /bookkeeping/.test(c.label))!.ok, false);
  });

  await t("when Stripe cannot be asked, checks say 'not checked' rather than pass", async () => {
    const r = await runConfigChecks(deps({ stripe: null }));
    assert.equal(r.filter((c) => c.ok === null).length, 3);
    const throwing = await runConfigChecks(deps({ stripe: { prices: { retrieve: async () => { throw new Error("denied"); } }, webhookEndpoints: { list: async () => { throw new Error("denied"); } } } }));
    assert.equal(throwing.filter((c) => c.ok === null).length, 3);
  });

  await t("no output ever contains a key, webhook secret or price id", async () => {
    for (const d of [deps(), deps({ stripe: null }), deps({}, { price_single_abc: goodPrice(1) })]) {
      const blob = JSON.stringify(await runConfigChecks(d));
      for (const secret of [SECRET, WH, "SECRETRESEND", "price_single_abc", "price_multi_abc", "SECRETVALUE", "SECRETWEBHOOK"]) assert.ok(!blob.includes(secret), `leaked ${secret}`);
    }
  });

  console.log(`admin-config-check: ${n} passed, 0 failed`);
})().catch((e) => { console.error(e); process.exit(1); });
