/**
 * Cap and gross-up CONTAINMENT, plus the multi-year year-selection protections.
 *
 * What this pins down:
 *  - a cap or gross-up result whose method, baseline, covered expenses or amendments are not established is an
 *    OBSERVATION: it carries no calculated amount, in any field or in any sentence, on any surface;
 *  - such an item is a needs-review item that can never make an audit purchasable by itself;
 *  - the headline, locked-card amounts, plan, PDF and letter all agree, and no fallback brings a removed amount back;
 *  - the persistent notice does not depend on which findings are visible;
 *  - only distinct, consecutive years are compared, and duplicate / nonconsecutive years are reported, never priced.
 *
 * Fictional data only (the fixtures in ./fixtures). No AI, no database, and NO NETWORK: every outbound path is
 * replaced with one that throws and counts, and the test fails if anything was attempted. (Removing the API key alone
 * is not network isolation.)
 *
 * Run: npx tsx src/services/__tests__/multiyear-cap.test.ts
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

const FIX = path.join(__dirname, "fixtures");
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

const li = (category: string, amount: string) => ({ category, amount, rawLine: `${category} ${amount}` });
const entry = (year: number, total: number, items: ReturnType<typeof li>[] = []) => ({ year, total, lineItems: items, docName: `statement-${year}.pdf` });

/** Sentences that would present a lease-supported cap result or adjustment. None may appear in an unquantified item. */
// (the disclaimer "no allowable amount or excess is calculated" is allowed: only sentences that STATE such a result are not)
const CALCULATED_PROSE = /allowable (maximum|amount) (under|would|is|of|for)|maximum allowable|allowed maximum|potential excess (of|to)|potential review amount|potential discrepancy:|applying the cap|would be \$|reasonable (increase|amount)/i;

async function main() {
  // The guard must really block, and the canary calls must not count against the run.
  await test("NETWORK: every outbound path refuses and is counted (canary), then the counter is reset", async () => {
    await assert.rejects(() => fetch("https://example.invalid/"), /network blocked/);
    assert.throws(() => http.request("http://example.invalid/"), /network blocked/);
    assert.throws(() => https.get("https://example.invalid/"), /network blocked/);
    assert.throws(() => net.connect(80, "example.invalid"), /network blocked/);
    assert.ok(blocked.length >= 4, `the guard recorded ${blocked.length} canary attempts`);
    blocked.length = 0;
  });

  const { validateDocuments, extractTextFromPdf } = await import("../document-validator");
  const { runAudit } = await import("../audit-logic");
  const { buildDisputeLetter } = await import("../dispute-letter");
  const { buildReviewPlan } = await import("../review-plan");
  const { generateReportPdf } = await import("../report-pdf");
  const { decidePurchase, purchaseInputFromRow } = await import("../../lib/purchase-eligibility");
  const { totalSavings } = await import("../savings-math");
  const { findingKind } = await import("../finding-classification");
  const { toPublicAudit } = await import("../../lib/audit-access");
  const { tierForYearCount } = await import("../../lib/payments");
  const { formatMoney } = await import("../../lib/format");
  const Q = await import("../../lib/quantification");
  const { AuditResultsPaid } = await import("../../components/audit-results-paid");
  const { AuditResultsFree } = await import("../../components/audit-results-free");
  const { NoPurchasePanel } = await import("../../components/audit-no-purchase");

  const lease = await textToPdf(fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf-8"));
  const recon = await textToPdf(fs.readFileSync(path.join(FIX, "recon-high-confidence.txt"), "utf-8"));

  type Opts = {
    prior?: string;
    primaryYear?: number;
    /** add a sentence saying the cap applies to controllable expenses only */
    controllable?: boolean;
    grossUp?: boolean;
    /** the independent, lease-supported management-fee finding ($1,359) */
    adminFee?: boolean;
    /** an excluded-category line (roof repair): $1,979.60 at the tenant share */
    roof?: boolean;
  };

  async function run(years: ReturnType<typeof entry>[] | undefined, opts: Opts = {}) {
    const v = await validateDocuments(lease, recon);
    v.leaseFields.camCapPercentage = "5";
    v.reconFields.priorYearTotal = opts.prior ?? null;
    if (opts.prior) v.reconText += `\nPrior Year Total: $${opts.prior}`;
    if (opts.primaryYear) v.reconFields.reconciliationYear = opts.primaryYear;
    // The fixture lease already uses the word "controllable" (three times). Make it explicit per case so that the
    // caveat, and the absence of one, can both be asserted.
    v.leaseText = v.leaseText.replace(/controllable/gi, "variable");
    if (opts.controllable) v.leaseText += "\nThe cap applies to controllable expenses only.";
    if (opts.grossUp) v.leaseText += "\nOperating expenses shall be grossed up to 95% occupancy.";
    if (opts.adminFee) {
      v.leaseFields.adminFeePercentage = "15";
      v.reconFields.adminFeePercentage = "18";
      v.reconFields.lineItems.push(li("Management Fee", "100,897.20"));
    }
    if (opts.roof) {
      v.reconFields.lineItems = v.reconFields.lineItems.filter((i) => !/roof repair/i.test(i.category));
      v.reconFields.lineItems.push(li("Roof Repair", "24,500.00"));
    }
    const r = await runAudit(v, years ? { multiYearReconciliations: years } : undefined);
    const all = [...r.free_findings, ...r.paid_findings];
    const unq = all.filter((f) => f.quantified === false);
    const capObs = all.filter((f) => f.category === "CAM Cap Review: Increase Above Stated Percentage");
    const grossUp = all.filter((f) => f.category === "Gross-Up Screening Signal (Heuristic)");
    const notComparable = all.filter((f) => f.category === "CAM Cap Review: Years Not Comparable");
    const counted = Q.sumCounted(all.filter((f) => !f.insufficientData));
    return { r, all, unq, capObs, grossUp, notComparable, counted };
  }
  type Run = Awaited<ReturnType<typeof run>>;

  /** The audits-row shape the server stores and the API/PDF/letter routes read back. */
  const rowOf = (x: Run) => ({
    free_findings: x.r.free_findings,
    paid_findings: x.r.paid_findings,
    overcharge_breakdown: x.r.overcharge_breakdown,
    lease_clauses_summary: x.r.leaseClausesSummary,
    audit_mode: x.r.auditMode,
    confidence: x.r.confidence,
    validation_warning: x.r.validationWarning,
  });
  const pdfText = async (x: Run, isPaid: boolean) =>
    (
      await extractTextFromPdf(
        Buffer.from(
          await generateReportPdf({
            auditId: "00000000-0000-0000-0000-000000000000",
            createdAt: "2026-01-01T00:00:00.000Z",
            savingsEstimate: x.r.savings_estimate,
            freeFindings: x.r.free_findings,
            paidFindings: x.r.paid_findings,
            isPaid,
            confidence: x.r.confidence,
            confidenceScore: x.r.confidenceScore,
            validationWarning: x.r.validationWarning,
            estimatedOvercharge: x.r.estimated_overcharge,
            overchargeBreakdown: x.r.overcharge_breakdown,
            leaseClausesSummary: x.r.leaseClausesSummary,
          }),
        ),
      )
    ).text.replace(/\s+/g, " ");

  // ── the $67,256 triple-overlap fixture ────────────────────────────────────────────────────────────────────────
  // Before containment: admin fee $1,359 + total-change excess $40,000 + gross-up $25,897 = $67,256. The management-fee
  // and landscaping increases sit inside the $40,000 and again inside the $25,897. Only the admin fee is independent.
  const TRIPLE = [
    entry(2023, 400000, [li("Management Fee", "80,000.00"), li("Landscaping", "20,000.00")]),
    entry(2024, 460000, [li("Management Fee", "100,897.20"), li("Landscaping", "30,000.00")]),
  ];
  const triple = await run(TRIPLE, { grossUp: true, adminFee: true });

  await test("TRIPLE OVERLAP ($67,256): only the independent admin-fee amount remains in the aggregate", () => {
    const fee = triple.all.find((f) => /admin fee above lease cap/i.test(f.category));
    assert.ok(fee && fee.potential_savings === 1359, "the lease-supported fee finding is unchanged");
    assert.strictEqual(triple.r.estimated_overcharge, 0);
    assert.strictEqual(triple.r.savings_estimate, 1359);
    assert.strictEqual(triple.counted, 1359);
    assert.ok(triple.capObs.length >= 1 && triple.grossUp.length === 1, "the cap and gross-up observations are still visible");
    for (const f of [...triple.capObs, ...triple.grossUp]) assert.ok(f.potential_savings === 0 && f.quantified === false);
  });

  await test("NO UNSUPPORTED AMOUNT in any field or sentence (the removed amounts and the sentences that stated them)", () => {
    for (const f of triple.unq) {
      assert.strictEqual(f.potential_savings, 0);
      assert.ok(!CALCULATED_PROSE.test(f.description), `calculated-result wording in "${f.category}": ${f.description.match(CALCULATED_PROSE)?.[0]}`);
      // the specific figures the old engine produced for this fixture
      for (const gone of ["$40,000", "$25,897", "$25,896", "$420,000", "$67,256"]) assert.ok(!f.description.includes(gone), `${gone} in "${f.category}"`);
      for (const e of f.sourceEvidence ?? []) for (const gone of ["$40,000", "$25,897"]) assert.ok(!e.extractedText.includes(gone));
    }
  });

  await test("ATTRIBUTED OBSERVATIONS are kept: statement totals, category amounts and the extracted percentage", () => {
    const cap = triple.capObs[0];
    assert.ok(/\$400,000/.test(cap.description) && /\$460,000/.test(cap.description), "both statement totals");
    assert.ok(/5%/.test(cap.description), "the extracted percentage");
    assert.ok(cap.sourceEvidence?.some((e) => /2023 Total: \$400,000/.test(e.extractedText)) && cap.sourceEvidence?.some((e) => /2024 Total: \$460,000/.test(e.extractedText)));
    const g = triple.grossUp[0];
    assert.ok(/Management Fee \$80,000 \(2023\) to \$100,897\.20 \(2024\), \+26\.1%/.test(g.description), g.description);
    assert.ok(g.sourceEvidence?.some((e) => /Landscaping: \$20,000 \(2023\)/.test(e.extractedText)));
  });

  await test("DO NOT IMPLY A VIOLATION: no 'exceeds the lease cap' / 'within limit' conclusion, and the method is stated as not established", () => {
    for (const f of triple.unq) {
      assert.ok(!/exceeds (the )?lease cap|exceedance|violat|breach|overcharg/i.test(f.category + " " + f.description), f.category);
    }
    assert.ok(/did not establish how the cap is measured/.test(triple.capObs[0].description));
    assert.ok(/not taken from your lease/.test(triple.grossUp[0].description) && /heuristic/i.test(triple.grossUp[0].description));
    assert.ok(!/\b5%\b.*(reasonable|threshold)|reasonable.*\b5%/i.test(triple.grossUp[0].description), "no hardcoded 5% presented as a limit");
    assert.ok(/15%/.test(triple.grossUp[0].description), "the 15% is named as the tool's own screening threshold");
  });

  await test("PREVIEW / PLAN / PDF / LETTER agree on one total, and none carries an unsupported amount", async () => {
    const headline = formatMoney(triple.r.savings_estimate);
    // letter
    const letter = buildDisputeLetter({ findings: triple.all, overchargeBreakdown: triple.r.overcharge_breakdown, leaseClausesSummary: triple.r.leaseClausesSummary });
    assert.strictEqual(letter.total, triple.r.savings_estimate);
    const adjustmentSection = letter.text.split("ITEMS I ASK YOU TO CLARIFY")[0];
    assert.ok(!/CAM Cap Review|Gross-Up/.test(adjustmentSection), "no unquantified item under the adjustment heading");
    assert.ok(letter.text.includes("ITEMS I ASK YOU TO CLARIFY") && /Gross-Up Screening Signal/.test(letter.text));
    for (const gone of ["$40,000", "$25,897", "$67,256"]) assert.ok(!letter.text.includes(gone), `${gone} in the letter`);
    assert.ok(letter.items.filter((i) => i.kind === "adjustment").every((i) => !/CAM Cap|Gross-Up/.test(i.title)));
    // plan
    const plan = buildReviewPlan({ findings: triple.all, overchargeBreakdown: triple.r.overcharge_breakdown, leaseClausesSummary: triple.r.leaseClausesSummary, confidence: triple.r.confidence });
    assert.strictEqual(plan.calculatedTotal + plan.judgmentTotal, triple.r.savings_estimate);
    for (const t of ["CAM Cap Review: Increase Above Stated Percentage", "Gross-Up Screening Signal (Heuristic)"]) {
      const item = plan.items.find((i) => i.title === t)!;
      assert.ok(item && item.tier === "needs-data" && item.amount === null, `${t} is a needs-data item with no amount`);
      assert.ok(/not a calculated amount/.test(item.whyRanked));
    }
    // PDF (preview and paid): headline is the one total, unsupported figures absent
    for (const isPaid of [false, true]) {
      const text = await pdfText(triple, isPaid);
      const at = text.indexOf("POTENTIAL BILLING DISCREPANCIES");
      const box = at >= 0 ? text.slice(at, at + 80) : text;
      assert.ok(box.includes(headline) || text.includes(headline), `PDF headline ${headline} (isPaid=${isPaid})`);
      for (const gone of ["$40,000", "$25,897", "$67,256"]) assert.ok(!text.includes(gone), `${gone} in the ${isPaid ? "paid" : "preview"} PDF`);
    }
    // preview teaser (what the browser is sent before payment)
    const teaser = toPublicAudit({ id: "a", status: "completed", savings_estimate: triple.r.savings_estimate, free_findings: triple.r.free_findings }, triple.r.paid_findings) as {
      paid_findings: { category: string; potential_savings: number; quantified?: boolean }[];
    };
    assert.strictEqual(Q.sumCounted(teaser.paid_findings as never), triple.r.paid_findings.reduce((s, f) => s + Q.countedAmount(f), 0));
    for (const f of teaser.paid_findings.filter((x) => /Gross-Up|CAM Cap Review/.test(x.category))) assert.ok(f.potential_savings === 0 && f.quantified === false);
  });

  await test("NO HEADLINE FALLBACK resurrects a removed amount (page, PDF, locked cards, letter, teaser, plan)", async () => {
    const poisoned = triple.all.map((f) => (f.quantified === false ? { ...f, potential_savings: 9999 } : f));
    // every sum the screens use
    assert.strictEqual(Q.sumCounted(poisoned), 1359);
    assert.strictEqual(totalSavings(poisoned, 0), 1359);
    // the engine invariant zeroes a stray amount before it is stored
    assert.ok(triple.all.every((f) => f.quantified !== false || f.potential_savings === 0));
    // PDF headline = max(savingsEstimate, sum of findings): a stray amount must not win that max
    const text = await pdfText({ ...triple, r: { ...triple.r, free_findings: poisoned.filter((f) => triple.r.free_findings.some((g) => g.category === f.category)), paid_findings: poisoned.filter((f) => triple.r.paid_findings.some((g) => g.category === f.category)) } } as Run, true);
    assert.ok(!text.includes("$9,999") && !text.includes("$19,998") && !text.includes("$10,000"), "a stray amount reached the PDF");
    // letter and plan
    const letter = buildDisputeLetter({ findings: poisoned, overchargeBreakdown: [], leaseClausesSummary: null });
    assert.strictEqual(letter.total, 1359);
    assert.ok(!letter.text.includes("9,999"));
    assert.strictEqual(buildReviewPlan({ findings: poisoned, overchargeBreakdown: [], leaseClausesSummary: null }).calculatedTotal, 1359);
    // locked-card teaser
    const teaser = toPublicAudit({ id: "a", status: "completed" }, poisoned.filter((f) => f.quantified === false)) as { paid_findings: { potential_savings: number }[] };
    assert.ok(teaser.paid_findings.every((f) => f.potential_savings === 0));
    // the screens: static scan, the way the other suites check wording on code the server does not run
    const pageSrc = fs.readFileSync(path.join(__dirname, "../../app/audit/[id]/page.tsx"), "utf8");
    assert.ok(/headlineFigures\(\{[\s\S]*findings: totalFindings/.test(pageSrc) && /sumCounted\(paidFindings/.test(pageSrc)); // the page's headline decision is the tested helper headlineFigures
    assert.ok(!/\.reduce\(\(sum, f\) => sum \+ f\.potential_savings/.test(pageSrc), "the page must not sum raw finding amounts");
    const pdfSrc = fs.readFileSync(path.join(__dirname, "../report-pdf.ts"), "utf8");
    assert.ok(!/\.reduce\(\(sum, f\) => sum \+ f\.potential_savings/.test(pdfSrc), "the PDF must not sum raw finding amounts");
    // rendered: a locked card and a free card show no amount for an unquantified item, even if one were stored
    const stray = { category: "CAM Cap Review: Increase Above Stated Percentage", description: "d", potential_savings: 9999, severity: "medium" as const, quantified: false };
    const free = renderToStaticMarkup(React.createElement(AuditResultsFree, { findings: [stray] }));
    assert.ok(!free.includes("9,999") && /No amount calculated/.test(free));
    const paid = renderToStaticMarkup(React.createElement(AuditResultsPaid, { findings: [stray], premiumSavings: 0, priceLabel: "$49" }));
    assert.ok(!paid.includes("9,999"), "locked card / lockedAmountNote showed a stray amount");
  });

  await test("ENGINE SOURCE: the hardcoded 5% gross-up pricing and the primary-year suppression are gone", () => {
    const src = fs.readFileSync(path.join(__dirname, "../audit-logic.ts"), "utf8");
    assert.ok(!/priorAmount \* 1\.05/.test(src) && !/Potential review amount/.test(src) && !/potentialReviewAmount/.test(src));
    assert.ok(!/singleYearCapDollars/.test(src) && !/primaryYear/.test(src), "the primary-year / latest-pair suppression rule is removed");
    assert.ok(!/Potential CAM Cap Exceedance|Year-over-Year CAM Escalation Exceeds Lease Cap|CAM Cap Within Limit/.test(src), "no engine path still emits the old cap names");
  });

  // ── eligibility ───────────────────────────────────────────────────────────────────────────────────────────────
  await test("UNSUPPORTED-ONLY audit is not purchasable and is not called clean", () => {
    // the cap/gross-up observations and the notice from a real run, with every other finding removed
    const only = triple.all.filter((f) => f.quantified === false || f.category === "CAM Cap Review: Years Not Comparable");
    assert.ok(only.length >= 2);
    const d = decidePurchase({ ...purchaseInputFromRow({ ...rowOf(triple), free_findings: only, paid_findings: [], overcharge_breakdown: [] }) });
    assert.strictEqual(d.eligible, false);
    if (!d.eligible) {
      assert.strictEqual(d.reason, "insufficient_analysis", "never 'nothing_to_unlock' (a clean result)");
      assert.ok((d.unquantifiedChecks ?? 0) >= 2);
    }
    // the same, as the customer sees it
    const status = Q.comparisonStatusOf(triple.r.leaseClausesSummary);
    const html = renderToStaticMarkup(React.createElement(NoPurchasePanel, { reason: "insufficient_analysis", unquantifiedChecks: 2, notice: Q.quantificationNotice(status) }));
    assert.ok(/not a clean result/.test(html) && /not offering a purchase/.test(html) && /quantification-notice/.test(html));
    assert.ok(!/Unlock|\$49|\$149|checkout/i.test(html), "no purchase control");
    // a single unquantified item alone, with nothing else at all
    const lone = decidePurchase(purchaseInputFromRow({ free_findings: [triple.capObs[0]], paid_findings: [] }));
    assert.deepStrictEqual(lone.eligible, false);
  });

  await test("CLEAN is still clean: no findings at all stays 'insufficient' (no change), a matching audit is unchanged", () => {
    const empty = decidePurchase(purchaseInputFromRow({ free_findings: [], paid_findings: [] }));
    assert.ok(!empty.eligible && empty.reason === "insufficient_analysis" && empty.unquantifiedChecks === undefined);
    const matchOnly = decidePurchase(purchaseInputFromRow({ free_findings: [{ category: "Tenant share (matches lease)", description: "d", potential_savings: 0, severity: "low" }], paid_findings: [] }));
    assert.ok(!matchOnly.eligible && matchOnly.reason === "nothing_to_unlock");
  });

  const mixed = await run(TRIPLE, { grossUp: true, adminFee: true, roof: true });
  await test("MIXED audit keeps unrelated supported behavior: fee + excluded category counted and purchasable, cap/gross-up listed without amounts", () => {
    assert.strictEqual(mixed.r.estimated_overcharge, 1979.6);
    assert.strictEqual(mixed.r.savings_estimate, 3338.6); // 1,359 + 1,979.60
    const d = decidePurchase(purchaseInputFromRow(rowOf(mixed)));
    assert.ok(d.eligible, "a real calculated item still makes the audit purchasable");
    if (d.eligible) {
      assert.strictEqual(d.completeness, "partial");
      assert.ok(d.notes.some((n) => /without a dollar amount/.test(n)), "disclosed before the price");
      assert.ok(!d.notes.some((n) => /could not be completed/.test(n) && /cap or gross-up/.test(n)));
    }
    const plan = buildReviewPlan({ findings: mixed.all, overchargeBreakdown: mixed.r.overcharge_breakdown, leaseClausesSummary: mixed.r.leaseClausesSummary });
    assert.strictEqual(plan.calculatedTotal + plan.judgmentTotal, 3338.6);
    assert.ok(plan.tierCounts.calculated >= 1 && plan.tierCounts["needs-data"] >= 2);
    assert.ok(mixed.all.filter((f) => /excluded category|admin fee above/i.test(f.category)).every((f) => f.quantified === undefined), "the flag is set only where an amount was withheld");
  });

  // ── persistent notice ─────────────────────────────────────────────────────────────────────────────────────────
  const nonconsec = await run([entry(2021, 100000), entry(2024, 110300)]);
  await test("NOTICE: stored with the audit, names the comparison that did not run, and is built from the record alone", () => {
    const st = Q.comparisonStatusOf(nonconsec.r.leaseClausesSummary);
    assert.ok(st && st.notCompared.some((n) => /^2021 to 2024: the years are not consecutive/.test(n)));
    const n = Q.quantificationNotice(st)!;
    assert.ok(n.lines.some((l) => /did not run for 2021 to 2024/.test(l)));
    assert.ok(n.lines.some((l) => /price follows the number of distinct years found, not how many comparisons could run/.test(l)));
    const tripleNotice = Q.quantificationNotice(Q.comparisonStatusOf(triple.r.leaseClausesSummary))!;
    assert.ok(tripleNotice.lines.some((l) => /no allowable maximum or excess is calculated/.test(l)));
    assert.ok(tripleNotice.lines.some((l) => /heuristic/.test(l) && /15%/.test(l)));
  });

  await test("NOTICE is visible next to the purchase control even when the 'not comparable' finding is beyond the first three free findings", () => {
    const notice = Q.quantificationNotice(Q.comparisonStatusOf(nonconsec.r.leaseClausesSummary))!;
    const filler = (i: number) => ({ category: `Pro-Rata Share Review ${i}`, description: `filler ${i}`, potential_savings: 0, severity: "medium" as const });
    const free = [filler(1), filler(2), filler(3), filler(4), ...nonconsec.notComparable];
    const freeHtml = renderToStaticMarkup(React.createElement(AuditResultsFree, { findings: free }));
    assert.ok(!/could not be compared against the annual cap/.test(freeHtml), "the finding itself is hidden by the 3-item preview");
    const html = renderToStaticMarkup(React.createElement(AuditResultsPaid, { findings: [filler(5), filler(6), filler(7), filler(8)], premiumSavings: 0, priceLabel: "$149", quantificationNotice: notice }));
    const at = html.indexOf("quantification-notice");
    assert.ok(at > 0 && /did not run for 2021 to 2024/.test(html), "notice rendered");
    assert.ok(at < html.indexOf("Unlock Full Report"), "the notice comes before the purchase button");
    // with no record there is no notice (and nothing is invented)
    const none = renderToStaticMarkup(React.createElement(AuditResultsPaid, { findings: [], premiumSavings: 0, priceLabel: "$49", quantificationNotice: null }));
    assert.ok(!/quantification-notice/.test(none));
  });

  await test("PRICING UNCHANGED: tiering still follows the number of distinct years; disclosure is not presented as resolving it", () => {
    assert.strictEqual(tierForYearCount(2), "multi");
    assert.strictEqual(tierForYearCount(1), "single");
    assert.strictEqual(tierForYearCount(new Set([2021, 2024]).size), "multi", "2021+2024 is still two distinct years");
    const text = Q.quantificationNotice(Q.comparisonStatusOf(nonconsec.r.leaseClausesSummary))!.lines.join(" ");
    assert.ok(!/refund|discount|free|waive|no charge/i.test(text), "the notice makes no pricing promise");
  });

  // ── what the screens and the completion/confidence wording may claim ──────────────────────────────────────────
  await test("COMPLETION and CONFIDENCE wording does not imply the cap was validated merely because totals were compared", async () => {
    const cons = await run([entry(2023, 100000), entry(2024, 110000)]);
    assert.ok(!/analyzed against the lease-defined cap|completed\./i.test(cons.r.validationWarning ?? ""), cons.r.validationWarning ?? "");
    assert.ok(/Statement totals were compared/.test(cons.r.validationWarning ?? "") && /does not validate the lease cap/.test(cons.r.validationWarning ?? ""));
    assert.strictEqual(cons.r.confidenceScore, nonconsec.r.confidenceScore, "comparing totals earns no confidence boost");
    assert.strictEqual(cons.r.savings_estimate, cons.r.estimated_overcharge);
  });

  // ── year selection (existing protections, kept) ───────────────────────────────────────────────────────────────
  await test("CONSECUTIVE years: one observation for the pair, no amount, no 'not comparable' notice", async () => {
    const x = await run([entry(2023, 100000), entry(2024, 110000)]);
    assert.strictEqual(x.capObs.length, 1);
    assert.ok(x.capObs[0].potential_savings === 0 && x.capObs[0].quantified === false);
    assert.strictEqual(x.notComparable.length, 0);
    assert.strictEqual(x.r.savings_estimate, x.r.estimated_overcharge);
    assert.ok(!/\$5,000|\$105,000/.test(x.capObs[0].description), "the old excess / allowable figures are not stated");
  });

  await test("NONCONSECUTIVE years (2021, 2024): no cap observation for the pair, a needs-data notice, nothing counted", () => {
    assert.strictEqual(nonconsec.capObs.length, 0);
    assert.strictEqual(nonconsec.notComparable.length, 1);
    assert.ok(nonconsec.notComparable[0].insufficientData && nonconsec.notComparable[0].potential_savings === 0);
    assert.ok(/2021 to 2024/.test(nonconsec.notComparable[0].description) && /not consecutive/.test(nonconsec.notComparable[0].description));
    assert.strictEqual(nonconsec.r.savings_estimate, nonconsec.r.estimated_overcharge);
    assert.ok(!/compared for consecutive years|Statement totals were compared/.test(nonconsec.r.validationWarning ?? ""), "no comparison ran, so none is claimed");
  });

  await test("DUPLICATE year with different totals: never compared, a needs-data notice, nothing counted", async () => {
    const x = await run([entry(2024, 100000), entry(2024, 110000)]);
    assert.strictEqual(x.capObs.length, 0);
    assert.strictEqual(x.r.savings_estimate, x.r.estimated_overcharge);
    assert.strictEqual(x.notComparable.length, 1);
    assert.ok(/different totals/.test(x.notComparable[0].description));
  });

  await test("DUPLICATE year inside a run (2023, 2024 twice, 2025): both steps that touch 2024 are reported, none compared", async () => {
    const x = await run([entry(2023, 100000), entry(2024, 100000), entry(2024, 120000), entry(2025, 130000)]);
    assert.strictEqual(x.capObs.length, 0);
    assert.strictEqual(x.notComparable.length, 1);
    assert.ok(/2023 to 2024/.test(x.notComparable[0].description) && /2024 to 2025/.test(x.notComparable[0].description));
  });

  await test("The same statement uploaded twice (same year, same total) counts once and is not an error", async () => {
    const x = await run([entry(2023, 100000), entry(2024, 110000), entry(2024, 110000)]);
    assert.strictEqual(x.capObs.length, 1);
    assert.strictEqual(x.notComparable.length, 0);
  });

  await test("A gap in a longer run: consecutive steps are still observed, the gap is reported", async () => {
    const x = await run([entry(2022, 100000), entry(2023, 110000), entry(2025, 200000)]);
    assert.strictEqual(x.capObs.length, 1);
    assert.ok(/2022/.test(x.capObs[0].description) && /2023/.test(x.capObs[0].description));
    assert.strictEqual(x.notComparable.length, 1);
    assert.ok(/2023 to 2025/.test(x.notComparable[0].description));
    assert.strictEqual(x.r.savings_estimate, x.r.estimated_overcharge);
  });

  // ── the primary-year / latest-pair rule is gone, and nothing replaces it with a guess ─────────────────────────
  await test("UNCERTAIN RELATIONSHIPS neither inflate the headline nor silently hide a finding", async () => {
    // (a) the statement labels its prior year AND a prior-year statement is uploaded: both observations are shown, $0 each
    const a = await run([entry(2023, 40000), entry(2024, 53444.13)], { prior: "40,000.00", primaryYear: 2024 });
    assert.strictEqual(a.capObs.length, 2, "single-statement and multi-year observations both visible (no guessed pair identity)");
    assert.strictEqual(a.r.savings_estimate, a.r.estimated_overcharge);
    // (b) missing primary year: the latest pair is NOT suppressed
    const b = await run([entry(2023, 40000), entry(2024, 53444.13)], { prior: "40,000.00" });
    assert.ok(b.capObs.some((f) => /2023/.test(f.description) && /2024/.test(f.description)), "the latest pair is still reported");
    assert.strictEqual(b.r.savings_estimate, b.r.estimated_overcharge);
    // (c) wrong primary year (matches no uploaded entry): still shown, still no amount
    const c = await run([entry(2023, 40000), entry(2024, 53444.13)], { prior: "40,000.00", primaryYear: 2019 });
    assert.ok(c.capObs.length >= 2 && c.r.savings_estimate === c.r.estimated_overcharge);
    // (d) same current year, DIFFERENT baseline: both baselines are visible as attributed values, nothing is added
    const d = await run([entry(2023, 45000), entry(2024, 53444.13)], { prior: "40,000.00", primaryYear: 2024 });
    const text = d.capObs.map((f) => f.description).join(" | ");
    assert.ok(/\$40,000/.test(text) && /\$45,000/.test(text), "both baselines named");
    assert.strictEqual(d.r.savings_estimate, d.r.estimated_overcharge);
    // (e) a legitimate latest-year finding the old fallback could suppress: three years, no primary year
    const e = await run([entry(2022, 40000), entry(2023, 50000), entry(2024, 60000)]);
    assert.strictEqual(e.capObs.length, 2, "both consecutive steps reported, including the latest");
    assert.ok(e.capObs.some((f) => /2023/.test(f.description) && /2024/.test(f.description)));
    assert.strictEqual(e.r.savings_estimate, e.r.estimated_overcharge);
  });

  // ── controllable scope: amount suppression, not just caveat wording ───────────────────────────────────────────
  await test("CONTROLLABLE scope: with or without the word, a total-change cap result carries NO amount (the cap is never widened to all charges)", async () => {
    for (const controllable of [true, false]) {
      const x = await run([entry(2023, 100000), entry(2024, 110000)], { controllable });
      assert.strictEqual(x.capObs.length, 1);
      const f = x.capObs[0];
      assert.ok(f.potential_savings === 0 && f.quantified === false, `controllable=${controllable}`);
      assert.ok(!CALCULATED_PROSE.test(f.description) && !/\$5,000|\$105,000/.test(f.description));
      assert.strictEqual(x.r.savings_estimate, x.r.estimated_overcharge, "the headline carries no cap amount either way");
      assert.ok(!/(applies to|covers) all/i.test(f.description));
      // single-statement path as well
      const single = await run(undefined, { prior: "40,000.00", controllable });
      const s = single.capObs[0];
      assert.ok(s && s.potential_savings === 0 && single.r.savings_estimate === single.r.estimated_overcharge, `single statement, controllable=${controllable}`);
      assert.ok(!CALCULATED_PROSE.test(s.description));
      // the caveat wording appears only when the lease says so
      assert.strictEqual(/controllable expenses/.test(f.description), controllable);
      assert.strictEqual(/controllable expenses/.test(s.description), controllable);
      if (controllable) assert.ok(/may include expenses the cap does not cover/.test(f.description + s.description));
    }
  });

  // ── gross-up ──────────────────────────────────────────────────────────────────────────────────────────────────
  await test("GROSS-UP: the signal is kept as a labelled heuristic; no amount, no 'review amount' sentence, severity and evidence preserved", () => {
    const g = triple.grossUp[0];
    assert.strictEqual(g.potential_savings, 0);
    assert.strictEqual(g.quantified, false);
    assert.ok(g.severity === "high" || g.severity === "medium");
    assert.ok(g.sourceEvidence && g.sourceEvidence.some((e) => /Gross-Up Language/.test(e.findingCategory ?? "")) && g.sourceEvidence.some((e) => /Controllable Category Jump/.test(e.findingCategory ?? "")));
    assert.strictEqual(findingKind(g), "clarify");
    assert.ok(Q.comparisonStatusOf(triple.r.leaseClausesSummary)?.unquantified.includes("gross-up"));
    // language alone (no jump data) stays the existing needs-data item and is not flagged as withheld
    const langOnly = triple.all.filter((f) => /Possible Gross-Up/.test(f.category));
    assert.ok(langOnly.every((f) => f.insufficientData === true && f.potential_savings === 0));
  });

  // ── historical and missing-flag records ───────────────────────────────────────────────────────────────────────
  await test("MISSING FLAG: absent `quantified` means 'no claim', not 'unquantified' and not 'certified'", () => {
    assert.strictEqual(Q.isUnquantified({}), false);
    assert.strictEqual(Q.isUnquantified({ quantified: true }), false);
    assert.strictEqual(Q.isUnquantified({ quantified: false }), true);
    assert.strictEqual(Q.countedAmount({ potential_savings: 700 }), 700);
    assert.strictEqual(Q.countedAmount({ potential_savings: 700, quantified: false }), 0);
    assert.strictEqual(Q.comparisonStatusOf(null), null);
    assert.strictEqual(Q.comparisonStatusOf({ comparisonStatus: "x" }), null);
    assert.strictEqual(Q.comparisonStatusOf({ comparisonStatus: { notCompared: [7], unquantified: ["x"] } }), null, "malformed is no record, never a claim");
    assert.strictEqual(Q.quantificationNotice(null), null);
  });

  // Audits stored BEFORE this change (old category names, amounts, no flag, no record) are handled at read time by
  // src/lib/legacy-containment.ts and covered in legacy-containment.test.ts. A missing record or flag is never treated
  // as evidence that an old result was valid.

  // ── nothing left the process ──────────────────────────────────────────────────────────────────────────────────
  await test("NETWORK: no outbound request was attempted by any step above", () => {
    assert.deepStrictEqual(blocked, []);
  });

  console.log(`\nmultiyear-cap: ${passed} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
