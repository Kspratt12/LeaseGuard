/**
 * Purchase confirmation email: sent once, only after verified payment, never leaks personal data into logs.
 * No network, no database: store, sender and clock are in-memory.
 * Run: npx tsx src/lib/__tests__/purchase-email.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SUPPORT_EMAIL } from "../constants";
import { buildPurchaseEmail, configuredSender, resendSender, sendPurchaseConfirmation, type EmailStore, type PurchaseFacts } from "../purchase-email";

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  console.log("  ✓", name);
}

const EMAIL = "tenant.person@example.invalid";
const facts = (over: Partial<PurchaseFacts> = {}): PurchaseFacts => ({
  sessionId: "cs_live_abc123", auditId: "11111111-2222-3333-4444-555555555555", ownerId: "owner-1",
  tier: "single", amountCents: 4900, currency: "usd", paidAt: "2026-11-02T15:04:05.000Z", ...over,
});

function memory(f: PurchaseFacts | null, opts: { email?: string | null } = {}) {
  const row = { claimed: false, sent: false, error: null as string | null };
  const store: EmailStore = {
    async loadPaidPayment() { return f; },
    async claim() { await Promise.resolve(); if (row.claimed || row.sent) return false; row.claimed = true; return true; },
    async markSent() { row.sent = true; },
    async release(_s, code) { row.claimed = false; row.error = code; },
    async getOwnerEmail() { return opts.email === undefined ? EMAIL : opts.email; },
  };
  return { store, row };
}
const logs = () => { const lines: string[] = []; return { lines, log: { info: (m: string) => lines.push(m), error: (m: string) => lines.push(m) } }; };

(async () => {
  await t("a verified payment sends exactly one email to the account address", async () => {
    const { store, row } = memory(facts());
    const sent: Array<{ to: string; subject: string; idempotencyKey: string }> = [];
    const l = logs();
    const out = await sendPurchaseConfirmation({ sessionId: "cs_live_abc123", store, log: l.log, send: async (m) => { sent.push(m); return { ok: true }; } });
    assert.equal(out, "sent");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, EMAIL);
    assert.equal(sent[0].idempotencyKey, "purchase-confirmation/cs_live_abc123");
    assert.equal(row.sent, true);
  });

  await t("the same event delivered twice, or two events at once, still sends one email", async () => {
    const { store } = memory(facts());
    let count = 0;
    const send = async () => { count++; return { ok: true as const }; };
    const results = await Promise.all([1, 2, 3].map(() => sendPurchaseConfirmation({ sessionId: "cs_live_abc123", store, send, log: logs().log })));
    assert.equal(count, 1);
    assert.deepEqual(results.filter((r) => r === "sent").length, 1);
    assert.ok(results.every((r) => r === "sent" || r === "skipped_already_sent"));
  });

  await t("no email for a payment that is not verified as paid", async () => {
    const { store } = memory(null);
    let count = 0;
    const out = await sendPurchaseConfirmation({ sessionId: "cs_x", store, log: logs().log, send: async () => { count++; return { ok: true }; } });
    assert.equal(out, "skipped_not_paid");
    assert.equal(count, 0);
  });

  await t("with no provider key nothing is claimed or sent, and the log says so", async () => {
    const { store, row } = memory(facts());
    const l = logs();
    const out = await sendPurchaseConfirmation({ sessionId: "s", store, send: null, log: l.log });
    assert.equal(out, "skipped_not_configured");
    assert.equal(row.claimed, false);
    assert.ok(l.lines.some((x) => /not configured/.test(x)));
    assert.equal(configuredSender({}), null);
    assert.equal(configuredSender({ RESEND_API_KEY: "not-a-key" }), null);
    assert.ok(configuredSender({ RESEND_API_KEY: "re_test_key_value" }));
  });

  await t("a provider failure releases the claim, records a code, and is logged without personal data", async () => {
    const { store, row } = memory(facts());
    const l = logs();
    const out = await sendPurchaseConfirmation({ sessionId: "s", store, log: l.log, send: async () => ({ ok: false, code: "http_429" }) });
    assert.equal(out, "failed");
    assert.equal(row.claimed, false);
    assert.equal(row.error, "http_429");
    const blob = l.lines.join("\n");
    assert.ok(/ACTION REQUIRED/.test(blob) && /http_429/.test(blob));
    assert.ok(!blob.includes(EMAIL) && !blob.includes("tenant") && !blob.includes("cs_live"), "log contains personal data or the Stripe session id");
    // and a later attempt can still succeed
    assert.equal(await sendPurchaseConfirmation({ sessionId: "s", store, log: logs().log, send: async () => ({ ok: true }) }), "sent");
  });

  await t("a sender that throws never escapes into the webhook", async () => {
    const { store } = memory(facts());
    const out = await sendPurchaseConfirmation({ sessionId: "s", store, log: logs().log, send: async () => { throw new Error("boom " + EMAIL); } });
    assert.equal(out, "failed");
  });

  await t("an account with no address is reported, not guessed", async () => {
    const { store, row } = memory(facts(), { email: null });
    const out = await sendPurchaseConfirmation({ sessionId: "s", store, log: logs().log, send: async () => ({ ok: true }) });
    assert.equal(out, "skipped_no_address");
    assert.equal(row.error, "no_address");
  });

  await t("the Resend call carries the key, an idempotency key, no attachment, and maps errors to codes only", async () => {
    let seen: { headers: Record<string, string>; body: Record<string, unknown> } | null = null;
    const ok = resendSender({ apiKey: "re_secret_value", from: "LeaseGuard <noreply@leaseguard.io>", replyTo: "support@leaseguard.io", fetchImpl: (async (_u: unknown, init: RequestInit) => { seen = { headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) }; return new Response("{}", { status: 200 }); }) as typeof fetch });
    assert.deepEqual(await ok({ to: EMAIL, subject: "s", html: "<p>x</p>", text: "x", idempotencyKey: "k1" }), { ok: true });
    assert.equal(seen!.headers["Idempotency-Key"], "k1");
    assert.ok(!("attachments" in seen!.body));
    assert.deepEqual(seen!.body.to, [EMAIL]);
    const bad = resendSender({ apiKey: "re_x", from: "a", replyTo: "b", fetchImpl: (async () => new Response("{\"message\":\"the key re_x leaked\"}", { status: 403 })) as typeof fetch });
    const r = await bad({ to: EMAIL, subject: "s", html: "h", text: "t", idempotencyKey: "k" });
    assert.deepEqual(r, { ok: false, code: "http_403" });
    const down = resendSender({ apiKey: "re_x", from: "a", replyTo: "b", fetchImpl: (async () => { throw new Error("dns"); }) as typeof fetch });
    assert.deepEqual(await down({ to: EMAIL, subject: "s", html: "h", text: "t", idempotencyKey: "k" }), { ok: false, code: "network" });
  });

  await t("the email names the review, the exact amount, links to the results page and has no attachment promise it cannot keep", () => {
    const one = buildPurchaseEmail(facts());
    assert.match(one.html, /One-year CAM review/);
    assert.match(one.html, /\$49\.00 USD/);
    assert.match(one.text, /\$49\.00 USD/);
    assert.ok(one.html.includes("https://www.leaseguard.io/audit/11111111-2222-3333-4444-555555555555"));
    assert.match(one.text, /November 2, 2026/);
    const multi = buildPurchaseEmail(facts({ tier: "multi", amountCents: 14900 }));
    assert.match(multi.html, /Multi-year CAM review \(2 to 5 years\)/);
    assert.match(multi.html, /\$149\.00 USD/);
    for (const part of [one.html, one.text]) {
      assert.match(part, /CAM Review Plan/);
      assert.match(part, /dispute letter/i);
      assert.match(part, /support@leaseguard\.io/);
      assert.match(part, /not attached|not legal or accounting advice/);
    }
    assert.ok(!/confirmed overcharge|you will recover|guarantee(d)? (a )?refund|proven|violation/i.test(one.html.replace(/does not guarantee any refund/g, "")), "email makes a claim it cannot support");
  });

  await t("the email is mobile friendly: fluid width, viewport tag, a large button, plain-text part", () => {
    const e = buildPurchaseEmail(facts());
    assert.match(e.html, /name="viewport"/);
    assert.match(e.html, /max-width:600px/);
    assert.match(e.html, /padding:14px 24px/);
    assert.ok(e.text.length > 200);
  });

  await t("the email never contains script, remote images, or anything taken from a document", () => {
    const e = buildPurchaseEmail(facts());
    assert.ok(!/<script|<img|<iframe|onerror=/i.test(e.html));
  });

  await t("the webhook sends the email only for a freshly verified payment and never changes its answer because of it", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../app/api/stripe/webhook/route.ts"), "utf8");
    assert.match(src, /result\.outcome === "paid"[\s\S]*sendPurchaseConfirmation/);
    const afterSend = src.slice(src.indexOf("sendPurchaseConfirmation({"));
    assert.match(afterSend, /return NextResponse\.json\(\{ received: true/);
    assert.ok(!/status: 500/.test(afterSend.split("catch")[0]), "an email problem must not produce a 500");
  });

  await t("the migration only adds nullable columns", () => {
    const sql = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/20261101_payment_confirmation_email.sql"), "utf8");
    assert.ok(!/drop |delete |truncate |not null/i.test(sql.replace(/--.*$/gm, "")));
    assert.equal((sql.match(/add column if not exists/g) ?? []).length, 3);
  });

  await t("support address: on our own domain, used as the confirmation email's Reply-To and shown in its text", () => {
    assert.equal(SUPPORT_EMAIL, "support@leaseguard.io");
    const src = fs.readFileSync(path.join(__dirname, "../purchase-email.ts"), "utf8");
    assert.match(src, /replyTo: SUPPORT_EMAIL/, "the Reply-To must come from the constant");
    assert.match(buildPurchaseEmail(facts()).text, /support@leaseguard\.io/);
  });

  await t("no shipped source points customers at a domain we do not own", () => {
    // The old domain is assembled at run time, so this file never contains the string it searches for.
    const OLD_DOMAIN = ["leaseguard", "ai"].join(".");
    const containsOld = (s: string) => s.toLowerCase().includes(OLD_DOMAIN);
    assert.ok(containsOld("mailto:support@" + OLD_DOMAIN) && containsOld("WWW." + OLD_DOMAIN.toUpperCase()), "the matcher must catch the address and other spellings of case");
    assert.ok(!containsOld("support@leaseguard.io"), "and must not flag our own domain");
    const root = path.join(__dirname, "../../..");
    const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|mdx|txt|xml|html|css|svg)$/i;
    const files: string[] = [path.join(root, "next.config.ts")];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p); else if (TEXT.test(e.name)) files.push(p);
      }
    };
    for (const d of ["src", "scripts", "public"]) if (fs.existsSync(path.join(root, d))) walk(path.join(root, d));
    assert.ok(files.length > 150, "the scan must really walk the project (walked " + files.length + ")");
    const hits = files.filter((p) => containsOld(fs.readFileSync(p, "utf8"))).map((p) => path.relative(root, p));
    assert.deepEqual(hits, [], "files that still mention the old domain");
  });

  console.log(`purchase-email: ${n} passed, 0 failed`);
})().catch((e) => { console.error(e); process.exit(1); });
