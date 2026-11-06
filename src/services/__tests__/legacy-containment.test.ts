/**
 * Read-time containment of audits stored BEFORE cap and gross-up amounts were withheld.
 *
 * Fictional records only, shaped exactly like what the earlier engine stored. Nothing is read from or written to a
 * database, no AI runs, and NO NETWORK: every outbound path is replaced with one that throws and counts.
 *
 * Two kinds of test, so the same file doubles as a NEGATIVE CONTROL when run against the previous implementation
 * (LG_NEGATIVE_CONTROL=1, in an isolated copy of the tree):
 *   "legacy"    - pins the safeguard. On the previous implementation these MUST fail, proving they detect the problem.
 *   "invariant" - pins behavior that must not change. These MUST pass on both implementations.
 *
 * Run: npx tsx src/services/__tests__/legacy-containment.test.ts
 */
delete process.env.ANTHROPIC_API_KEY;

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import React from "react";
// @ts-expect-error the react-dom type package is not installed; the module itself is
import { renderToStaticMarkup } from "react-dom/server";
import { PDFDocument, StandardFonts } from "pdf-lib";

// ── network isolation ────────────────────────────────────────────────────────────────────────────────────────────
const blocked: string[] = [];
const refuse = (what: string) => (..._args: unknown[]): never => {
  blocked.push(what);
  throw new Error(`network blocked: ${what}`);
};
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).fetch = async () => {
  blocked.push("fetch");
  throw new Error("network blocked: fetch");
};
for (const [name, mod] of [["http", http], ["https", https]] as const) {
  (mod as any).request = refuse(`${name}.request`);
  (mod as any).get = refuse(`${name}.get`);
}
(net as any).connect = refuse("net.connect");
(net as any).createConnection = refuse("net.createConnection");
(net.Socket.prototype as any).connect = refuse("net.Socket.connect");
(tls as any).connect = refuse("tls.connect");
(dns as any).lookup = refuse("dns.lookup");
(dns as any).resolve = refuse("dns.resolve");
(dns.promises as any).lookup = async () => refuse("dns.promises.lookup")();
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── runner: fail-fast normally; record-and-continue as a negative control ─────────────────────────────────────────
const CONTROL = process.env.LG_NEGATIVE_CONTROL === "1";
type Kind = "legacy" | "invariant";
const results: { name: string; kind: Kind; ok: boolean; why?: string }[] = [];
async function test(kind: Kind, name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ name, kind, ok: true });
    console.log(`  ✓ [${kind}] ${name}`);
  } catch (e) {
    const why = (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 160);
    results.push({ name, kind, ok: false, why });
    if (!CONTROL) throw e;
    console.log(`  ✗ [${kind}] ${name} -- ${why}`);
  }
}

const FIX = path.join(__dirname, "fixtures");
const SRC = path.join(__dirname, "../..");

async function textToPdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 68) {
    const page = pdf.addPage([612, 792]);
    lines.slice(i, i + 68).forEach((l, j) =>
      page.drawText(l.replace(/[^\x20-\x7E]/g, "-"), { x: 36, y: 756 - j * 10.5, size: 8, font }),
    );
  }
  return Buffer.from(await pdf.save());
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const deepFreeze = <T,>(o: T): T => {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o as any)) deepFreeze(v);
  }
  return o;
};
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

// ── legacy records: exactly what the earlier engine stored ────────────────────────────────────────────────────────
const SEV = { high: "high", medium: "medium", low: "low" } as const;
const FEE = { category: "Admin Fee Above Lease Cap", description: "Management fee billed at 18% against a 15% lease limit.", potential_savings: 1359, severity: SEV.medium };
const OLD_CAP_SINGLE = {
  category: "Potential CAM Cap Exceedance",
  description:
    "The lease limits annual CAM or controllable expense increases to 5%. Total CAM charges of $53,444.13 were detected in the reconciliation statement. " +
    "Year-over-year charges increased 33.6% (from $40,000 to $53,444.13), which is above the 5% cap. The maximum allowable amount under that cap would be $42,000, a potential excess of $11,444 to review.",
  potential_savings: 11444,
  severity: SEV.high,
  sourceEvidence: [
    { document: "lease.pdf", page: 2, extractedText: "increases in controllable expenses are limited to 5%" },
    { document: "recon.pdf", page: null, extractedText: "Prior Year Total $40,000.00" },
  ],
};
const OLD_CAP_MULTI = {
  category: "Year-over-Year CAM Escalation Exceeds Lease Cap",
  description:
    "CAM charges increased 15.0% from 2023 ($400,000) to 2024 ($460,000), which is above the lease CAM cap of 5%. Applying the cap, the total for 2024 would be $420,000. " +
    "Potential discrepancy: $40,000. This is a calculation from the documents, not a confirmed overcharge.",
  potential_savings: 40000,
  severity: SEV.high,
  sourceEvidence: [
    { document: "statement-2023.pdf", page: null, extractedText: "2023 Total: $400,000" },
    { document: "statement-2024.pdf", page: null, extractedText: "2024 Total: $460,000" },
  ],
};
const OLD_GROSS = {
  category: "Possible Gross-Up / Occupancy Adjustment",
  description:
    "The uploaded documents suggest a possible gross-up or occupancy-based adjustment to operating expenses. Certain controllable categories increased materially year-over-year. " +
    "Review recommended to confirm whether expenses were adjusted beyond what the lease permits. Potential review amount: $25,897.",
  potential_savings: 25897,
  severity: SEV.high,
  sourceEvidence: [{ document: "lease.pdf", page: 3, extractedText: "grossed up to 95% occupancy" }],
};
const OLD_GROSS_NO_AMOUNT = { ...OLD_GROSS, description: "Review recommended to confirm whether expenses were adjusted beyond what the lease permits.", potential_savings: 0, severity: SEV.medium };
const GROSS_LANGUAGE_ONLY = {
  category: "Possible Gross-Up / Occupancy Adjustment",
  description: "Gross-up language was detected. Insufficient year-over-year line-item data was available to confirm.",
  potential_savings: 0,
  severity: SEV.low,
  insufficientData: true,
};
const PRO_RATA = { category: "Pro-Rata Share Mismatch", description: "Share on the statement differs from the lease.", potential_savings: 612, severity: SEV.high };
const LCS = {
  camCap: "5%", adminFeeCap: "15%", managementFeeCap: null, tenantProRataShare: "8.08%", tenantSquareFootage: null, buildingSquareFootage: null,
  excludedCategories: ["roof repair"], additionalClauses: [],
};
const row = (over: Record<string, unknown>) => ({
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", status: "completed", created_at: "2026-09-01T00:00:00.000Z",
  free_findings: [], paid_findings: [], overcharge_breakdown: [], estimated_overcharge: 0,
  lease_clauses_summary: LCS, audit_mode: "full", confidence: "high", confidence_score: 70, validation_warning: null, recon_year_count: 2,
  ...over,
});
/** The $67,256 fixture, in the format the earlier engine STORED it: fee 1,359 + total-change excess 40,000 + gross-up 25,897. */
const TRIPLE_LEGACY = () => row({ free_findings: [FEE], paid_findings: [OLD_CAP_MULTI, OLD_GROSS], savings_estimate: 67256 });
/** Nothing but the two unsupported legacy checks (plus their statement-level observation). */
const ONLY_LEGACY = () => row({ free_findings: [OLD_CAP_SINGLE], paid_findings: [OLD_GROSS], savings_estimate: 37341 });

const OLD_FIGURES = ["$11,444", "$40,000", "$25,897", "$42,000", "$420,000", "$67,256", "$37,341", "$65,897"];
const OLD_PROSE = /potential excess|allowable amount under|maximum allowable|Applying the cap|Potential discrepancy: \$(40,000|11,444)|Potential review amount|Year-over-Year CAM Escalation Exceeds Lease Cap|Potential CAM Cap Exceedance/i;
const LEGAL = /\b(owed|you owe|illegal|unlawful|fraud\w*|breach(es|ed)?|entitled|violat\w*|must (pay|refund|reimburse)|lawsuit|sue|statutes?|law requires)\b/i;
const expectClean = (label: string, text: string) => {
  for (const f of OLD_FIGURES) assert.ok(!text.includes(f), `${label}: still shows ${f}`);
  assert.ok(!OLD_PROSE.test(text), `${label}: old adjustment prose survives: ${text.match(OLD_PROSE)?.[0]}`);
};

async function main() {
  await test("invariant", "NETWORK: every outbound path refuses and is counted (canary), then the counter is reset", async () => {
    await assert.rejects(() => fetch("https://example.invalid/"), /network blocked/);
    assert.throws(() => https.get("https://example.invalid/"), /network blocked/);
    assert.ok(blocked.length >= 2);
    blocked.length = 0;
  });

  const { toPublicAudit } = await import("../../lib/audit-access");
  const { decidePurchase, purchaseInputFromRow } = await import("../../lib/purchase-eligibility");
  const { buildDisputeLetter } = await import("../dispute-letter");
  const { buildReviewPlan } = await import("../review-plan");
  const { generateReportPdf } = await import("../report-pdf");
  const { extractTextFromPdf, validateDocuments } = await import("../document-validator");
  const { runAudit } = await import("../audit-logic");
  const { createCheckoutForAudit, handleStripeEvent, authorizeReportAccess } = await import("../../lib/payments");
  const { getLeaseClauseEvidence } = await import("../../lib/lease-clause-evidence");
  const { findingKind } = await import("../finding-classification");
  const { AuditResultsFree } = await import("../../components/audit-results-free");
  const { NoPurchasePanel } = await import("../../components/audit-no-purchase");
  const { formatMoney } = await import("../../lib/format");
  const adapter = () => import("../../lib/legacy-containment");

  const publicView = (r: ReturnType<typeof row>, unlocked: boolean) =>
    toPublicAudit(
      { id: r.id, status: r.status, savings_estimate: (r as any).savings_estimate, free_findings: r.free_findings, confidence: r.confidence, lease_clauses_summary: r.lease_clauses_summary, overcharge_breakdown: r.overcharge_breakdown, estimated_overcharge: r.estimated_overcharge },
      r.paid_findings,
      { unlocked, tier: "multi", amountCents: 14900, reportAvailable: unlocked },
    ) as any;
  const reportText = async (r: any, isPaid: boolean) =>
    (
      await extractTextFromPdf(
        Buffer.from(
          await generateReportPdf({
            auditId: "00000000-0000-0000-0000-000000000000", createdAt: "2026-09-01T00:00:00.000Z",
            savingsEstimate: r.savings_estimate, freeFindings: r.free_findings, paidFindings: r.paid_findings, isPaid,
            confidence: r.confidence, confidenceScore: r.confidence_score, validationWarning: r.validation_warning,
            estimatedOvercharge: r.estimated_overcharge, overchargeBreakdown: r.overcharge_breakdown, leaseClausesSummary: r.lease_clauses_summary,
          }),
        ),
      )
    ).text.replace(/\s+/g, " ");

  // ── 1. preview / API / locked teaser ───────────────────────────────────────────────────────────────────────────
  await test("legacy", "API + LOCKED TEASER: the old amounts, prose and headline never reach the browser (unpaid)", () => {
    const out = publicView(TRIPLE_LEGACY(), false);
    assert.strictEqual(out.savings_estimate, 1359, "headline = the independent fee only");
    expectClean("unpaid API response", JSON.stringify(out));
    for (const f of out.paid_findings) assert.strictEqual(f.potential_savings, 0);
    assert.deepStrictEqual(out.free_findings, [FEE], "an unrelated finding is returned exactly as stored");
    assert.ok(out.lease_clauses_summary.comparisonStatus?.legacyContained === true, "the notice record is added at read time");
  });

  await test("legacy", "API after payment: the full view carries the contained findings, not the old prose; evidence is as stored", () => {
    const out = publicView(TRIPLE_LEGACY(), true);
    expectClean("paid API response", JSON.stringify(out));
    const cap = out.paid_findings.find((f: any) => /CAM Cap Review/.test(f.category));
    assert.ok(cap && cap.quantified === false && cap.potential_savings === 0);
    assert.deepStrictEqual(cap.sourceEvidence, OLD_CAP_MULTI.sourceEvidence, "no quote or page reference is invented or altered (page stays null)");
    const gross = out.paid_findings.find((f: any) => /Gross-Up Screening/.test(f.category));
    assert.deepStrictEqual(gross.sourceEvidence, OLD_GROSS.sourceEvidence);
    assert.ok(/not a conclusion about what your lease permits/.test(gross.description) && !LEGAL.test(gross.description + cap.description));
  });

  // ── 2. eligibility ─────────────────────────────────────────────────────────────────────────────────────────────
  await test("legacy", "UNPAID eligibility: legacy cap/gross-up alone do not qualify; a real fee finding still does (partial, disclosed)", () => {
    const only = decidePurchase(purchaseInputFromRow(ONLY_LEGACY()));
    assert.strictEqual(only.eligible, false);
    if (!only.eligible) assert.strictEqual(only.reason, "insufficient_analysis", "never reported as a clean result");
    const mixed = decidePurchase(purchaseInputFromRow(TRIPLE_LEGACY()));
    assert.ok(mixed.eligible && mixed.completeness === "partial");
    if (mixed.eligible) assert.ok(mixed.notes.some((n) => /without a dollar amount/.test(n)));
    const noAmountGross = decidePurchase(purchaseInputFromRow(row({ free_findings: [], paid_findings: [OLD_GROSS_NO_AMOUNT] })));
    assert.strictEqual(noAmountGross.eligible, false, "the $0 judgment-tier legacy gross-up variant cannot qualify either");
  });

  // Fake store + Stripe, as the payment tests do (no real Stripe, no database).
  const OWNER = "11111111-1111-1111-1111-111111111111";
  const AUDIT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const ENV = { STRIPE_PRICE_ID_SINGLE: "price_single_test", STRIPE_PRICE_ID_MULTI: "price_multi_test" };
  function makeStore(stored: Record<string, unknown>, years = 1) {
    const payments = new Map<string, any>();
    const events = new Map<string, boolean>();
    const store: any = {
      payments,
      async recordEvent(id: string) { if (!events.has(id)) { events.set(id, false); return "new"; } return events.get(id) ? "duplicate_done" : "retry"; },
      async markEventProcessed(id: string) { events.set(id, true); },
      async getPaymentBySession(s: string) { return payments.get(s) ?? null; },
      async createPending(r: any) { payments.set(r.sessionId, { session_id: r.sessionId, audit_id: r.auditId, owner_id: r.ownerId, tier: r.tier, status: "pending" }); },
      async markPaid(s: string) { payments.get(s).status = "paid"; return true; },
      async markStatus(s: string, status: string) { const p = payments.get(s); if (p && p.status !== "paid") p.status = status; },
      async hasPaid(a: string, o: string) { return [...payments.values()].some((p) => p.audit_id === a && p.owner_id === o && p.status === "paid"); },
      async getAuditFacts() { return { owner_id: OWNER, status: "completed", recon_year_count: years }; },
      // mirrors src/lib/payment-store.ts: ONE eligibility read, shared by checkout creation and the webhook
      async getPurchaseFacts() { return purchaseInputFromRow(stored); },
    };
    return store;
  }
  const stripeFake = () => {
    const created: unknown[] = [];
    const sess = {
      id: "cs_1", object: "checkout.session", mode: "payment", payment_status: "paid", currency: "usd", amount_total: 4900, client_reference_id: AUDIT,
      payment_intent: "pi_1", metadata: { audit_id: AUDIT, owner_id: OWNER, tier: "single" },
    };
    const stripe = {
      prices: { retrieve: async (id: string) => ({ id, active: true, type: "one_time", currency: "usd", livemode: false, unit_amount: 4900 }) },
      checkout: {
        sessions: {
          create: async (p: unknown) => { created.push(p); return { id: "cs_1", url: "https://checkout.stripe.test/1", livemode: false }; },
          retrieve: async () => ({ ...sess, livemode: false }),
          listLineItems: async () => ({ data: [{ price: { id: ENV.STRIPE_PRICE_ID_SINGLE }, quantity: 1 }] }),
        },
      },
    } as any;
    return { stripe, created, sess };
  };
  const startCheckout = (store: any, f = stripeFake()) =>
    createCheckoutForAudit({ auditId: AUDIT, userId: OWNER, userOwnsAudit: async () => true, store, stripe: f.stripe, baseUrl: "https://staging.test", expectLivemode: false, env: ENV }).then((result) => ({ result, ...f }));

  await test("legacy", "NEW CHECKOUT on an unpaid legacy audit uses the contained representation: unsupported-only is refused, no Stripe session is created", async () => {
    const refused = await startCheckout(makeStore(ONLY_LEGACY()));
    assert.deepStrictEqual(refused.result, { ok: false, reason: "insufficient_analysis" });
    assert.strictEqual(refused.created.length, 0);
    const allowed = await startCheckout(makeStore(TRIPLE_LEGACY()));
    assert.strictEqual(allowed.result.ok, true, "the real fee finding keeps the audit sellable");
  });

  await test("invariant", "PAID ENTITLEMENT is preserved: an already-paid legacy audit stays unlocked and its report access depends on the verified payment alone", async () => {
    const paidStore = makeStore(ONLY_LEGACY());
    paidStore.payments.set("cs_old", { session_id: "cs_old", audit_id: AUDIT, owner_id: OWNER, tier: "single", status: "paid" });
    const access = await authorizeReportAccess({ userId: OWNER, auditId: AUDIT, userOwnsAudit: async () => true, store: paidStore, getReportPath: async () => "generated" });
    assert.strictEqual(access.ok, true);
    assert.strictEqual(publicView(ONLY_LEGACY(), true).payment.unlocked, true);
    // a repeated or late event for a payment that is already paid never revokes anything and never re-checks eligibility
    const f = stripeFake();
    const again = await handleStripeEvent({ id: "evt_2", type: "checkout.session.completed", livemode: false, data: { object: { ...f.sess, id: "cs_old" } } } as any, { store: paidStore, stripe: f.stripe, expectLivemode: false, env: ENV });
    assert.strictEqual(again.outcome, "duplicate");
    assert.strictEqual(await paidStore.hasPaid(AUDIT, OWNER), true);
  });

  await test("legacy", "PAYMENT CODE UNCHANGED, shared read now contained (characterisation, an UNRESOLVED OWNER DECISION): a session opened before this change on an unsupported-only legacy audit is rejected and flagged for refund review, as the existing path does", async () => {
    const store = makeStore(ONLY_LEGACY());
    store.payments.set("cs_1", { session_id: "cs_1", audit_id: AUDIT, owner_id: OWNER, tier: "single", status: "pending" });
    const f = stripeFake();
    const r = await handleStripeEvent({ id: "evt_1", type: "checkout.session.completed", livemode: false, data: { object: f.sess } } as any, { store, stripe: f.stripe, expectLivemode: false, env: ENV });
    assert.deepStrictEqual([r.outcome, r.reason], ["rejected", "not_eligible_at_payment"]);
    assert.strictEqual(await store.hasPaid(AUDIT, OWNER), false);
    const src = fs.readFileSync(path.join(SRC, "lib/payments.ts"), "utf8");
    assert.ok(!/getSettlementFacts/.test(src) && (src.match(/store\.getPurchaseFacts\(/g) ?? []).length === 2, "no settlement-specific read exists");
  });

  // ── 3. report, letter, account list: one figure ────────────────────────────────────────────────────────────────
  await test("legacy", "REPORT (preview and paid): totals and prose carry none of the old amounts; the headline equals the API headline", async () => {
    const stored = TRIPLE_LEGACY();
    const headline = formatMoney(publicView(stored, false).savings_estimate);
    for (const isPaid of [false, true]) {
      const text = await reportText(stored, isPaid);
      expectClean(isPaid ? "paid PDF" : "preview PDF", text);
      assert.ok(text.includes(headline), `PDF headline ${headline} (isPaid=${isPaid})`);
    }
  });

  await test("legacy", "LETTER: total equals the headline, old prose is gone, the unsupported items are questions in the customer's own voice, no legal conclusion", () => {
    const stored = TRIPLE_LEGACY();
    const letter = buildDisputeLetter({ findings: [...stored.free_findings, ...stored.paid_findings] as any, overchargeBreakdown: [], leaseClausesSummary: stored.lease_clauses_summary as any });
    assert.strictEqual(letter.total, publicView(stored, false).savings_estimate);
    expectClean("letter", letter.text);
    const adjustments = letter.text.split("ITEMS I ASK YOU TO CLARIFY")[0];
    assert.ok(/Admin Fee Above Lease Cap/.test(adjustments) && !/CAM Cap Review|Gross-Up/.test(adjustments));
    assert.ok(/Please explain how the cap applies under the lease/.test(letter.text) && /Please explain whether expenses were adjusted for occupancy/.test(letter.text));
    assert.ok(!/this review|this audit|software|the system/i.test(letter.text.split("ITEMS I ASK YOU TO CLARIFY")[1]), "reads as the tenant writing to the landlord");
    assert.ok(!LEGAL.test(letter.text));
  });

  await test("legacy", "ACCOUNT LIST, API, report and letter agree on one figure; the list and the audit page cannot disagree", async () => {
    const { containLegacyAudit } = await adapter();
    const stored = TRIPLE_LEGACY();
    const figure = containLegacyAudit(stored as any).savings_estimate;
    assert.strictEqual(figure, 1359);
    assert.strictEqual(publicView(stored, false).savings_estimate, figure);
    const listSrc = fs.readFileSync(path.join(SRC, "app/api/audits/route.ts"), "utf8");
    const letterSrc = fs.readFileSync(path.join(SRC, "app/api/audit/[id]/letter/route.ts"), "utf8");
    const reportSrc = fs.readFileSync(path.join(SRC, "app/api/audit/[id]/report/route.ts"), "utf8");
    for (const [n, s] of [["account list", listSrc], ["letter route", letterSrc], ["report route", reportSrc]] as const) assert.ok(/containLegacyAudit\(/.test(s), `${n} must read through the adapter`);
    // and the purchasable flag in the list is computed from the contained representation
    assert.strictEqual(decidePurchase(purchaseInputFromRow(containLegacyAudit(ONLY_LEGACY() as any) as any)).eligible, false);
  });

  // ── 4. the adapter itself ──────────────────────────────────────────────────────────────────────────────────────
  await test("legacy", "ADAPTER: idempotent, and an untouched record is returned as the same object", async () => {
    const { containLegacyAudit } = await adapter();
    const once = containLegacyAudit(TRIPLE_LEGACY() as any);
    const twice = containLegacyAudit(once);
    assert.strictEqual(twice, once, "reapplying returns the same object");
    assert.deepStrictEqual(twice, once);
    const clean = row({ free_findings: [FEE, PRO_RATA], paid_findings: [], savings_estimate: 1971 });
    assert.strictEqual(containLegacyAudit(clean as any), clean, "no legacy category: nothing is copied or changed");
  });

  await test("legacy", "ADAPTER: never mutates the source object or the stored data (deep-frozen input, byte-for-byte snapshot)", async () => {
    const { containLegacyAudit, containLegacyFindings } = await adapter();
    const frozen = deepFreeze(TRIPLE_LEGACY());
    const snapshot = JSON.stringify(frozen);
    containLegacyAudit(frozen as any);
    containLegacyFindings(frozen.paid_findings as any);
    publicView(frozen as any, true);
    purchaseInputFromRow(frozen as any);
    assert.strictEqual(JSON.stringify(frozen), snapshot);
  });

  await test("legacy", "ADAPTER: explicit category matching only - near-misses, other cap/gross-up wording and new-format items are untouched", async () => {
    const { containLegacyAudit, LEGACY_CAP_CATEGORIES, LEGACY_GROSS_UP_CATEGORY } = await adapter();
    assert.deepStrictEqual([...LEGACY_CAP_CATEGORIES], ["Potential CAM Cap Exceedance", "Year-over-Year CAM Escalation Exceeds Lease Cap"]);
    assert.strictEqual(LEGACY_GROSS_UP_CATEGORY, "Possible Gross-Up / Occupancy Adjustment");
    const lookalikes = [
      { ...OLD_CAP_SINGLE, category: "Potential CAM Cap Exceedance (custom)" },
      { ...OLD_CAP_SINGLE, category: "potential cam cap exceedance" },
      { ...OLD_CAP_SINGLE, category: "CAM Cap Within Limit", potential_savings: 0, description: "Within the 5% cap." },
      { ...OLD_CAP_SINGLE, category: "Year-over-Year CAM Change (Multi-Year)", potential_savings: 0 },
      { ...OLD_GROSS, category: "Gross-up note" },
      GROSS_LANGUAGE_ONLY,
      { ...OLD_CAP_MULTI, quantified: true }, // a new-format record says what it is
    ];
    const r = row({ free_findings: lookalikes, paid_findings: [], savings_estimate: 1000 });
    assert.strictEqual(containLegacyAudit(r as any), r);
  });

  await test("legacy", "ADAPTER: created_at is not a cutoff - the same record is contained whatever its date", async () => {
    const { containLegacyAudit } = await adapter();
    for (const created_at of ["2019-01-01T00:00:00Z", "2026-09-01T00:00:00Z", "2031-01-01T00:00:00Z"]) {
      const out = containLegacyAudit(TRIPLE_LEGACY() as any) as any;
      const dated = containLegacyAudit({ ...TRIPLE_LEGACY(), created_at } as any) as any;
      assert.strictEqual(dated.savings_estimate, out.savings_estimate);
      assert.deepStrictEqual(dated.paid_findings, out.paid_findings);
    }
    assert.ok(!/created_at/.test(fs.readFileSync(path.join(SRC, "lib/legacy-containment.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//, "")), "no code in the adapter reads created_at");
  });

  // ── UNRECONCILED LEGACY TOTALS: nine fictional records through every output path ───────────────────────────────
  const ROOF_ROW = { category: "roof repair", total_expense: 24500, tenant_share_percent: 8.08, tenant_charge: 1979.6, reason: "Excluded Expense" };
  const withOvercharge = { estimated_overcharge: 1979.6, overcharge_breakdown: [ROOF_ROW] };
  const CAP1 = (a: number) => ({ ...OLD_CAP_SINGLE, potential_savings: a, sourceEvidence: [{ document: "lease.pdf", page: 2, extractedText: "limited to 5%" }] });
  type Recon = { name: string; stored: ReturnType<typeof row>; value: number | null; retained: number; over: number };
  const RECON: Recon[] = [
    { name: "0 consistent: fee 1,359 + cap 40,000 + gross-up 25,897 = 67,256", stored: row({ free_findings: [FEE], paid_findings: [OLD_CAP_MULTI, OLD_GROSS], savings_estimate: 67256 }), value: 1359, retained: 1359, over: 0 },
    { name: "1 stored headline HIGHER than the components (70,000)", stored: row({ free_findings: [FEE], paid_findings: [OLD_CAP_MULTI, OLD_GROSS], savings_estimate: 70000 }), value: null, retained: 1359, over: 0 },
    { name: "2 stored headline LOWER than the components (40,000)", stored: row({ free_findings: [FEE], paid_findings: [OLD_CAP_MULTI], savings_estimate: 40000 }), value: null, retained: 1359, over: 0 },
    { name: "3 missing headline (null)", stored: row({ free_findings: [FEE], paid_findings: [OLD_CAP_MULTI, OLD_GROSS], savings_estimate: null }), value: null, retained: 1359, over: 0 },
    { name: "4 rounded amounts: whole-dollar legacy, cents in the headline, excluded 1,979.60", stored: row({ free_findings: [FEE], paid_findings: [OLD_CAP_MULTI], savings_estimate: 43338.6, ...withOvercharge }), value: 3338.6, retained: 1359, over: 1979.6 },
    { name: "5 repeated legacy findings (same cap stored twice, both counted)", stored: row({ free_findings: [CAP1(11444), CAP1(11444)], paid_findings: [], savings_estimate: 22888 }), value: 0, retained: 0, over: 0 },
    { name: "6 legacy mixed with excluded-category and judgment amounts", stored: row({ free_findings: [FEE], paid_findings: [OLD_CAP_MULTI, OLD_GROSS], savings_estimate: 69235.6, ...withOvercharge }), value: 3338.6, retained: 1359, over: 1979.6 },
    { name: "7 headline stored as a numeric string", stored: row({ free_findings: [FEE], paid_findings: [OLD_CAP_MULTI], savings_estimate: "41359.00" }), value: 1359, retained: 1359, over: 0 },
    { name: "8 headline smaller than what was removed (100): never clamped to a total", stored: row({ free_findings: [CAP1(11444)], paid_findings: [], savings_estimate: 100 }), value: null, retained: 0, over: 0 },
  ];
  for (const c of RECON) {
    await test("legacy", `RECONCILIATION ${c.name}: ${c.value == null ? "UNAVAILABLE on every path" : `reconciled ${c.value} on every path`}`, async () => {
      const { containLegacyAudit } = await adapter();
      const unavailable = c.value == null;
      const frozen = deepFreeze(clone(c.stored));
      const snapshot = JSON.stringify(frozen);
      const out = containLegacyAudit(frozen as any) as any;
      assert.strictEqual(JSON.stringify(frozen), snapshot, "source not mutated");
      assert.strictEqual(containLegacyAudit(out), out, "reapplying changes nothing further");
      // retained components are exactly what the documented rule says
      const kept = [...out.free_findings, ...out.paid_findings].reduce((s: number, f: any) => s + (f.insufficientData || f.quantified === false ? 0 : f.potential_savings), 0);
      assert.strictEqual(Math.round(kept * 100) / 100, c.retained);
      // 1. audit API (and the contained row the account list reads)
      const api = publicView(c.stored as any, false);
      assert.strictEqual(api.savings_estimate, unavailable ? null : c.value);
      assert.strictEqual(api.lease_clauses_summary.comparisonStatus?.headlineUnavailable === true, unavailable);
      assert.strictEqual(out.savings_estimate, unavailable ? null : c.value, "account-list row");
      expectClean("API", JSON.stringify(api));
      // 2. PDF, preview and paid
      for (const isPaid of [false, true]) {
        const text = await reportText(c.stored, isPaid); // the generator receives the STORED row and contains it itself
        expectClean("PDF", text);
        if (unavailable) {
          assert.ok(/OVERALL TOTAL NOT AVAILABLE/.test(text) && /could not be reconciled/.test(text), "PDF says the total is unavailable");
          assert.ok(!/POTENTIAL BILLING DISCREPANCIES/.test(text), "no headline box is rebuilt by the max() fallback");
        } else if (c.value! > 0) {
          assert.ok(text.includes(formatMoney(c.value!)), `PDF headline ${formatMoney(c.value!)}`);
        }
      }
      // 3. letter (built the way the route builds it: from the contained row)
      const letter = buildDisputeLetter({ findings: [...out.free_findings, ...out.paid_findings], overchargeBreakdown: out.overcharge_breakdown, leaseClausesSummary: out.lease_clauses_summary });
      expectClean("letter", letter.text);
      if (unavailable) {
        assert.strictEqual(letter.total, null, "no overall total, and no competing recomputed one");
        assert.ok(letter.totalNote && /could not be reconciled/.test(letter.totalNote));
        assert.ok(!/Total of the items above/.test(letter.text));
        if (c.retained > 0) assert.ok(/Admin Fee Above Lease Cap - \$1,359/.test(letter.text), "retained individual items and their amounts remain");
      } else {
        assert.strictEqual(letter.total, c.value);
        assert.strictEqual(letter.totalNote, null);
      }
      // 4. audit page and routes: the fallback cannot resurrect an aggregate (static, as the page is a component)
      const pageSrc = fs.readFileSync(path.join(SRC, "app/audit/[id]/page.tsx"), "utf8");
      // (the page's decision and the unavailable/breakdown rendering are exercised for real in unavailable-display.test.ts;
      // this is only the source-scan wiring check)
      assert.ok(/headlineFigures\(\{/.test(pageSrc) && /<AuditHeadline unavailable=\{headlineUnavailable\(comparisonStatusOf\(audit\.lease_clauses_summary\)\)\}/.test(pageSrc));
      assert.ok(/savingsEstimate: unavailable \? 0 : Math\.max/.test(fs.readFileSync(path.join(SRC, "lib/quantification.ts"), "utf8")));
      assert.ok(/totalUnavailable \? 0 : Math\.max\(input\.savingsEstimate \?\? 0, totalSavingsFromFindings\)/.test(fs.readFileSync(path.join(SRC, "services/report-pdf.ts"), "utf8")));
      assert.ok(/headline_unavailable/.test(fs.readFileSync(path.join(SRC, "app/api/audits/route.ts"), "utf8")));
      assert.ok(/draft\.total == null/.test(fs.readFileSync(path.join(SRC, "app/audit/[id]/letter/page.tsx"), "utf8")));
    });
  }

  await test("legacy", "RECONCILIATION: a record with no headline key at all is unavailable, and a record with nothing legacy keeps its stored headline exactly", async () => {
    const { containLegacyAudit } = await adapter();
    const noKey = row({ free_findings: [FEE], paid_findings: [OLD_CAP_MULTI] });
    delete (noKey as any).savings_estimate;
    assert.strictEqual((containLegacyAudit(noKey as any) as any).savings_estimate, null);
    const plain = row({ free_findings: [FEE], paid_findings: [], savings_estimate: 999 }); // inconsistent, but nothing was contained
    assert.strictEqual(containLegacyAudit(plain as any), plain);
    // no breakdown and no overcharge column: the overcharge cannot be established, so it cannot reconcile
    const noOver = row({ free_findings: [CAP1(100)], paid_findings: [], savings_estimate: 100 });
    delete (noOver as any).estimated_overcharge;
    delete (noOver as any).overcharge_breakdown;
    assert.strictEqual((containLegacyAudit(noOver as any) as any).savings_estimate, null);
  });

  // ── 5. unrelated categories, missing metadata, new-format records ─────────────────────────────────────────────
  await test("invariant", "MISSING quantification metadata on unrelated categories: findings, totals, plan and letter are unchanged", async () => {
    const stored = row({ free_findings: [FEE, PRO_RATA, GROSS_LANGUAGE_ONLY], paid_findings: [], savings_estimate: 1971 });
    const out = publicView(stored, false);
    assert.strictEqual(out.savings_estimate, 1971);
    assert.deepStrictEqual(out.free_findings, [FEE, PRO_RATA, GROSS_LANGUAGE_ONLY]);
    assert.strictEqual(out.lease_clauses_summary.comparisonStatus, undefined, "no record is invented for an audit with nothing to contain");
    const plan = buildReviewPlan({ findings: stored.free_findings as any, overchargeBreakdown: [], leaseClausesSummary: stored.lease_clauses_summary as any });
    assert.strictEqual(plan.calculatedTotal + plan.judgmentTotal, 1971);
    assert.strictEqual(buildDisputeLetter({ findings: stored.free_findings as any, overchargeBreakdown: [], leaseClausesSummary: null }).total, 1971);
    assert.ok(decidePurchase(purchaseInputFromRow(stored)).eligible);
  });

  await test("legacy", "LANGUAGE-ONLY legacy gross-up (needs data, no amount) keeps its name and wording; the contained twin gets the new name", async () => {
    const { containLegacyAudit } = await adapter();
    const out = containLegacyAudit(row({ free_findings: [GROSS_LANGUAGE_ONLY], paid_findings: [OLD_GROSS], savings_estimate: 25897 }) as any) as any;
    assert.deepStrictEqual(out.free_findings[0], GROSS_LANGUAGE_ONLY);
    assert.strictEqual(out.paid_findings[0].category, "Gross-Up Screening Signal (Heuristic)");
  });

  // The $67,256 fixture through the CURRENT engine (new format), then both formats side by side.
  const lease = await textToPdf(fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf-8"));
  const recon = await textToPdf(fs.readFileSync(path.join(FIX, "recon-high-confidence.txt"), "utf-8"));
  const li = (category: string, amount: string) => ({ category, amount, rawLine: `${category} ${amount}` });
  const v = await validateDocuments(lease, recon);
  v.leaseFields.camCapPercentage = "5";
  v.reconFields.priorYearTotal = null;
  v.leaseText = v.leaseText.replace(/controllable/gi, "variable") + "\nOperating expenses shall be grossed up to 95% occupancy.";
  v.leaseFields.adminFeePercentage = "15";
  v.reconFields.adminFeePercentage = "18";
  v.reconFields.lineItems.push(li("Management Fee", "100,897.20"));
  const fresh = await runAudit(v, {
    multiYearReconciliations: [
      { year: 2023, total: 400000, lineItems: [li("Management Fee", "80,000.00"), li("Landscaping", "20,000.00")], docName: "statement-2023.pdf" },
      { year: 2024, total: 460000, lineItems: [li("Management Fee", "100,897.20"), li("Landscaping", "30,000.00")], docName: "statement-2024.pdf" },
    ],
  });
  const NEW_ROW = row({
    free_findings: fresh.free_findings, paid_findings: fresh.paid_findings, overcharge_breakdown: fresh.overcharge_breakdown,
    lease_clauses_summary: fresh.leaseClausesSummary, savings_estimate: fresh.savings_estimate, confidence: fresh.confidence,
  });

  await test("invariant", "NEW-FORMAT $67,256 fixture stays contained: headline, API, eligibility, plan, letter and PDF all show only the $1,359 fee", async () => {
    assert.strictEqual(fresh.savings_estimate, 1359);
    const out = publicView(NEW_ROW, false);
    assert.strictEqual(out.savings_estimate, 1359);
    expectClean("new-format API", JSON.stringify(out));
    assert.ok(decidePurchase(purchaseInputFromRow(NEW_ROW)).eligible);
    const letter = buildDisputeLetter({ findings: [...fresh.free_findings, ...fresh.paid_findings], overchargeBreakdown: [], leaseClausesSummary: fresh.leaseClausesSummary });
    assert.strictEqual(letter.total, 1359);
    expectClean("new-format letter", letter.text);
    const text = await reportText(NEW_ROW, true);
    expectClean("new-format PDF", text);
    assert.ok(text.includes("$1,359"));
  });

  await test("legacy", "NEW-FORMAT records pass through the adapter untouched (same object), and the stored-legacy and new-format forms of the fixture agree on every figure", async () => {
    const { containLegacyAudit } = await adapter();
    assert.strictEqual(containLegacyAudit(NEW_ROW as any), NEW_ROW);
    const legacy = publicView(TRIPLE_LEGACY(), false);
    const modern = publicView(NEW_ROW, false);
    assert.strictEqual(legacy.savings_estimate, modern.savings_estimate);
    const sumCounted = (a: any) => [...a.free_findings, ...a.paid_findings].reduce((s: number, f: any) => s + f.potential_savings, 0);
    assert.strictEqual(sumCounted(legacy), sumCounted(modern));
    const lp = decidePurchase(purchaseInputFromRow(TRIPLE_LEGACY()));
    const mp = decidePurchase(purchaseInputFromRow(NEW_ROW));
    assert.strictEqual(lp.eligible, mp.eligible);
  });

  // ── 6. wording ─────────────────────────────────────────────────────────────────────────────────────────────────
  await test("legacy", "WORDING: the lease summary does not call the cap an annual-increase rule; it says what extraction established", () => {
    const cap = { category: "CAM Cap Review: Increase Above Stated Percentage", description: "d", potential_savings: 0, severity: "medium" as const };
    const gross = { category: "Gross-Up Screening Signal (Heuristic)", description: "d", potential_savings: 0, severity: "medium" as const };
    const recon = { category: "Reconciliation Totals", description: "d", potential_savings: 0, severity: "low" as const };
    for (const f of [cap, gross, recon]) {
      const ref = getLeaseClauseEvidence(f as any, LCS as any);
      assert.ok(ref, f.category);
      assert.ok(!/annual/i.test(ref!.text), `still says "annual": ${ref!.text}`);
      assert.ok(/lease text mentions a cap of 5%/.test(ref!.text));
    }
    assert.ok(/were not established/.test(getLeaseClauseEvidence(cap as any, LCS as any)!.text));
  });

  await test("legacy", "NEW-FORMAT letter: unsupported items read as the tenant's own questions, keep the statement amounts, state no adjustment amount", () => {
    // only the cap/gross-up observations: other needs-data items keep their existing wording and are not part of this change
    const unsupported = [...fresh.free_findings, ...fresh.paid_findings].filter((f) => f.quantified === false);
    assert.ok(unsupported.length >= 2);
    const letter = buildDisputeLetter({ findings: unsupported, overchargeBreakdown: [], leaseClausesSummary: fresh.leaseClausesSummary });
    const questions = letter.text.split("ITEMS I ASK YOU TO CLARIFY")[1] ?? "";
    assert.ok(/The statements show total CAM charges of \$400,000 for 2023 and \$460,000 for 2024, a change of 15\.0%/.test(questions), "observed statement totals are kept");
    assert.ok(/Please explain how the cap applies under the lease/.test(questions));
    { const m = questions.match(/(this review|this audit|software|the system|nothing is counted)/i); assert.ok(!m, "tool voice: " + m?.[0]); }
    assert.ok(!LEGAL.test(questions));
    assert.ok(/The statements show these changes: Management Fee \$80,000 \(2023\) to \$100,897\.20 \(2024\)/.test(questions));
  });

  // ── 7. stored preview files ────────────────────────────────────────────────────────────────────────────────────
  await test("invariant", "STORED PREVIEW PDF cannot be retrieved through the application (trace, as a standing check)", () => {
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "__tests__" ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));
    const offenders: string[] = [];
    for (const f of walk(SRC).filter((p) => /\.(ts|tsx)$/.test(p))) {
      const s = fs.readFileSync(f, "utf8");
      if (/createSignedUrl|createSignedUrls|getPublicUrl|\.download\(/.test(s)) offenders.push(path.relative(SRC, f));
    }
    assert.deepStrictEqual(offenders, [], "no code path serves a stored object");
    assert.ok(/report_pdf_url: null/.test(fs.readFileSync(path.join(SRC, "lib/audit-access.ts"), "utf8")), "the stored path is never returned to the browser");
    const cols = fs.readFileSync(path.join(SRC, "lib/audit-access.ts"), "utf8").match(/OWNER_READABLE_COLUMNS = \[([\s\S]*?)\]/)![1];
    assert.ok(!/report_pdf_url/.test(cols), "the owner cannot read the stored path either");
    const route = fs.readFileSync(path.join(SRC, "app/api/audit/[id]/report/route.ts"), "utf8");
    assert.ok(/generateReportPdf\(/.test(route) && !/storage\s*\.\s*from\(|\.storage\./.test(route), "the report is generated on demand from stored findings, never read back from storage");
  });

  // ── BELOW-PERCENTAGE AND COMPLIANCE WORDING ─────────────────────────────────────────────────────────────────────
  const WITHIN_LIMIT = {
    category: "CAM Cap Within Limit",
    description:
      "The lease limits annual CAM or controllable expense increases to 5%. Total CAM charges of $53,444.13 were detected in the reconciliation statement. " +
      "Year-over-year charges increased 3.0% (from $51,886.54), which is within the 5% cap. Verify prior-year baseline accuracy to confirm. " +
      "Note: your lease refers to controllable expenses, and this comparison uses the statement's total charges, so it may overstate any excess. Compare only the categories the cap covers to confirm.",
    potential_savings: 0,
    severity: SEV.low,
    sourceEvidence: [{ document: "lease.pdf", page: 2, extractedText: "limited to 5%" }, { document: "recon.pdf", page: null, extractedText: "Prior Year Total $51,886.54" }],
  };
  const MULTI_WITHIN = {
    category: "Year-over-Year CAM Change (Multi-Year)",
    description: "CAM charges changed 3.0% from 2023 ($100,000) to 2024 ($103,000). This is within the lease CAM cap of 5%.",
    potential_savings: 0,
    severity: SEV.medium,
    sourceEvidence: [{ document: "statement-2023.pdf", page: null, extractedText: "2023 Total: $100,000" }, { document: "statement-2024.pdf", page: null, extractedText: "2024 Total: $103,000" }],
  };
  const MULTI_NO_CAP = { ...MULTI_WITHIN, description: "CAM charges changed 3.0% from 2023 ($100,000) to 2024 ($103,000). No CAM cap was detected in the lease to compare against." };
  const INCREASE_DETECTED = {
    category: "Year-over-Year CAM Increase Detected",
    description:
      "Year-over-year CAM expenses increased by 10.0%, from $40,000 to $44,000. No CAM cap was detected in the lease to compare against. Review your lease to determine if this increase is within contractual limits.",
    potential_savings: 0,
    severity: SEV.medium,
  };
  // pre-launch versions stored the same sentence under this name WITH an assumed dollar overage: not distinguishable, so not touched
  const CAP_EXCEEDED_AMBIGUOUS = { category: "CAM Cap Exceeded", description: WITHIN_LIMIT.description, potential_savings: 2672, severity: SEV.high };
  const BANNED_COMPLIANCE = /within the 5% cap|within the lease CAM cap|Verify prior-year baseline accuracy|overstate any excess|annual CAM or controllable/i;

  await test("legacy", "WORDING 'CAM Cap Within Limit': the compliance sentences are replaced by observations; totals and evidence are kept; no amount, headline or notice is touched", async () => {
    const { containLegacyAudit } = await adapter();
    const stored = deepFreeze(row({ free_findings: [WITHIN_LIMIT, FEE], paid_findings: [], savings_estimate: 1359 }));
    const snapshot = JSON.stringify(stored);
    const out = containLegacyAudit(stored as any) as any;
    assert.strictEqual(JSON.stringify(stored), snapshot);
    const f = out.free_findings[0];
    assert.strictEqual(f.category, "CAM Cap Review: Increase Below Stated Percentage");
    assert.ok(!BANNED_COMPLIANCE.test(f.description), f.description);
    assert.ok(/mentions a 5% limit on increases/.test(f.description) && /which is below 5%\. It does not confirm compliance/.test(f.description) && /may include expenses the cap does not cover/.test(f.description));
    assert.ok(f.description.includes("$53,444.13") && f.description.includes("$51,886.54"), "factual statement totals are preserved");
    assert.deepStrictEqual(f.sourceEvidence, WITHIN_LIMIT.sourceEvidence, "evidence untouched (page stays null)");
    assert.ok(f.quantified === false && f.letterText === "" && f.potential_savings === 0);
    assert.strictEqual(out.free_findings[1], FEE);
    assert.strictEqual(out.savings_estimate, 1359, "no amount was withheld, so the headline is as stored");
    assert.strictEqual(out.lease_clauses_summary.comparisonStatus, undefined, "no notice is invented for a wording-only change");
    assert.strictEqual(containLegacyAudit(out), out, "idempotent");
  });

  await test("legacy", "WORDING 'Year-over-Year CAM Change (Multi-Year)': only the exact cap-present sentence is replaced; the no-cap variant and anything not matching exactly are left as stored", async () => {
    const { containLegacyAudit } = await adapter();
    const out = containLegacyAudit(row({ free_findings: [MULTI_WITHIN], paid_findings: [], savings_estimate: 0 }) as any) as any;
    const f = out.free_findings[0];
    assert.strictEqual(f.category, "CAM Cap Review: Increase Below Stated Percentage");
    assert.ok(/CAM charges changed 3\.0% from 2023 \(\$100,000\) to 2024 \(\$103,000\)\. This is below the 5% figure found in the lease text\. It does not confirm compliance/.test(f.description));
    assert.ok(!BANNED_COMPLIANCE.test(f.description));
    assert.deepStrictEqual(f.sourceEvidence, MULTI_WITHIN.sourceEvidence);
    assert.ok(f.quantified === false && f.severity === "low");
    const noCap = row({ free_findings: [MULTI_NO_CAP], paid_findings: [], savings_estimate: 0 });
    // the no-cap variant is NOT inferred to have a cap: only its severity (note) changes; category, text, figures and evidence stay
    const noCapOut = containLegacyAudit(noCap as any) as any;
    assert.deepStrictEqual({ ...noCapOut.free_findings[0], severity: "medium" }, MULTI_NO_CAP);
    assert.strictEqual(noCapOut.free_findings[0].severity, "low");
    assert.strictEqual(noCapOut.free_findings[0].quantified, undefined);
    const edited = row({ free_findings: [{ ...MULTI_WITHIN, description: "CAM charges changed 3.0%. This is within the lease CAM cap of 5%. (edited)" }], paid_findings: [], savings_estimate: 0 });
    assert.strictEqual(containLegacyAudit(edited as any), edited, "a record that does not end with the exact generated sentence is untouched");
    const ambiguous = row({ free_findings: [CAP_EXCEEDED_AMBIGUOUS], paid_findings: [], savings_estimate: 2672 });
    assert.strictEqual(containLegacyAudit(ambiguous as any), ambiguous, "'CAM Cap Exceeded' cannot be told from the pre-launch assumed-overage rows: disclosed, not changed");
  });

  await test("legacy", "WORDING 'within contractual limits': the exact generated sentence is replaced (legacy and new audits); the observation, its figures and its no-cap fact stay", async () => {
    const { containLegacyAudit } = await adapter();
    const out = containLegacyAudit(row({ free_findings: [INCREASE_DETECTED], paid_findings: [] }) as any) as any;
    const f = out.free_findings[0];
    assert.ok(!/contractual limits/.test(f.description) && /Check your lease for any limit on increases\./.test(f.description));
    assert.ok(f.description.includes("$40,000") && f.description.includes("$44,000") && /No CAM cap was detected/.test(f.description), "observed amounts and the no-cap fact stay");
    assert.strictEqual(f.category, INCREASE_DETECTED.category);
    assert.strictEqual(f.quantified, undefined, "no unquantified flag: a no-cap observation is a note, not an unsupported cap result");
    assert.strictEqual(f.severity, "low", "the no-cap observation is a note (see the NO-CAP tests)");
    const engineSrc = fs.readFileSync(path.join(SRC, "services/audit-logic.ts"), "utf8");
    assert.ok(!/within contractual limits|within the lease CAM cap|which is within the ${leaseFields.camCapPercentage}/.test(engineSrc.replace(/\/\/.*$/gm, "")), "the engine no longer generates a compliance conclusion about the cap");
  });

  async function engine(o: { cap: string | null; prior?: string; years?: [number, number][]; adminFee?: boolean }) {
    const v = await validateDocuments(lease, recon);
    (v.leaseFields as any).camCapPercentage = o.cap;
    if (o.adminFee) {
      // an independently qualifying finding: the management fee billed above its lease limit ($1,359)
      v.leaseFields.adminFeePercentage = "15";
      v.reconFields.adminFeePercentage = "18";
      v.reconFields.lineItems.push(li("Management Fee", "100,897.20"));
    }
    v.reconFields.priorYearTotal = o.prior ?? null;
    if (o.prior) v.reconText += `\nPrior Year Total: $${o.prior}`;
    v.leaseText = v.leaseText.replace(/controllable/gi, "variable");
    const r = await runAudit(v, o.years ? { multiYearReconciliations: o.years.map(([year, total]) => ({ year, total, lineItems: [], docName: `statement-${year}.pdf` })) } : undefined);
    return [...r.free_findings, ...r.paid_findings];
  }
  const aloneDecision = (f: unknown) => decidePurchase(purchaseInputFromRow({ free_findings: [f], paid_findings: [] }));

  await test("legacy", "UNSUPPORTED-ONLY RULE applies above AND below the stated percentage: no cap observation alone can make an audit purchasable (new engine and legacy records)", async () => {
    const above = (await engine({ cap: "5", prior: "40,000.00" })).find((f) => f.category === "CAM Cap Review: Increase Above Stated Percentage");
    const belowSingle = (await engine({ cap: "5", prior: "52,000.00" })).find((f) => f.category === "CAM Cap Review: Increase Below Stated Percentage");
    const belowMulti = (await engine({ cap: "5", years: [[2023, 100000], [2024, 103000]] })).find((f) => f.category === "CAM Cap Review: Increase Below Stated Percentage" && /2023/.test(f.description));
    for (const [name, f] of [["above", above], ["below (single statement)", belowSingle], ["below (multi-year)", belowMulti]] as const) {
      assert.ok(f, `engine produced the ${name} observation`);
      assert.strictEqual(f!.quantified, false, name);
      const d = aloneDecision(f);
      assert.ok(!d.eligible && d.reason === "insufficient_analysis", `${name}: ${JSON.stringify(d)}`);
      assert.ok(!/within the .{0,12}cap|compliance with the cap|complies/i.test(f!.description.replace(/does not confirm compliance/i, "")), `${name}: ${f!.description}`);
    }
    // a below-percentage observation raises nothing with the landlord
    const letter = buildDisputeLetter({ findings: [belowSingle!, belowMulti!], overchargeBreakdown: [], leaseClausesSummary: null });
    assert.ok(!/CAM Cap Review/.test(letter.text));
    // legacy records, through the adapter
    const { containLegacyAudit } = await adapter();
    for (const [name, legacy] of [["Within Limit", WITHIN_LIMIT], ["Multi-Year within cap", MULTI_WITHIN]] as const) {
      const contained = containLegacyAudit(row({ free_findings: [legacy], paid_findings: [] }) as any);
      const d = decidePurchase(purchaseInputFromRow(contained as any));
      assert.ok(!d.eligible && d.reason === "insufficient_analysis", `legacy ${name}: ${JSON.stringify(d)}`);
    }
  });

  const NO_CAP_NAMES = ["Year-over-Year CAM Change (Multi-Year)", "Year-over-Year CAM Increase Detected"];

  await test("legacy", "NO-CAP year-over-year observations ALONE no longer qualify an audit for purchase: note classification, 'nothing to unlock', kept out of the letter, still shown with figures and evidence", async () => {
    const multiNoCap = (await engine({ cap: null, years: [[2023, 100000], [2024, 103000]] })).find((f) => f.category === NO_CAP_NAMES[0]);
    const detected = (await engine({ cap: null, prior: "40,000.00" })).find((f) => f.category === NO_CAP_NAMES[1]);
    for (const [name, f] of [["multi-year no-cap", multiNoCap], ["single-statement no-cap", detected]] as const) {
      assert.ok(f, name);
      assert.strictEqual(f!.potential_savings, 0);
      assert.strictEqual(f!.severity, "low", name);
      assert.ok(f!.insufficientData !== true && f!.quantified === undefined, "not flagged: a no-cap change is a note, not an unsupported cap result");
      assert.ok(/No CAM cap was detected/.test(f!.description) && /\$/.test(f!.description), "the observation, its no-cap fact and the statement figures stay");
      assert.ok(!/contractual limits/.test(f!.description));
      // $0 + low severity  =>  "note"  =>  review-plan tier "match"  =>  not actionable
      assert.strictEqual(findingKind(f!), "note", name);
      assert.strictEqual(buildReviewPlan({ findings: [f!], overchargeBreakdown: [], leaseClausesSummary: null }).items[0].tier, "match", name);
      assert.deepStrictEqual(aloneDecision(f), { eligible: false, reason: "nothing_to_unlock" }, `${name} alone`);
      assert.ok(f!.sourceEvidence && f!.sourceEvidence.length > 0, "evidence is kept");
      assert.ok(!/Year-over-Year/.test(buildDisputeLetter({ findings: [f!], overchargeBreakdown: [], leaseClausesSummary: null }).text), "a note raises nothing with the landlord");
    }
    // what the customer sees: the observation is still listed, and the no-purchase panel is the 'nothing to unlock' one
    const free = renderToStaticMarkup(React.createElement(AuditResultsFree, { findings: [multiNoCap!, detected!] })) as string;
    assert.ok(/No CAM cap was detected/.test(free));
    const panel = renderToStaticMarkup(React.createElement(NoPurchasePanel, { reason: "nothing_to_unlock" })) as string;
    assert.ok(/No additional findings were detected/.test(panel) && !/Unlock Full Report|$49|$149|checkout/i.test(panel));
  });

  await test("legacy", "MIXED audits keep their independently qualifying finding, its amount and their eligibility (compared with the same audit without the no-cap observation)", async () => {
    const withObs = await engine({ cap: null, years: [[2023, 100000], [2024, 103000]], adminFee: true });
    const without = await engine({ cap: null, adminFee: true });
    assert.ok(withObs.some((f) => f.category === NO_CAP_NAMES[0]), "the observation is present in the first audit");
    assert.ok(!without.some((f) => NO_CAP_NAMES.includes(f.category)));
    const qualifying = (fs: typeof withObs) => fs.filter((f) => f.potential_savings > 0).map((f) => [f.category, f.potential_savings]);
    assert.deepStrictEqual(qualifying(withObs), qualifying(without));
    assert.deepStrictEqual(qualifying(withObs), [["Admin Fee Above Lease Cap", 1359]]);
    for (const fs2 of [withObs, without]) {
      const d = decidePurchase(purchaseInputFromRow({ free_findings: fs2, paid_findings: [] }));
      assert.ok(d.eligible, "eligible because of the fee finding");
      const plan = buildReviewPlan({ findings: fs2, overchargeBreakdown: [], leaseClausesSummary: null });
      assert.strictEqual(plan.tierCounts.calculated, 1);
      assert.strictEqual(plan.calculatedTotal, 1359);
    }
    // stored records: the same, through the adapter
    const { containLegacyAudit } = await adapter();
    const stored = row({ free_findings: [INCREASE_DETECTED, FEE], paid_findings: [], savings_estimate: 1359 });
    const out = containLegacyAudit(stored as any) as any;
    assert.strictEqual(out.free_findings[1], FEE, "the qualifying finding is returned exactly as stored");
    assert.strictEqual(out.savings_estimate, 1359, "headline untouched (no amount was withheld)");
    assert.ok(decidePurchase(purchaseInputFromRow(stored as any)).eligible);
    assert.strictEqual(out.lease_clauses_summary.comparisonStatus, undefined, "no notice is invented");
  });

  await test("legacy", "STORED NO-CAP records: category + the exact generated sentence only; severity is the only change; idempotent; source not mutated; unmatched records untouched", async () => {
    const { containLegacyAudit } = await adapter();
    // multi-year, exactly as the old engine stored it
    const frozen = deepFreeze(row({ free_findings: [MULTI_NO_CAP, INCREASE_DETECTED], paid_findings: [], savings_estimate: 0 }));
    const snapshot = JSON.stringify(frozen);
    const out = containLegacyAudit(frozen as any) as any;
    assert.strictEqual(JSON.stringify(frozen), snapshot, "source not mutated");
    assert.strictEqual(containLegacyAudit(out), out, "reapplying changes nothing further");
    const [m, d] = out.free_findings;
    assert.deepStrictEqual({ ...m, severity: "medium" }, MULTI_NO_CAP, "multi-year: only severity changed");
    assert.strictEqual(m.severity, "low");
    assert.strictEqual(d.severity, "low");
    assert.ok(d.description.includes("$40,000") && d.description.includes("$44,000") && d.description.includes("No CAM cap was detected in the lease to compare against."));
    assert.ok(!/contractual limits/.test(d.description));
    assert.deepStrictEqual(m.sourceEvidence, MULTI_NO_CAP.sourceEvidence);
    // alone, each is no longer purchasable
    for (const f of out.free_findings) assert.deepStrictEqual(aloneDecision(f), { eligible: false, reason: "nothing_to_unlock" });
    // NOT matched: a category with different text, text edited after the sentence, a different severity, a non-zero amount, a cap-present record
    const unmatched = [
      { ...MULTI_NO_CAP, description: "CAM charges changed 3.0% from 2023 ($100,000) to 2024 ($103,000)." },
      { ...MULTI_NO_CAP, description: MULTI_NO_CAP.description + " (edited)" },
      { ...MULTI_NO_CAP, severity: "low" },
      { ...MULTI_NO_CAP, severity: "high" },
      { ...MULTI_NO_CAP, potential_savings: 5 },
      { ...INCREASE_DETECTED, description: "Year-over-year CAM expenses increased by 10.0%, from $40,000 to $44,000.", severity: "medium" },
      { ...INCREASE_DETECTED, description: INCREASE_DETECTED.description, severity: "high" },
      { ...INCREASE_DETECTED, category: "Year-over-Year CAM Increase Detected (custom)" },
      { ...MULTI_NO_CAP, category: "Some other category" },
    ];
    for (const f of unmatched) {
      const r = row({ free_findings: [f], paid_findings: [], savings_estimate: 0 });
      const o = containLegacyAudit(r as any) as any;
      // the only permitted change to an unmatched record is the already-approved 'contractual limits' sentence, never severity
      assert.strictEqual(o.free_findings[0].severity, f.severity, JSON.stringify(f).slice(0, 80));
    }
    // a new-format record (already low) is untouched
    const modern = row({ free_findings: [{ ...MULTI_NO_CAP, severity: "low" }], paid_findings: [], savings_estimate: 0 });
    assert.strictEqual(containLegacyAudit(modern as any), modern);
  });

  await test("invariant", "NETWORK: no outbound request was attempted by any step above", () => {
    assert.deepStrictEqual(blocked, []);
  });

  // ── summary ────────────────────────────────────────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  if (CONTROL) {
    const legacyFailing = failed.filter((r) => r.kind === "legacy").length;
    const legacyTotal = results.filter((r) => r.kind === "legacy").length;
    const invariantFailing = failed.filter((r) => r.kind === "invariant");
    console.log(`\nNEGATIVE CONTROL: legacy tests failing on the previous implementation: ${legacyFailing}/${legacyTotal} (expected: all)`);
    console.log(`NEGATIVE CONTROL: invariant tests failing on the previous implementation: ${invariantFailing.length}/${results.filter((r) => r.kind === "invariant").length} (expected: 0)`);
    for (const r of invariantFailing) console.log(`  UNEXPECTED invariant failure: ${r.name} -- ${r.why}`);
    for (const r of results.filter((x) => x.kind === "legacy" && x.ok)) console.log(`  legacy test that PASSED on the previous implementation (does not discriminate): ${r.name}`);
    process.exit(0);
  }
  console.log(`\nlegacy-containment: ${results.length} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
