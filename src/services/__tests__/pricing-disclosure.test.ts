/**
 * Pricing and year-comparison disclosure: what the customer is told, from facts the engine established.
 *
 * Fictional data only (the fixtures in ./fixtures). No database, no AI, and NO NETWORK: every outbound path throws and is
 * counted. Prices, tier selection, recon_year_count semantics and the eligibility rule are NOT changed by this work, and
 * this file pins that too.
 *
 * Run: npx tsx src/services/__tests__/pricing-disclosure.test.ts
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

const blocked: string[] = [];
const refuse = (what: string) => (..._args: unknown[]): never => {
  blocked.push(what);
  throw new Error(`network blocked: ${what}`);
};
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).fetch = async () => { blocked.push("fetch"); throw new Error("network blocked: fetch"); };
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

const FIX = path.join(__dirname, "fixtures");
const SRC = path.join(__dirname, "../..");
let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

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

async function main() {
  await test("NETWORK: canary - the guard blocks and counts, then resets", async () => {
    await assert.rejects(() => fetch("https://example.invalid/"), /network blocked/);
    assert.ok(blocked.length >= 1);
    blocked.length = 0;
  });

  const { validateDocuments } = await import("../document-validator");
  const { runAudit } = await import("../audit-logic");
  const { comparisonStatusOf, quantificationNotice } = await import("../../lib/quantification");
  const { TIERS, tierForYearCount } = await import("../../lib/payments");
  const { PRICING_DISCLOSURE, COMPARISON_SENTENCE, TIER_YEARS_SENTENCE, PRICE_NOT_COMPARISON_SENTENCE } = await import("../../lib/pricing-copy");
  const { AuditResultsPaid } = await import("../../components/audit-results-paid");
  const { Pricing } = await import("../../components/home/pricing");

  const lease = await textToPdf(fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf-8"));
  const recon = await textToPdf(fs.readFileSync(path.join(FIX, "recon-high-confidence.txt"), "utf-8"));

  /** Mirrors the upload route: >= 2 usable entries are processed together; recon_year_count = distinct years (min 1, max 5). */
  async function audit(years: [number, number][], opts: { failedExtras?: boolean } = {}) {
    const v = await validateDocuments(lease, recon);
    v.leaseFields.camCapPercentage = "5";
    v.reconFields.priorYearTotal = null;
    const entries = years.map(([year, total]) => ({ year, total, lineItems: [], docName: `statement-${year}.pdf` }));
    const multi = entries.length >= 2 ? entries : undefined;
    const recon_year_count = Math.min(5, Math.max(1, new Set((multi ?? []).map((r) => r.year)).size));
    const r = await runAudit(v, { multiYearReconciliations: multi, multiYearUploadedButFailed: opts.failedExtras });
    const status = comparisonStatusOf(r.leaseClausesSummary);
    const notice = quantificationNotice(status);
    return { r, status, notice, text: notice ? notice.lines.join(" | ") : "", recon_year_count };
  }

  const NOT_COMPLETED = /Year-over-year comparison ran for|A completed comparison reports/;

  await test("CONSECUTIVE years (2023, 2024): the notice says the comparison RAN, for 1 pair, and calls it an observation, not a cap claim", async () => {
    const a = await audit([[2023, 100000], [2024, 103000]]);
    assert.deepStrictEqual(a.status?.comparison, { years: 2, pairsRun: 1, pairsSkipped: 0 });
    assert.ok(a.notice && a.notice.title === "Year-over-year comparison: what ran");
    assert.ok(/Year-over-year comparison ran for 1 pair of consecutive years\./.test(a.text));
    assert.ok(/It is an observation, not a calculated cap claim/.test(a.text));
    assert.ok(!/did not run|No year-over-year comparison ran|only\./.test(a.text), "nothing is said to be missing");
    assert.ok(!a.text.includes(PRICE_NOT_COMPARISON_SENTENCE), "no price caveat is needed when every pair ran");
    assert.strictEqual(tierForYearCount(a.recon_year_count), "multi");
  });

  await test("NONCONSECUTIVE years (2021, 2024): $149 tier, and the notice says NO comparison ran - never that one completed", async () => {
    const a = await audit([[2021, 100000], [2024, 103000]]);
    assert.deepStrictEqual(a.status?.comparison, { years: 2, pairsRun: 0, pairsSkipped: 1 });
    assert.strictEqual(tierForYearCount(a.recon_year_count), "multi", "pricing is unchanged: two distinct years");
    assert.ok(/No year-over-year comparison ran\./.test(a.text));
    assert.ok(/did not run for 2021 to 2024: the years are not consecutive/.test(a.text));
    assert.ok(a.text.includes(PRICE_NOT_COMPARISON_SENTENCE));
    assert.ok(!NOT_COMPLETED.test(a.text), "no statement that a comparison completed");
    assert.ok(!/Statement totals were compared/.test(a.r.validationWarning ?? ""));
  });

  await test("PARTIAL (2022, 2023, 2025): the notice says it ran for ONE pair only, names the pair that did not, and keeps the price caveat", async () => {
    const a = await audit([[2022, 100000], [2023, 103000], [2025, 110000]]);
    assert.deepStrictEqual(a.status?.comparison, { years: 3, pairsRun: 1, pairsSkipped: 1 });
    assert.strictEqual(tierForYearCount(a.recon_year_count), "multi");
    assert.ok(/ran for 1 pair of consecutive years only\./.test(a.text));
    assert.ok(/did not run for 2023 to 2025/.test(a.text));
    assert.ok(a.text.includes(PRICE_NOT_COMPARISON_SENTENCE));
    assert.ok(/It is an observation, not a calculated cap claim/.test(a.text), "what did run is described as an observation");
  });

  await test("DUPLICATE year, same statement twice (2024, 2024): one distinct year, $49 tier, and the notice says no comparison ran and why", async () => {
    const a = await audit([[2024, 100000], [2024, 100000]]);
    assert.deepStrictEqual(a.status?.comparison, { years: 1, pairsRun: 0, pairsSkipped: 0 });
    assert.strictEqual(a.recon_year_count, 1);
    assert.strictEqual(tierForYearCount(a.recon_year_count), "single");
    assert.ok(/No year-over-year comparison ran\./.test(a.text) && /cover only one distinct year\./.test(a.text));
    assert.ok(!NOT_COMPLETED.test(a.text));
  });

  await test("DUPLICATE year with DIFFERENT totals (2024: 100,000 and 120,000): no comparison, the reason names the conflict, and it is not also called 'one distinct year'", async () => {
    const a = await audit([[2024, 100000], [2024, 120000]]);
    assert.ok(/No year-over-year comparison ran\./.test(a.text));
    assert.ok(/more than one statement with different totals was found for 2024/.test(a.text));
    assert.ok(!/cover only one distinct year/.test(a.text));
    assert.ok(!NOT_COMPLETED.test(a.text));
  });

  await test("DUPLICATE inside a run (2023, 2024 twice with different totals, 2025): neither step touching 2024 is called complete", async () => {
    const a = await audit([[2023, 100000], [2024, 100000], [2024, 120000], [2025, 130000]]);
    assert.strictEqual(a.status?.comparison?.pairsRun, 0);
    assert.ok(/No year-over-year comparison ran\./.test(a.text) && /2023 to 2024/.test(a.text) && /2024 to 2025/.test(a.text));
    assert.ok(!NOT_COMPLETED.test(a.text));
  });

  await test("ONE statement only: no comparison claim of any kind is made, and the price is the single-year price", async () => {
    const a = await audit([]);
    assert.strictEqual(a.status?.comparison, undefined);
    assert.ok(!/comparison/i.test(a.text));
    assert.strictEqual(tierForYearCount(a.recon_year_count), "single");
  });

  await test("EXTRAS UPLOADED BUT UNREADABLE: the notice says so and does not claim a comparison", async () => {
    const a = await audit([], { failedExtras: true });
    assert.strictEqual(a.status?.uploadedButFailed, true);
    assert.ok(/a year and total could not be read from them, so no comparison ran for those/.test(a.text));
    assert.ok(!NOT_COMPLETED.test(a.text));
  });

  await test("EARLIER AUDITS (no comparison record) get no comparison statement - a missing record is not a claim", () => {
    assert.strictEqual(quantificationNotice(comparisonStatusOf({ comparisonStatus: undefined })), null);
    assert.strictEqual(quantificationNotice(comparisonStatusOf({ comparisonStatus: { notCompared: [], unquantified: [], comparison: { years: -1, pairsRun: "x" } } })), null, "a malformed record is no record");
  });

  await test("BEFORE PAYMENT: the purchase panel shows the comparison facts before the price button, however many findings are listed", async () => {
    const mixed = await audit([[2022, 100000], [2023, 103000], [2025, 110000]]);
    const filler = (i: number) => ({ category: `Pro-Rata Share Review ${i}`, description: `filler ${i}`, potential_savings: 0, severity: "medium" as const });
    const html = renderToStaticMarkup(
      React.createElement(AuditResultsPaid, { findings: [filler(1), filler(2), filler(3), filler(4), filler(5)], premiumSavings: 0, priceLabel: "$149", quantificationNotice: mixed.notice }),
    ) as string;
    const at = html.indexOf("quantification-notice");
    assert.ok(at > 0 && at < html.indexOf("Unlock Full Report"), "notice before the button");
    assert.ok(/ran for 1 pair of consecutive years only/.test(html) && /did not run for 2023 to 2025/.test(html));
    const none = await audit([[2021, 100000], [2024, 103000]]);
    const htmlNone = renderToStaticMarkup(React.createElement(AuditResultsPaid, { findings: [filler(1)], premiumSavings: 0, priceLabel: "$149", quantificationNotice: none.notice })) as string;
    assert.ok(/No year-over-year comparison ran/.test(htmlNone) && !/Year-over-year comparison ran for/.test(htmlNone));
    assert.ok(htmlNone.includes("Unlock Full Report – $149"), "the price shown is unchanged");
  });

  await test("PUBLIC COPY: the pricing section and the other identified surfaces state the rule, and no longer promise a cap comparison", () => {
    const html = renderToStaticMarkup(React.createElement(Pricing)) as string;
    const flat = html.replace(/<!-- -->/g, "");
    for (const s of [TIER_YEARS_SENTENCE, COMPARISON_SENTENCE, PRICE_NOT_COMPARISON_SENTENCE]) assert.ok(flat.includes(s), `pricing section is missing: ${s}`);
    assert.ok(/two to five distinct years/.test(flat) && /observations, where your statements are for consecutive years/.test(flat) && !/observations between consecutive years/.test(flat));
    assert.ok(!/Escalation compared with your lease cap/.test(flat) && !/Year-over-year comparison across your statements/.test(flat));
    assert.ok(flat.includes("$49") && flat.includes("$149"), "both prices still shown");
    const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");
    assert.ok(/distinct years of statements/.test(read("app/terms/page.tsx")) && /not a calculated cap claim/.test(read("app/terms/page.tsx")));
    assert.ok(/consecutive years can be compared year over year/.test(read("app/upload/page.tsx")));
    const home = read("app/page.tsx");
    assert.ok(/runs only between consecutive years/.test(home) && /distinct years of statements/.test(home));
    assert.ok(!/reveal escalation patterns/.test(home));
    assert.ok(/two to five distinct years/.test(read("app/sample-cam-audit-report/page.tsx")));
    assert.ok(PRICING_DISCLOSURE.includes(TIER_YEARS_SENTENCE) && PRICING_DISCLOSURE.includes(COMPARISON_SENTENCE));
  });

  await test("UNCHANGED: prices, tier selection, the recon_year_count rule and the eligibility rule", () => {
    assert.strictEqual(TIERS.single.amount, 4900);
    assert.strictEqual(TIERS.multi.amount, 14900);
    assert.strictEqual(TIERS.multi.maxYears, 5);
    assert.deepStrictEqual([1, 2, 3, 5, 6, 0, null].map((y) => tierForYearCount(y as any)), ["single", "multi", "multi", "multi", null, null, null]);
    const upload = fs.readFileSync(path.join(SRC, "app/api/upload/route.ts"), "utf8");
    assert.ok(/Math\.max\(1, new Set\(\(multiYearReconciliations \?\? \[\]\)\.map\(\(r\) => r\.year\)\)\.size\)/.test(upload), "recon_year_count is still the number of distinct years");
    const elig = fs.readFileSync(path.join(SRC, "lib/purchase-eligibility.ts"), "utf8");
    assert.ok(/const actionable = plan\.tierCounts\.calculated \+ plan\.tierCounts\.judgment;/.test(elig));
    const pay = fs.readFileSync(path.join(SRC, "lib/payments.ts"), "utf8");
    assert.ok(/return years === 1 \? "single" : "multi";/.test(pay));
  });

  await test("NETWORK: no outbound request was attempted by any step above", () => {
    assert.deepStrictEqual(blocked, []);
  });

  console.log(`\npricing-disclosure: ${passed} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
