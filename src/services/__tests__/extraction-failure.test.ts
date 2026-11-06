/**
 * The AI reading step can FAIL (API error, timeout, malformed output). That must be tracked and disclosed, must never be
 * presented as proof that a lease term is absent, and must stop a purchase ON THE SERVER (checkout creation shares one
 * eligibility rule with the payment webhook). A genuinely absent term, an earlier audit with no record, and the
 * successful path must behave exactly as before.
 *
 * Inputs: the repo's fictional lease and CAM statement fixtures (the same content as the fictional PDFs). The Anthropic
 * HTTP endpoint is replaced by a local stub, so there is NO real AI call, NO cost, and no other network: every other
 * outbound request throws and is counted.
 *
 * Run: npx tsx src/services/__tests__/extraction-failure.test.ts
 */
process.env.ANTHROPIC_API_KEY = "sk-ant-" + "t".repeat(48); // a stub key: the endpoint below is local

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
// @ts-expect-error the react-dom type package is not installed; the module itself is
import { renderToStaticMarkup } from "react-dom/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type Stripe from "stripe";

type Mode = "success" | "success_absent" | "http500" | "timeout" | "malformed" | "nontext" | "lease_only_fails";
let mode: Mode = "success";
let anthropicCalls = 0;
const strayNetwork: string[] = [];

const LEASE_JSON = { camCapPercentage: "5", adminFeePercentage: "15", managementFee: null, proRataShare: "8.08", tenantPremisesSqFt: "4,200", buildingTotalSqFt: "52,000", statedTenantSharePercent: null, excludedTerms: ["structural repair", "capital improvement"] };
const RECON_JSON = {
  totalCamCharges: "$53,444.13", reconciliationTotal: "$661,437.20", priorYearTotal: null, reconciliationYear: 2024, proRataShare: "8.08", adminFeePercentage: "18", managementFee: null,
  lineItems: [{ category: "management fee", amount: "100,897.20" }, { category: "roof repair", amount: "24,500.00" }, { category: "property tax", amount: "192,340.00" }],
};
const ABSENT_LEASE = { ...LEASE_JSON, camCapPercentage: null, adminFeePercentage: null, managementFee: null, excludedTerms: [] };

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const message = (text: string) => reply(200, { id: "msg_t", type: "message", role: "assistant", model: "stub", content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });

(globalThis as { fetch: unknown }).fetch = async (input: unknown, init?: { body?: unknown }) => {
  const url = String(typeof input === "string" ? input : (input as { url?: string })?.url ?? input);
  if (!url.startsWith("https://api.anthropic.com/")) { strayNetwork.push(url); throw new Error("network blocked: " + url); }
  anthropicCalls++;
  const isLease = /lease analyst/i.test(String(init?.body ?? ""));
  switch (mode) {
    case "http500": return reply(500, { type: "error", error: { type: "api_error", message: "internal" } });
    case "timeout": { const e = new Error("The operation timed out"); e.name = "TimeoutError"; throw e; }
    case "malformed": return message("I am unable to produce that as JSON, sorry.");
    case "nontext": return reply(200, { id: "msg_t", type: "message", role: "assistant", model: "stub", content: [], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
    case "lease_only_fails": return isLease ? reply(500, { type: "error", error: { type: "api_error", message: "internal" } }) : message(JSON.stringify(RECON_JSON));
    case "success_absent": return message(JSON.stringify(isLease ? ABSENT_LEASE : { ...RECON_JSON, adminFeePercentage: null }));
    default: return message(JSON.stringify(isLease ? LEASE_JSON : RECON_JSON));
  }
};

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  process.stdout.write(`  ✓ ${name}\n`);
}
const SRC = path.join(__dirname, "../..");
const FIX = path.join(__dirname, "fixtures");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8").replace(/\r\n/g, "\n");
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

(async () => {
  const quiet = { log: console.log, warn: console.warn, error: console.error };
  const lease = await textPdf(fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf8").split("\n").map(clean));
  const recon = await textPdf(fs.readFileSync(path.join(FIX, "recon-high-confidence.txt"), "utf8").split("\n").map(clean));
  const { validateDocuments } = await import("../document-validator");
  const { runAudit } = await import("../audit-logic");
  const { decidePurchase, purchaseInputFromRow } = await import("../../lib/purchase-eligibility");
  const { createCheckoutForAudit } = await import("../../lib/payments");
  const { extractionIncompleteOf, parseExtractionIncomplete, EXTRACTION_INCOMPLETE_SENTENCE, EXTRACTION_INCOMPLETE_TITLE } = await import("../../lib/extraction-status");
  const { NoPurchasePanel } = await import("../../components/audit-no-purchase");
  const { ConfidenceNotRated, TotalUnreliableNotice } = await import("../../components/audit-no-purchase");
  const { CONFIDENCE_NOT_RATED, TOTAL_UNRELIABLE_QUALIFIER } = await import("../../lib/extraction-status");

  const run = async (m: Mode) => {
    mode = m;
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    try {
      const v = await validateDocuments(lease, recon);
      const r = await runAudit(v);
      return { v, r };
    } finally { console.log = quiet.log; console.warn = quiet.warn; console.error = quiet.error; }
  };
  const rowOf = (r: Awaited<ReturnType<typeof runAudit>>) => ({
    free_findings: r.free_findings, paid_findings: r.paid_findings, overcharge_breakdown: r.overcharge_breakdown,
    lease_clauses_summary: r.leaseClausesSummary, audit_mode: r.auditMode ?? null, confidence: r.confidence, validation_warning: r.validationWarning,
  });
  const allText = (r: Awaited<ReturnType<typeof runAudit>>) => [...r.free_findings, ...r.paid_findings].map((f) => `${f.category}: ${f.description}`).join("\n");
  const ABSENCE_CLAIMS = /No admin or management fee cap was detected|No CAM cap language was detected|No CAM cap was detected in the lease|No itemized expense categories were detected/;

  // ── the successful path ──
  const ok = await run("success");
  await t("SUCCESS: the AI reads both documents, no incomplete record is kept, and the audit is purchasable as before", () => {
    assert.equal(ok.v.extraction ?? null, null);
    assert.equal(extractionIncompleteOf(ok.r.leaseClausesSummary), null);
    assert.ok(/Admin Fee Above Lease Cap/.test(allText(ok.r)), allText(ok.r));
    const d = decidePurchase(purchaseInputFromRow(rowOf(ok.r)));
    assert.equal(d.eligible, true, JSON.stringify(d));
    assert.ok(!/did not complete/i.test(allText(ok.r)));
  });

  // ── each failure mode ──
  for (const m of ["http500", "timeout", "malformed", "nontext"] as const) {
    const bad = await run(m);
    await t(`FAILURE (${m}): tracked, disclosed, never an absence claim, and not purchasable (server rule)`, () => {
      assert.deepEqual(bad.v.extraction, { lease: true, statement: true });
      assert.deepEqual(extractionIncompleteOf(bad.r.leaseClausesSummary), { lease: true, statement: true });
      const text = allText(bad.r);
      assert.ok(!ABSENCE_CLAIMS.test(text), "an absence claim was made on a failed reading:\n" + text);
      assert.ok(/did not complete/i.test(text), "the failed reading is not disclosed in the findings: " + text);
      assert.deepEqual(decidePurchase(purchaseInputFromRow(rowOf(bad.r))), { eligible: false, reason: "extraction_incomplete" });
    });
  }

  const half = await run("lease_only_fails");
  await t("FAILURE of one document only (the lease): recorded as exactly that, and still not purchasable", () => {
    assert.deepEqual(half.v.extraction, { lease: true, statement: false });
    assert.deepEqual(decidePurchase(purchaseInputFromRow(rowOf(half.r))), { eligible: false, reason: "extraction_incomplete" });
  });

  const failedRun = await run("timeout");
  await t("a failed reading that would otherwise have produced findings states 'could not determine' instead of 'absent'", () => {
    const text = allText(failedRun.r);
    assert.ok(!ABSENCE_CLAIMS.test(text), text);
    const withMissing = [...failedRun.r.free_findings, ...failedRun.r.paid_findings].filter((f) => /did not complete/i.test(f.description));
    assert.ok(withMissing.length > 0, "expected at least one missing-field finding to be re-worded: " + text);
    for (const f of withMissing) assert.ok(/not a finding that it is absent/i.test(f.description), f.description);
  });

  // ── a term that is genuinely absent is NOT an extraction failure ──
  const absent = await run("success_absent");
  await t("GENUINE ABSENCE: the AI read the documents and found no such term: no incomplete record, and checkout is not blocked for that reason", () => {
    assert.equal(absent.v.extraction ?? null, null);
    assert.equal(extractionIncompleteOf(absent.r.leaseClausesSummary), null);
    const d = decidePurchase(purchaseInputFromRow(rowOf(absent.r)));
    assert.ok(d.eligible || d.reason !== "extraction_incomplete", JSON.stringify(d));
  });

  // ── earlier audits: no record is neither 'failed' nor 'fine' ──
  await t("EARLIER AUDITS: a row with no record, or a malformed one, decides exactly as before (never inferred as failed)", () => {
    const base = rowOf(ok.r);
    const before = decidePurchase(purchaseInputFromRow(base));
    for (const junk of [undefined, null, "yes", [], { lease: "yes", statement: false }, { lease: false, statement: false }, { lease: 1, statement: 1 }]) {
      const summary = { ...(base.lease_clauses_summary as object), ...(junk === undefined ? {} : { extractionIncomplete: junk }) };
      assert.deepEqual(decidePurchase(purchaseInputFromRow({ ...base, lease_clauses_summary: summary })), before);
    }
    assert.equal(parseExtractionIncomplete({ lease: true, statement: false })?.lease, true);
    assert.equal(extractionIncompleteOf(null), null);
  });

  // ── the server enforces it: checkout creation, whatever the browser sends ──
  const OWNER = "11111111-1111-1111-1111-111111111111";
  const AUDIT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const attempt = async (row: ReturnType<typeof rowOf>) => {
    const calls = { retrieve: 0, create: 0, pending: 0 };
    const store = {
      async hasPaid() { return false; },
      async getAuditFacts() { return { owner_id: OWNER, status: "completed", recon_year_count: 1 }; },
      async getPurchaseFacts() { return purchaseInputFromRow(row); },
      async createPending() { calls.pending++; },
    } as never;
    const stripe = {
      prices: { retrieve: async () => { calls.retrieve++; return { active: true, type: "one_time", currency: "usd", livemode: false, unit_amount: 4900 }; } },
      checkout: { sessions: { create: async () => { calls.create++; return { id: "cs_x", url: "https://checkout.example/x", livemode: false }; } } },
    } as unknown as Pick<Stripe, "prices" | "checkout">;
    const result = await createCheckoutForAudit({ auditId: AUDIT, userId: OWNER, userOwnsAudit: async () => true, store, stripe, baseUrl: "https://x.test", expectLivemode: false, env: { STRIPE_PRICE_ID_SINGLE: "price_s", STRIPE_PRICE_ID_MULTI: "price_m" } });
    return { result, calls };
  };
  const badRun = await run("http500");
  await t("SERVER ENFORCEMENT: a direct checkout request for a failed-reading audit is refused; Stripe is never contacted and no payment row is made", async () => {
    const { result, calls } = await attempt(rowOf(badRun.r));
    assert.deepEqual(result, { ok: false, reason: "extraction_incomplete" });
    assert.deepEqual(calls, { retrieve: 0, create: 0, pending: 0 });
  });
  await t("SERVER ENFORCEMENT: the same audit WITHOUT the record is sold as before, so no open or earlier session is newly refused", async () => {
    const { result, calls } = await attempt(rowOf(ok.r));
    assert.equal(result.ok, true);
    assert.equal(calls.create, 1);
  });

  // ── what the customer sees ──
  await t("CUSTOMER NOTICE: plain disclosure, no price, no purchase button, a way to run it again", () => {
    const html = (renderToStaticMarkup(React.createElement(NoPurchasePanel, { reason: "extraction_incomplete" })) as string).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    assert.ok(html.includes(EXTRACTION_INCOMPLETE_TITLE), html);
    assert.ok(html.includes(EXTRACTION_INCOMPLETE_SENTENCE), html);
    assert.ok(/not reliable/i.test(html) && /may be present in your documents/i.test(html));
    assert.ok(!/\$\d+|Unlock|Buy|Pay /.test(html), html);
    assert.ok(/Run the audit again/.test(html));
  });
  await t("the checkout route maps the reason to a 409 and the results page handles it", () => {
    assert.match(read("app/api/audit/[id]/checkout/route.ts"), /extraction_incomplete: \[409,/);
    assert.match(read("app/audit/[id]/page.tsx"), /"extraction_incomplete"/);
  });
  await t("the upload route also records an additional statement the AI could not read", () => {
    const s = read("app/api/upload/route.ts");
    assert.match(s, /extraStatementAiFailed/);
    assert.match(s, /validation\.extraction = \{ lease: validation\.extraction\?\.lease \?\? false, statement: true \}/);
  });

  // ── the PRODUCTION condition, tested explicitly: no usable AI key in a deployed build ──
  const env = process.env as Record<string, string | undefined>;
  const withEnv = async <T,>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> => {
    const saved: Record<string, string | undefined> = {};
    for (const k of Object.keys(vars)) { saved[k] = env[k]; if (vars[k] === undefined) delete env[k]; else env[k] = vars[k]; }
    try { return await fn(); } finally { for (const k of Object.keys(vars)) { if (saved[k] === undefined) delete env[k]; else env[k] = saved[k]; } }
  };
  const KEY = process.env.ANTHROPIC_API_KEY as string;
  for (const [label, key] of [["no key set", undefined], ["a placeholder key ending in '...'", "sk-ant-placeholder-placeholder-placeholder..."], ["a key that is too short", "sk-short"]] as const) {
    await t(`PRODUCTION, ${label}: recorded as an incomplete reading and refused at checkout by the same server rule, with no AI call`, async () => {
      const before = anthropicCalls;
      const prod = await withEnv({ NODE_ENV: "production", ANTHROPIC_API_KEY: key }, () => run("success"));
      assert.equal(anthropicCalls, before, "an unusable key must not reach the AI endpoint");
      assert.deepEqual(prod.v.extraction, { lease: true, statement: true });
      assert.deepEqual(extractionIncompleteOf(prod.r.leaseClausesSummary), { lease: true, statement: true });
      assert.ok(!ABSENCE_CLAIMS.test(allText(prod.r)), allText(prod.r));
      assert.deepEqual(decidePurchase(purchaseInputFromRow(rowOf(prod.r))), { eligible: false, reason: "extraction_incomplete" });
      const { result, calls } = await attempt(rowOf(prod.r));
      assert.deepEqual(result, { ok: false, reason: "extraction_incomplete" });
      assert.deepEqual(calls, { retrieve: 0, create: 0, pending: 0 });
    });
  }
  await t("PRODUCTION with a usable key and a successful reading: unchanged (no record, still purchasable)", async () => {
    const prod = await withEnv({ NODE_ENV: "production", ANTHROPIC_API_KEY: KEY }, () => run("success"));
    assert.equal(prod.v.extraction ?? null, null);
    assert.equal(decidePurchase(purchaseInputFromRow(rowOf(prod.r))).eligible, true);
  });
  await t("NOT production (local runs, the offline tests) with no key: unchanged, no record", async () => {
    for (const nodeEnv of [undefined, "test", "development"]) {
      const local = await withEnv({ NODE_ENV: nodeEnv, ANTHROPIC_API_KEY: undefined }, () => run("success"));
      assert.equal(local.v.extraction ?? null, null, "NODE_ENV=" + nodeEnv);
      assert.equal(extractionIncompleteOf(local.r.leaseClausesSummary), null);
    }
  });

  // ── what the page shows for such an analysis ──
  const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");
  await t("CONFIDENCE: replaced by 'Not rated: the automated reading did not finish' with no level and no bar", () => {
    const html = renderToStaticMarkup(React.createElement(ConfidenceNotRated)) as string;
    assert.equal(CONFIDENCE_NOT_RATED, "Not rated: the automated reading did not finish");
    assert.ok(strip(html).includes(CONFIDENCE_NOT_RATED));
    assert.ok(!/\b(High|Medium|Low)\b/.test(strip(html)) && !/Based on completeness/.test(html) && !/style="width/.test(html), html);
  });
  await t("TOTAL: an incomplete analysis's headline total carries a visible qualifier", () => {
    const html = renderToStaticMarkup(React.createElement(TotalUnreliableNotice)) as string;
    assert.ok(strip(html).includes(TOTAL_UNRELIABLE_QUALIFIER) && /data-testid="headline-unreliable"/.test(html));
    assert.ok(/not a reliable result/i.test(strip(html)) && /may be missing items or amounts/i.test(strip(html)));
  });
  await t("the page swaps the badge and flags the total only for extraction_incomplete, with the qualifier directly above the headline", () => {
    const p = read("app/audit/[id]/page.tsx");
    assert.match(p, /audit\.purchase\.reason === "extraction_incomplete" \? \(\s*<ConfidenceNotRated \/>/);
    assert.match(p, /\{audit\.purchase\?\.eligible === false && audit\.purchase\.reason === "extraction_incomplete" && <TotalUnreliableNotice \/>\}\s*<AuditHeadline /);
    assert.match(p, /<ConfidenceIndicator/);
  });

  await t("no real AI call, no cost and no other network: the stub endpoint only", () => {
    assert.ok(anthropicCalls > 0);
    assert.deepEqual(strayNetwork, []);
  });

  process.stdout.write(`extraction-failure: ${n} passed, 0 failed\n`);
  process.exit(0);
})().catch((e) => { process.stdout.write(String(e instanceof Error ? e.stack : e) + "\n"); process.exit(1); });
