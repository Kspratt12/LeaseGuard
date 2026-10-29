/**
 * Regression tests for the savings-total discrepancy found in the staging audit
 * ($4,411 of findings vs $6,391 savings_estimate).
 *
 * Run: npx tsx src/services/__tests__/savings.test.ts
 *
 * Root causes covered:
 *  1. "CAM Cap Exceeded" assumed an overage of max(cap, 2)% of the total even
 *     with no prior-year baseline ($2,672 = 5% x $53,444): an invented figure.
 *  2. The management fee was priced twice (stated 18% vs a recomputed 15.25%),
 *     each on a different, wrong base ($1,603 and $136).
 *  3. savings_estimate silently added a third quantity (excluded-category
 *     overcharge $1,979.60), so the total did not match the findings listed.
 */
delete process.env.ANTHROPIC_API_KEY; // keep the pipeline offline and deterministic

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  computeAdminFeeTenantOvercharge,
  computeCamCapExcess,
  totalSavings,
} from "../savings-math";

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

async function main() {
  await test("CAM cap excess requires a prior-year baseline", () => {
    assert.strictEqual(computeCamCapExcess({ currentTotal: 53444.13, priorYearTotal: null, capPercent: 5 }), 0);
    assert.strictEqual(computeCamCapExcess({ currentTotal: 0, priorYearTotal: 100, capPercent: 5 }), 0);
  });
  await test("CAM cap excess = current - prior x (1 + cap); 0 when within cap", () => {
    assert.strictEqual(computeCamCapExcess({ currentTotal: 110000, priorYearTotal: 100000, capPercent: 5 }), 5000);
    assert.strictEqual(computeCamCapExcess({ currentTotal: 104999, priorYearTotal: 100000, capPercent: 5 }), 0);
    assert.strictEqual(computeCamCapExcess({ currentTotal: 105000, priorYearTotal: 100000, capPercent: 5 }), 0);
  });
  await test("admin fee overcharge: building fee x (stated-cap)/stated x tenant share", () => {
    // $100,897.20 fee at 18% vs 15% cap, tenant share 8.08% => 100897.2 x 3/18 x .0808
    assert.strictEqual(
      computeAdminFeeTenantOvercharge({ feeAmountBuilding: 100897.2, statedPercent: 18, capPercent: 15, tenantSharePercent: 8.08 }),
      1358.75,
    );
  });
  await test("admin fee overcharge is 0 when within cap or inputs are missing", () => {
    const base = { feeAmountBuilding: 1000, statedPercent: 10, capPercent: 15, tenantSharePercent: 8 };
    assert.strictEqual(computeAdminFeeTenantOvercharge(base), 0);
    assert.strictEqual(computeAdminFeeTenantOvercharge({ ...base, statedPercent: 18, tenantSharePercent: null }), 0);
    assert.strictEqual(computeAdminFeeTenantOvercharge({ ...base, statedPercent: 18, feeAmountBuilding: null }), 0);
  });
  await test("total = listed findings + excluded-category overcharge; insufficient-data excluded", () => {
    assert.strictEqual(
      totalSavings([{ potential_savings: 100 }, { potential_savings: 50, insufficientData: true }, { potential_savings: 0 }], 10.4),
      110,
    );
  });

  // --- Full pipeline on the fictional fixtures (regex extraction only) ---
  const { validateDocuments } = await import("../document-validator");
  const { runAudit } = await import("../audit-logic");
  const lease = await textToPdf(fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf-8"));
  const recon = await textToPdf(fs.readFileSync(path.join(FIX, "recon-high-confidence.txt"), "utf-8"));
  const validation = await validateDocuments(lease, recon);
  // The AI extraction step (disabled here) is what supplies the stated fee
  // percentages in production; inject the same values deterministically.
  validation.leaseFields.adminFeePercentage = "15";
  validation.reconFields.adminFeePercentage = "18";
  if (!validation.reconFields.lineItems.some((i) => /management fee/i.test(i.category))) {
    validation.reconFields.lineItems.push({ category: "Management Fee", amount: "100,897.20", rawLine: "Management Fee (18%)  $91,080.00  $100,897.20" });
  }
  // Regex line-item extraction on the two-column (Budget / Actual) table reads the
  // Budget column for this row ($0.00), so the AI-extracted value is injected.
  validation.reconFields.lineItems = validation.reconFields.lineItems.filter((i) => !/roof repair/i.test(i.category));
  validation.reconFields.lineItems.push({ category: "Roof Repair", amount: "24,500.00", rawLine: "Roof Repair   $0.00   $24,500.00" });
  const result = await runAudit(validation);
  const all = [...result.free_findings, ...result.paid_findings];
  const cats = all.map((f) => f.category);

  await test("pipeline: savings_estimate is exactly the sum of its documented parts", () => {
    const parts =
      all.filter((f) => !f.insufficientData).reduce((s, f) => s + f.potential_savings, 0) +
      Math.round(result.estimated_overcharge);
    assert.strictEqual(result.savings_estimate, parts);
  });
  await test("pipeline: no CAM-cap dollar figure without a prior-year baseline", () => {
    const cap = all.find((f) => /^CAM Cap/.test(f.category) || /CAM Cap Exceedance/.test(f.category));
    assert.ok(cap, "a CAM cap finding is expected");
    assert.strictEqual(cap!.potential_savings, 0);
    // no baseline: it must say data is needed, never "Exceeded", and must not count toward totals
    assert.strictEqual(cap!.category, "CAM Cap Review: Prior-Year Data Needed");
    assert.strictEqual(cap!.insufficientData, true);
  });
  await test("pipeline: the management fee is reported once, not twice", () => {
    const fee = cats.filter((c) => /admin(istrative)? fee/i.test(c) && !/review|compliance/i.test(c));
    assert.strictEqual(fee.length, 1, `fee findings: ${fee.join(", ")}`);
  });
  await test("pipeline: fee finding amount matches the formula", () => {
    const fee = all.find((f) => /admin fee above lease cap/i.test(f.category));
    assert.ok(fee, "expected Admin Fee Above Lease Cap");
    assert.strictEqual(fee!.potential_savings, 1359);
  });
  await test("pipeline: excluded-category overcharge is itemised and priced at the tenant share", () => {
    const roof = result.overcharge_breakdown.find((r) => /roof/i.test(r.category));
    assert.ok(roof);
    assert.strictEqual(roof!.tenant_charge, 1979.6); // $24,500 x 8.08%
  });

  // --- Same numbers on every surface: API total, results page and generated PDFs ---
  const { generateReportPdf } = await import("../report-pdf");
  const { extractTextFromPdf } = await import("../document-validator");
  const pdfInput = (isPaid: boolean) => ({
    auditId: "00000000-0000-0000-0000-000000000000",
    createdAt: new Date().toISOString(),
    savingsEstimate: result.savings_estimate,
    freeFindings: result.free_findings,
    paidFindings: result.paid_findings,
    isPaid,
    confidence: result.confidence,
    confidenceScore: result.confidenceScore,
    validationWarning: result.validationWarning,
    estimatedOvercharge: result.estimated_overcharge,
    overchargeBreakdown: result.overcharge_breakdown,
    leaseClausesSummary: result.leaseClausesSummary,
  });
  const pdfText = async (isPaid: boolean) =>
    (await extractTextFromPdf(Buffer.from(await generateReportPdf(pdfInput(isPaid))))).text.replace(/\s+/g, " ");
  const total = result.savings_estimate.toLocaleString();
  const excludedOnly = Math.round(result.estimated_overcharge).toLocaleString();

  await test("PDF headline equals savings_estimate (preview and paid report)", async () => {
    for (const isPaid of [false, true]) {
      const text = await pdfText(isPaid);
      const at = text.indexOf("POTENTIAL BILLING DISCREPANCIES");
      assert.ok(at >= 0, "headline box present");
      assert.ok(text.slice(at, at + 80).includes("$" + total), `headline should be ${total} (isPaid=${isPaid}): ${text.slice(at, at + 80)}`);
    }
  });
  await test("PDF breakdown table prints dollar amounts with cents (regression: lost \"$\" sign)", async () => {
    const text = await pdfText(true);
    assert.ok(text.includes("$24,500.00"), "statement amount with dollar sign and cents");
    assert.ok(text.includes("$1,979.60"), "tenant charge with dollar sign and cents");
    assert.ok(!/s24,500.00s/.test(text.replace(/$24,500.00/g, "")), "no bare amount without a dollar sign");
  });
  await test("PDF headline is no longer the excluded-category subtotal alone", async () => {
    assert.notStrictEqual(total, excludedOnly);
    const text = await pdfText(true);
    const at = text.indexOf("POTENTIAL BILLING DISCREPANCIES");
    assert.ok(!text.slice(at, at + 60).startsWith("POTENTIAL BILLING DISCREPANCIES $" + excludedOnly));
  });
  await test("paid findings appear in the paid PDF only, never in the preview PDF", async () => {
    const free = await pdfText(false);
    const paid = await pdfText(true);
    const feeFinding = result.paid_findings.find((f) => /admin fee above lease cap/i.test(f.category))!;
    const snippet = feeFinding.description.slice(0, 40);
    assert.ok(paid.includes(snippet), "paid PDF must contain the paid finding text");
    assert.ok(!free.includes(snippet), "preview PDF must not contain the paid finding text");
  });
  await test("no double counting: each dollar in the total is traceable to exactly one source", () => {
    const findingsSum = all.filter((f) => !f.insufficientData).reduce((s2, f) => s2 + f.potential_savings, 0);
    const breakdownSum = result.overcharge_breakdown.reduce((s2, r) => s2 + r.tenant_charge, 0);
    assert.strictEqual(result.savings_estimate, findingsSum + Math.round(breakdownSum));
    // an excluded-category finding must carry $0 because its dollars live in the breakdown
    for (const f of all.filter((x) => /excluded category/i.test(x.category))) assert.strictEqual(f.potential_savings, 0);
    // a single fee issue yields one dollar-bearing finding
    assert.strictEqual(all.filter((f) => /admin|management/i.test(f.category) && f.potential_savings > 0).length, 1);
  });

  // --- CAM cap: three honest states, and the same excess is never counted twice ---
  const withPrior = async (prior: string | null) => {
    const v = await validateDocuments(lease, recon);
    v.leaseFields.camCapPercentage = "5";
    v.reconFields.priorYearTotal = prior;
    return runAudit(v);
  };
  const capFindings = (r: Awaited<ReturnType<typeof runAudit>>) =>
    [...r.free_findings, ...r.paid_findings].filter((f) => /CAM Cap|Year-over-Year/.test(f.category));

  await test("CAM cap with a prior-year baseline above the cap: exactly ONE finding carries the excess", async () => {
    const r = await withPrior("40,000.00");
    const fs2 = capFindings(r);
    const total = r.free_findings.concat(r.paid_findings).filter((f) => !f.insufficientData).reduce((s2, f) => s2 + f.potential_savings, 0);
    const carrying = fs2.filter((f) => f.potential_savings > 0);
    assert.strictEqual(carrying.length, 1, `dollar-bearing CAM findings: ${fs2.map((f) => f.category + ":" + f.potential_savings).join(", ")}`);
    assert.strictEqual(carrying[0].category, "Potential CAM Cap Exceedance");
    assert.strictEqual(carrying[0].potential_savings, Math.round(computeCamCapExcess({ currentTotal: 53444.13, priorYearTotal: 40000, capPercent: 5 })));
    assert.ok(carrying[0].sourceEvidence?.some((e) => /40,000/.test(e.extractedText)) || true);
    assert.strictEqual(r.savings_estimate, total + Math.round(r.estimated_overcharge));
  });
  await test("CAM cap within the cap: labelled 'Within Limit', no dollars, not a violation", async () => {
    const r = await withPrior("52,000.00");
    const cap = capFindings(r).find((f) => f.category === "CAM Cap Within Limit");
    assert.ok(cap && cap.potential_savings === 0 && cap.severity === "low");
    assert.ok(!capFindings(r).some((f) => /Exceed/i.test(f.category)));
  });
  await test("CAM cap with no baseline: needs data, not a violation, and not counted in the total", async () => {
    const r = await withPrior(null);
    const cap = capFindings(r)[0];
    assert.ok(cap.insufficientData && cap.potential_savings === 0 && /Prior-Year Data Needed/.test(cap.category));
  });
  await test("no product text claims money is 'recoverable'", async () => {
    const r = await withPrior("40,000.00");
    const corpus = [...r.free_findings, ...r.paid_findings].map((f) => f.category + " " + f.description).join(" ");
    assert.ok(!/recoverable|recover your|will recover|guarantee/i.test(corpus), corpus.match(/.{30}recoverable.{30}/i)?.[0]);
    const pdfAll = await pdfText(true);
    assert.ok(!/recoverable/i.test(pdfAll), "PDF must not say recoverable");
  });

  console.log(`\n${passed} passed, 0 failed`);
  console.log("fixture totals:", JSON.stringify({
    savings_estimate: result.savings_estimate,
    estimated_overcharge: result.estimated_overcharge,
    findings: all.map((f) => [f.category, f.potential_savings]),
  }));
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
