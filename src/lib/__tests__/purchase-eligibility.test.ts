/**
 * An audit may be sold only when it has something real to unlock. Covers the rule itself, the real audit engine on good
 * and poor documents, attempts to start a checkout directly (bypassing the screen), and a scan proving the invented
 * placeholder findings are gone from the code.
 *
 * Run: npx tsx src/lib/__tests__/purchase-eligibility.test.ts
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type Stripe from "stripe";
import { decidePurchase, purchaseInputFromRow, type PurchaseInput } from "../purchase-eligibility";
import { createCheckoutForAudit, type PaymentStore } from "../payments";

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  process.stdout.write(`  ✓ ${name}\n`);
}

const base = (over: Partial<PurchaseInput> = {}): PurchaseInput => ({
  freeFindings: [], paidFindings: [], overchargeBreakdown: [], leaseClausesSummary: null, auditMode: "full", confidence: "high", validationWarning: null, ...over,
});
const calculated = { category: "Admin Fee Above Lease Cap", description: "x", potential_savings: 1359, severity: "medium" as const };
const insufficient = { category: "CAM Cap Review: Prior-Year Data Needed", description: "x", potential_savings: 0, severity: "medium" as const, insufficientData: true };
const summaryOnly = { category: "Document Review Summary", description: "x", potential_savings: 0, severity: "medium" as const, insufficientData: true };
const note = { category: "Pro Rata Share Consistent", description: "x", potential_savings: 0, severity: "low" as const };
const judgment = { category: "Pro Rata Share Difference", description: "x", potential_savings: 0, severity: "medium" as const };
const row = { category: "roof repair", total_expense: 24500, tenant_share_percent: 8.08, tenant_charge: 1979.6, reason: "excluded" } as never;

(async () => {
  // ── the four scenarios the review asked for ──
  await t("1. EMPTY findings: not sellable, and NOT presented as a clean result", () => {
    const d = decidePurchase(base());
    assert.deepEqual(d, { eligible: false, reason: "insufficient_analysis" });
  });

  await t("1b. a legitimate completed audit that found NO discrepancies: not sellable, reported as 'nothing to unlock' (a normal result)", () => {
    const d = decidePurchase(base({ freeFindings: [note], paidFindings: [] }));
    assert.deepEqual(d, { eligible: false, reason: "nothing_to_unlock" });
  });

  await t("2. INSUFFICIENT data (only 'needs data' findings, or only the engine's summary finding): not sellable", () => {
    assert.deepEqual(decidePurchase(base({ freeFindings: [insufficient] })), { eligible: false, reason: "insufficient_analysis" });
    assert.deepEqual(decidePurchase(base({ freeFindings: [summaryOnly] })), { eligible: false, reason: "insufficient_analysis" });
    assert.deepEqual(decidePurchase(base({ freeFindings: [insufficient, note], paidFindings: [insufficient] })), { eligible: false, reason: "insufficient_analysis" });
  });

  await t("2b. a limited-mode audit with nothing actionable is insufficient, not clean", () => {
    assert.deepEqual(decidePurchase(base({ auditMode: "limited", freeFindings: [note] })), { eligible: false, reason: "insufficient_analysis" });
  });

  await t("3. LEGITIMATE findings: sellable and complete", () => {
    assert.deepEqual(decidePurchase(base({ paidFindings: [calculated] })), { eligible: true, completeness: "complete", notes: [] });
    // findings in the free tier alone are enough: the PDF, plan and letter are real deliverables built from them
    assert.equal(decidePurchase(base({ freeFindings: [calculated] })).eligible, true);
    // an excluded-expense row, or a flagged item that needs the landlord's answer, is real too
    assert.equal(decidePurchase(base({ overchargeBreakdown: [row] })).eligible, true);
    assert.equal(decidePurchase(base({ freeFindings: [judgment] })).eligible, true);
  });

  await t("3b. real findings with incomplete checks are sellable ONLY as a disclosed partial analysis", () => {
    const withMissing = decidePurchase(base({ paidFindings: [calculated], freeFindings: [insufficient] }));
    assert.equal(withMissing.eligible, true);
    assert.equal((withMissing as { completeness: string }).completeness, "partial");
    assert.match((withMissing as { notes: string[] }).notes.join(" "), /could not be completed/);
    const limited = decidePurchase(base({ auditMode: "limited", paidFindings: [calculated] }));
    assert.equal((limited as { completeness: string }).completeness, "partial");
    const unreadable = decidePurchase(base({ paidFindings: [calculated], validationWarning: "Page 2 of your lease had no readable text, so anything printed there was not reviewed." }));
    assert.equal((unreadable as { completeness: string }).completeness, "partial");
    // an informational warning is not an incomplete analysis
    const info = decidePurchase(base({ paidFindings: [calculated], validationWarning: "Total estimated from detected line items." }));
    assert.equal((info as { completeness: string }).completeness, "complete");
  });

  await t("malformed or missing stored data never counts as a finding and never throws", () => {
    for (const bad of [null, undefined, {}, { free_findings: "x", paid_findings: 7, overcharge_breakdown: {} }, { free_findings: [null, 3, {}, { category: 5 }] }]) {
      const d = decidePurchase(purchaseInputFromRow(bad as never));
      assert.equal(d.eligible, false);
    }
  });

  // ── the real engine, on realistic and poor documents ──
  const FIX = path.join(__dirname, "../../services/__tests__/fixtures");
  const clean = (l: string) => l.replace(/\r/g, "").replace(/[^\x20-\x7E]/g, "-");
  const textPdf = async (lines: string[]) => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Courier);
    for (let i = 0; i < lines.length; i += 60) {
      const page = pdf.addPage([612, 792]);
      lines.slice(i, i + 60).forEach((l, k) => page.drawText(l, { x: 36, y: 756 - k * 10.8, size: 8.5, font }));
    }
    return Buffer.from(await pdf.save());
  };
  const logs = { log: console.log, warn: console.warn, error: console.error };
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const { validateDocuments } = await import("../../services/document-validator");
  const { runAudit } = await import("../../services/audit-logic");
  const fromResult = (r: Awaited<ReturnType<typeof runAudit>>) =>
    purchaseInputFromRow({ free_findings: r.free_findings, paid_findings: r.paid_findings, overcharge_breakdown: r.overcharge_breakdown, lease_clauses_summary: r.leaseClausesSummary, audit_mode: r.auditMode, confidence: r.confidence, validation_warning: r.validationWarning });

  const lease = (await textPdf(fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf8").split("\n").map(clean)));
  const recon = (await textPdf(fs.readFileSync(path.join(FIX, "recon-high-confidence.txt"), "utf8").split("\n").map(clean)));
  const good = await validateDocuments(lease, recon);
  good.leaseFields.adminFeePercentage = "15";
  good.reconFields.adminFeePercentage = "18";
  if (!good.reconFields.lineItems.some((i) => /management fee/i.test(i.category))) good.reconFields.lineItems.push({ category: "Management Fee", amount: "100,897.20", rawLine: "Management Fee (18%)  $91,080.00  $100,897.20" });
  const goodResult = await runAudit(good);

  const readableButIrrelevant = await textPdf(("Grandmother's apple cake: mix flour, sugar and eggs, then bake for forty minutes until golden brown. ".repeat(6) + "\n").repeat(3).split("\n"));
  const poor = await validateDocuments(readableButIrrelevant, readableButIrrelevant);
  const poorResult = await runAudit(poor);
  console.log = logs.log; console.warn = logs.warn; console.error = logs.error;

  await t("REAL ENGINE: a normal lease + statement with genuine findings is sellable", () => {
    const d = decidePurchase(fromResult(goodResult));
    assert.equal(d.eligible, true, JSON.stringify(d));
  });

  await t("REAL ENGINE: readable but unrelated documents produce an audit that is NOT sellable and NOT called clean", () => {
    const d = decidePurchase(fromResult(poorResult));
    assert.deepEqual(d, { eligible: false, reason: "insufficient_analysis" }, "findings were: " + [...poorResult.free_findings, ...poorResult.paid_findings].map((f) => f.category).join(", "));
  });

  // ── trying to bypass the screen: start a checkout directly ──
  const OWNER = "11111111-1111-1111-1111-111111111111";
  const AUDIT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const attempt = async (purchase: PurchaseInput | null, opts: { paid?: boolean; years?: number | null } = {}) => {
    const calls = { retrieve: 0, create: 0, pending: 0 };
    const store = {
      async hasPaid() { return !!opts.paid; },
      async getAuditFacts() { return { owner_id: OWNER, status: "completed", recon_year_count: opts.years === undefined ? 1 : opts.years }; },
      async getPurchaseFacts() { return purchase; },
      async createPending() { calls.pending++; },
    } as unknown as PaymentStore;
    const stripe = {
      prices: { retrieve: async () => { calls.retrieve++; return { active: true, type: "one_time", currency: "usd", livemode: false, unit_amount: 4900 }; } },
      checkout: { sessions: { create: async () => { calls.create++; return { id: "cs_x", url: "https://checkout.example/x", livemode: false }; } } },
    } as unknown as Pick<Stripe, "prices" | "checkout">;
    const result = await createCheckoutForAudit({
      auditId: AUDIT, userId: OWNER, userOwnsAudit: async () => true, store, stripe, baseUrl: "https://x.test", expectLivemode: false,
      env: { STRIPE_PRICE_ID_SINGLE: "price_s", STRIPE_PRICE_ID_MULTI: "price_m" },
    });
    return { result, calls };
  };

  await t("BYPASS: a direct checkout request for an audit with no findings is refused, and Stripe is never contacted", async () => {
    const { result, calls } = await attempt(base());
    assert.deepEqual(result, { ok: false, reason: "insufficient_analysis" });
    assert.deepEqual(calls, { retrieve: 0, create: 0, pending: 0 });
  });

  await t("BYPASS: a direct checkout request for a clean audit is refused with no Stripe session and no payment row", async () => {
    const { result, calls } = await attempt(base({ freeFindings: [note] }));
    assert.deepEqual(result, { ok: false, reason: "nothing_to_unlock" });
    assert.deepEqual(calls, { retrieve: 0, create: 0, pending: 0 });
  });

  await t("BYPASS: an insufficient-data audit cannot be bought, whatever the browser sends", async () => {
    const { result, calls } = await attempt(base({ freeFindings: [insufficient, summaryOnly], auditMode: "limited" }));
    assert.equal(result.ok, false);
    assert.equal(calls.create, 0);
  });

  await t("BYPASS: a missing audit row cannot be bought", async () => {
    const { result, calls } = await attempt(null);
    assert.deepEqual(result, { ok: false, reason: "not_found" });
    assert.equal(calls.create, 0);
  });

  await t("a legitimate audit still reaches Stripe and gets a checkout URL (and so does a disclosed partial one)", async () => {
    const full = await attempt(base({ paidFindings: [calculated] }));
    assert.equal(full.result.ok, true);
    assert.equal(full.calls.create, 1);
    const partial = await attempt(base({ paidFindings: [calculated], freeFindings: [insufficient] }));
    assert.equal(partial.result.ok, true);
  });

  await t("already-paid is still reported as already paid, ahead of the eligibility check", async () => {
    const { result } = await attempt(base(), { paid: true });
    assert.deepEqual(result, { ok: false, reason: "already_paid" });
  });

  await t("the checkout route answers both refusals with a plain 409, and it is the only code that creates Stripe sessions", () => {
    const SRC = path.join(__dirname, "../..");
    const route = fs.readFileSync(path.join(SRC, "app/api/audit/[id]/checkout/route.ts"), "utf8");
    assert.match(route, /nothing_to_unlock: \[409,/);
    assert.match(route, /insufficient_analysis: \[409,/);
    const walk = (d: string, out: string[] = []) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== "__tests__") walk(f, out); }
        else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(f);
      }
      return out;
    };
    const creators = walk(SRC).filter((f) => /checkout\.sessions\.create\(/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(SRC, f).replace(/\\/g, "/"));
    assert.deepEqual(creators, ["lib/payments.ts"], "another code path can create a checkout session");
  });

  await t("the invented placeholder findings are gone from the code", () => {
    const SRC = path.join(__dirname, "../..");
    const walk = (d: string, out: string[] = []) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== "__tests__") walk(f, out); }
        else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(f);
      }
      return out;
    };
    const banned = [/lockedPlaceholders/, /Roof replacement costs classified as routine maintenance/, /per lease section 5\.4/, /Insurance Allocation Discrepancy/, /Capital Improvement Charge Passed Through/, /Pro Rata Share Calculation Issue/];
    const hits = walk(SRC).flatMap((f) => banned.filter((re) => re.test(fs.readFileSync(f, "utf8"))).map((re) => `${path.relative(SRC, f)}: ${re}`));
    assert.deepEqual(hits, []);
  });

  process.stdout.write(`purchase-eligibility: ${n} passed, 0 failed\n`);
  process.exit(0);
})().catch((e) => {
  process.stdout.write(String(e instanceof Error ? e.stack : e) + "\n");
  process.exit(1);
});
