/**
 * Regression tests for the two defects found in the production smoke test (synthetic documents, October 2026):
 *
 *  1. The same statement line reached the audit under several labels (pattern reader + AI step), so a $90,000 roof line
 *     was priced twice, a $12,000 legal line three times, and the 15% admin fee line twice: $13,920 shown, $5,520 correct.
 *  2. "Estimated payments received during 2025 $12,000" was taken as the PRIOR-YEAR total, producing a false 23% increase
 *     and a $2,280 cap excess that the documents cannot support.
 *
 * Run: npx tsx src/services/__tests__/ledger.test.ts   (offline: no network, no API key)
 */
delete process.env.ANTHROPIC_API_KEY;

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { validateDocuments, computeConfidence } from "../document-validator";
import { runAudit } from "../audit-logic";
import { dedupeBySourceLine, supportedPriorYearTotal } from "../line-ledger";
import { lockedAmountNote } from "../../lib/locked-amount";
import { formatMoney } from "../../lib/format";

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
  for (let i = 0; i < lines.length; i += 60) {
    const page = pdf.addPage([612, 792]);
    lines.slice(i, i + 60).forEach((l, j) => page.drawText(l.replace(/[^\x20-\x7E]/g, "-"), { x: 40, y: 750 - j * 11.5, size: 9, font }));
  }
  return Buffer.from(await pdf.save());
}

const LEASE = `SYNTHETIC TEST LEASE - FICTIONAL
COMMERCIAL LEASE AGREEMENT
Landlord HARBORVIEW TEST PLAZA LLC and Tenant TEST TENANT LLC, approximately 3,000 rentable square feet in a building of
approximately 60,000 rentable square feet. Term five (5) years.
ARTICLE 6 - OPERATING EXPENSES AND CAM CHARGES
6.1 Tenant's pro-rata share of Operating Expenses is 5.00%.
6.2 Administrative fee not to exceed ten percent (10%) of Controllable Operating Expenses.
6.3 Controllable Operating Expenses shall not increase by more than four percent (4%) over the prior year.
6.4 Exclusions. The following are excluded from Operating Expenses and shall not be passed through to Tenant: (a) capital expenditures, including roof replacement; (b) Landlord's legal fees and costs of disputes with other tenants or lenders; (c) depreciation and amortization.
`;

const STATEMENT = `SYNTHETIC TEST CAM RECONCILIATION STATEMENT - FICTIONAL
Harborview Test Plaza - Calendar Year 2025 Operating Expense Reconciliation
Tenant share: 5.00% (3,000 / 60,000 RSF)

EXPENSE CATEGORY                                   BUILDING TOTAL
Janitorial                                              $60,000.00
Landscaping                                             $24,000.00
Security                                                $36,000.00
Common area utilities                                   $48,000.00
Roof replacement (capital project)                      $90,000.00
Legal fees - landlord dispute                           $12,000.00
Administrative fee (15% of controllable expenses)       $25,200.00
TOTAL OPERATING EXPENSES                               $295,200.00

Tenant pro-rata share (5.00%)                           $14,760.00
Estimated payments received during 2025                 $12,000.00
BALANCE DUE FROM TENANT                                  $2,760.00
`;

/** What production produced: the pattern reader's lines PLUS differently-labelled copies from the AI step. */
async function productionLikeValidation(statementText: string, extra?: { priorYearTotal?: string | null }) {
  const v = await validateDocuments(await textToPdf(LEASE), await textToPdf(statementText));
  const ai = [
    ["roof replacement (capital project)", "90,000"], ["capital improvement", "90,000"], ["capital improvement", "$90,000.00"],
    ["legal", "12,000"], ["legal fee", "12,000"], ["administrative fee", "25,200"],
  ];
  v.reconFields = {
    ...v.reconFields,
    totalCamCharges: "14,760.00",
    reconciliationTotal: "295,200.00",
    reconciliationYear: 2025,
    proRataShare: "5.00",
    adminFeePercentage: "15",
    priorYearTotal: extra && "priorYearTotal" in extra ? extra.priorYearTotal ?? null : "$12,000.00",
    lineItems: [...v.reconFields.lineItems, ...ai.map(([category, amount]) => ({ category, amount, rawLine: `${category}: $${amount}` }))],
    expenseCategories: [...new Set([...v.reconFields.expenseCategories, "capital improvement", "legal", "legal fee", "roof replacement (capital project)", "administrative fee"])],
  };
  // The lease terms the AI step returned in production for these documents.
  v.leaseFields = { ...v.leaseFields, camCapPercentage: "4", adminFeePercentage: "10", proRataShare: "5.00",
    excludedTerms: ["capital expenditure", "roof replacement", "depreciation", "amortization", "legal fee", "landlord's legal fees", "disputes with other tenants or lenders"] };
  return v;
}

(async () => {
  console.log("duplicate counting");

  await test("production reproduction: the same roof, legal and admin-fee lines are counted once each ($5,520, not $13,920)", async () => {
    const r = await runAudit(await productionLikeValidation(STATEMENT, { priorYearTotal: null }));
    const rows = r.overcharge_breakdown.map((o) => [o.total_expense, o.tenant_charge]);
    assert.deepStrictEqual(rows.sort(), [[12000, 600], [90000, 4500]].sort(), JSON.stringify(rows));
    assert.strictEqual(r.estimated_overcharge, 5100);
    const admin = [...r.free_findings, ...r.paid_findings].find((f) => f.category === "Admin Fee Above Lease Cap");
    assert.ok(admin, "admin fee finding present");
    assert.strictEqual(admin!.potential_savings, 420, "admin: 25,200 x (15-10)/15 x 5% = 420");
    assert.strictEqual(r.savings_estimate, 5520, "headline = 4,500 + 600 + 420");
  });

  await test("the headline reconciles to the listed contributions exactly", async () => {
    const r = await runAudit(await productionLikeValidation(STATEMENT, { priorYearTotal: null }));
    const listed = [...r.free_findings, ...r.paid_findings].filter((f) => !f.insufficientData).reduce((s, f) => s + f.potential_savings, 0);
    const ledger = r.overcharge_breakdown.reduce((s, o) => s + o.tenant_charge, 0);
    assert.strictEqual(Math.round((listed + ledger) * 100) / 100, r.savings_estimate);
  });

  await test("the admin-fee explanation shows billed fee, permitted fee and excess", async () => {
    const r = await runAudit(await productionLikeValidation(STATEMENT, { priorYearTotal: null }));
    const admin = r.paid_findings.concat(r.free_findings).find((f) => f.category === "Admin Fee Above Lease Cap")!;
    assert.ok(/\$25,200/.test(admin.description) && /\$16,800/.test(admin.description) && /\$8,400/.test(admin.description) && /\$420/.test(admin.description), admin.description);
  });

  await test("two genuinely separate lines with identical wording and amount are BOTH counted", async () => {
    const two = STATEMENT.replace("Legal fees - landlord dispute                           $12,000.00",
      "Legal fees - landlord dispute                           $12,000.00\nLegal fees - landlord dispute                           $12,000.00");
    const r = await runAudit(await productionLikeValidation(two, { priorYearTotal: null }));
    const legal = r.overcharge_breakdown.filter((o) => o.total_expense === 12000);
    assert.strictEqual(legal.length, 2, "two physical lines, two contributions");
    assert.strictEqual(r.estimated_overcharge, 4500 + 600 + 600);
  });

  await test("unit: an AI item whose amount is not in the statement is not counted", () => {
    const { kept, dropped } = dedupeBySourceLine(
      [{ category: "roof", amount: "90,000.00", rawLine: "" }, { category: "invented", amount: "77,777", rawLine: "invented: $77,777" }],
      "Roof replacement   $90,000.00",
    );
    assert.strictEqual(kept.length, 1);
    assert.strictEqual(dropped[0].why, "amount_not_in_statement");
  });

  console.log("prior-year baseline");

  await test("unit: 'estimated payments received during 2025' is not a baseline; a labelled prior-year total is", () => {
    assert.strictEqual(supportedPriorYearTotal("$12,000.00", "Estimated payments received during 2025   $12,000.00", 2025), null);
    assert.strictEqual(supportedPriorYearTotal("$12,000.00", "Prior year total   $12,000.00", 2025), "$12,000.00");
    assert.strictEqual(supportedPriorYearTotal("$12,000.00", "2024 Total Expenses   $12,000.00", 2025), "$12,000.00");
    assert.strictEqual(supportedPriorYearTotal("$12,000.00", "2025 Total   $12,000.00", 2025), null, "the current year is not prior");
    assert.strictEqual(supportedPriorYearTotal("$99,999.00", "Prior year total   $12,000.00", 2025), null, "a figure not in the text");
  });

  await test("production reproduction: the payment figure produces NO cap variance and no 23% claim", async () => {
    const r = await runAudit(await productionLikeValidation(STATEMENT)); // priorYearTotal = "$12,000.00" as the AI returned it
    const all = [...r.free_findings, ...r.paid_findings];
    assert.ok(!all.some((f) => /23\.0%|\$2,280|Year-over-Year/.test(f.description + f.category)), "no invented increase");
    const cap = all.filter((f) => /CAM Cap/i.test(f.category));
    assert.ok(cap.every((f) => f.potential_savings === 0), "no cap dollars");
    assert.strictEqual(r.savings_estimate, 5520, "headline holds no cap amount");
  });

  await test("a genuinely labelled prior-year total still produces the cap comparison", async () => {
    const withPrior = STATEMENT.replace("Estimated payments received during 2025                 $12,000.00",
      "Prior year total (2024)                                 $12,000.00");
    const r = await runAudit(await productionLikeValidation(withPrior));
    const cap = [...r.free_findings, ...r.paid_findings].find((f) => /CAM Cap/i.test(f.category) && f.potential_savings > 0);
    assert.ok(cap, "cap finding present when the baseline is real");
    assert.strictEqual(cap!.potential_savings, 2280, "14,760 - 12,000 x 1.04 = 2,280");
  });

  console.log("competing claims and reconciliation");

  await test("unit: competing labels for one line count once, and an equal amount on an unrelated payment row is not a second charge", () => {
    const text = "Legal fees - landlord dispute    $12,000.00\nEstimated payments received during 2025    $12,000.00";
    const { kept, dropped } = dedupeBySourceLine(
      [
        { category: "legal fees - landlord dispute", amount: "12,000.00", rawLine: "Legal fees - landlord dispute $12,000.00" },
        { category: "legal", amount: "12,000", rawLine: "legal: $12,000" },
        { category: "legal fee", amount: "12,000", rawLine: "legal fee: $12,000" },
      ],
      text,
    );
    assert.deepStrictEqual(kept.map((i) => i.category), ["legal fees - landlord dispute"]);
    assert.strictEqual(dropped.length, 2);
  });

  // Visible = the breakdown rows plus findings shown before purchase. Locked = findings withheld until purchase.
  // The headline (savings_estimate) is visible + locked; the locked part is NOT part of the visible breakdown.
  const split = (r: Awaited<ReturnType<typeof runAudit>>) => {
    const visibleBreakdown = r.overcharge_breakdown.reduce((s, o) => s + o.tenant_charge, 0);
    const visibleFindings = r.free_findings.filter((f) => !f.insufficientData).reduce((s, f) => s + f.potential_savings, 0);
    const locked = r.paid_findings.filter((f) => !f.insufficientData).reduce((s, f) => s + f.potential_savings, 0);
    return { visible: Math.round((visibleBreakdown + visibleFindings) * 100) / 100, locked: Math.round(locked * 100) / 100 };
  };

  await test("fixture 1 (lease read in full, admin cap extracted): visible $5,100 + locked $420 = headline $5,520", async () => {
    const r = await runAudit(await productionLikeValidation(STATEMENT, { priorYearTotal: null }));
    assert.deepStrictEqual(split(r), { visible: 5100, locked: 420 });
    assert.strictEqual(r.savings_estimate, 5520);
  });

  await test("fixture 2 (admin cap not detected, as for a lease read only in part): headline $5,100 = visible breakdown, nothing locked", async () => {
    const v = await productionLikeValidation(STATEMENT, { priorYearTotal: null });
    v.leaseFields = { ...v.leaseFields, adminFeePercentage: null, managementFee: null };
    const r = await runAudit(v);
    assert.deepStrictEqual(split(r), { visible: 5100, locked: 0 });
    assert.strictEqual(r.savings_estimate, 5100);
    const admin = [...r.free_findings, ...r.paid_findings].find((f) => /^Admin Fee/.test(f.category));
    assert.ok(!admin || admin.potential_savings === 0, "no admin dollars without a detected cap");
  });

  console.log("locked-amount wording");

  await test("the locked amount is stated as already included, equals headline minus visible, and never as additional", async () => {
    const r = await runAudit(await productionLikeValidation(STATEMENT, { priorYearTotal: null }));
    const { visible, locked } = split(r);
    const note = lockedAmountNote(formatMoney(locked));
    assert.ok(/already included in the total shown/i.test(note) && note.includes("$420"), note);
    assert.ok(!/additional|on top|plus|up to/i.test(note), "must not read as an amount beyond the total");
    assert.strictEqual(r.savings_estimate - visible, locked, "the locked amount is exactly what the visible items leave out of the headline");
  });

  await test("the page and the PDF use that sentence, and the old 'in additional potential billing' wording is gone", () => {
    for (const f of ["../../components/audit-results-paid.tsx", "../report-pdf.ts"]) {
      const src = fs.readFileSync(path.join(__dirname, f), "utf8");
      assert.ok(src.includes("lockedAmountNote("), f + " must use lockedAmountNote");
      assert.ok(!/in additional potential billing/i.test(src), f + " still has the old wording");
    }
  });

  console.log("confidence");

  // Identical documents and fields; only the prior-year figure differs. A figure the statement does not label as a
  // prior-year total (here: the payments row) must add nothing; a labelled one adds its 4 points.
  const confBoth = async (priorYearTotal: string, statement: string) => {
    const v = await validateDocuments(await textToPdf(LEASE), await textToPdf(statement)); // one extraction, two scorings
    const score = (prior: string | null) =>
      computeConfidence(v.leaseClassification, v.reconClassification, v.leaseFields, { ...v.reconFields, priorYearTotal: prior, reconciliationYear: 2025 }, statement).score;
    return { withFigure: score(priorYearTotal), withoutFigure: score(null) };
  };

  await test("a rejected prior-year figure (payments row) does not raise confidence", async () => {
    const c = await confBoth("$12,000.00", STATEMENT);
    assert.strictEqual(c.withFigure, c.withoutFigure);
  });

  await test("a labelled prior-year total still adds its confidence points (4)", async () => {
    const labelled = STATEMENT.replace("Estimated payments received during 2025                 $12,000.00",
      "Prior year total (2024)                                 $12,000.00");
    const c = await confBoth("$12,000.00", labelled);
    assert.strictEqual(c.withFigure - c.withoutFigure, 4);
  });

  console.log(`
ledger: ${passed} passed, 0 failed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
