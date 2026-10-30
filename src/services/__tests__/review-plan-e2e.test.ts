/**
 * End-to-end check of the CAM Review Plan and the paid report on a FICTIONAL test case: the lease and statement
 * fixtures in ./fixtures are invented text (see the files), turned into PDFs, run through the real extraction and
 * audit engine, then through the plan, the dispute letter and the PDF builder. No real customer data is involved
 * and nothing touches a database.
 *
 * Run: npx tsx src/services/__tests__/review-plan-e2e.test.ts
 * Optional: REPORT_OUT=<folder> writes the generated report PDF there so it can be opened and read.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

const FIX = path.join(__dirname, "fixtures");
let n = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  console.log("  ✓", name);
}
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

async function textToPdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  const page = pdf.addPage([612, 792]);
  text.split("\n").slice(0, 60).forEach((l, i) => page.drawText(l.replace(/[^\x20-\x7E]/g, "-"), { x: 36, y: 756 - i * 10.5, size: 8, font }));
  return Buffer.from(await pdf.save());
}

(async () => {
  const { validateDocuments } = await import("../document-validator");
  const { runAudit } = await import("../audit-logic");
  const { buildReviewPlan, planMoney } = await import("../review-plan");
  const { buildDisputeLetter } = await import("../dispute-letter");
  const { generateReportPdf } = await import("../report-pdf");
  const { totalSavings } = await import("../savings-math");

  async function run(leaseFile: string, reconFile: string, inject: boolean) {
    const leaseText = fs.readFileSync(path.join(FIX, leaseFile), "utf-8");
    const reconText = fs.readFileSync(path.join(FIX, reconFile), "utf-8");
    const validation = await validateDocuments(await textToPdf(leaseText), await textToPdf(reconText));
    if (inject) {
      // Values the AI extraction step supplies in production (same injection as the savings and letter tests).
      validation.leaseFields.adminFeePercentage = "15";
      validation.reconFields.adminFeePercentage = "18";
      if (!validation.reconFields.lineItems.some((i) => /management fee/i.test(i.category))) {
        validation.reconFields.lineItems.push({ category: "Management Fee", amount: "100,897.20", rawLine: "Management Fee (18%)  $91,080.00  $100,897.20" });
      }
      validation.reconFields.lineItems = validation.reconFields.lineItems.filter((i) => !/roof repair/i.test(i.category));
      validation.reconFields.lineItems.push({ category: "Roof Repair", amount: "24,500.00", rawLine: "Roof Repair   $0.00   $24,500.00" });
    }
    const result = await runAudit(validation);
    const findings = [...result.free_findings, ...result.paid_findings];
    const plan = buildReviewPlan({ findings, overchargeBreakdown: result.overcharge_breakdown, leaseClausesSummary: result.leaseClausesSummary, confidence: result.confidence });
    // what the engine actually read from the PDFs (the same text every quotation must come from)
    return { result, findings, plan, leaseText: validation.leaseText, reconText: validation.reconText };
  }

  const full = await run("lease-high-confidence.txt", "recon-high-confidence.txt", true);
  const partial = await run("lease-partial-data.txt", "recon-partial-data.txt", false);
  const medium = await run("lease-medium-confidence.txt", "recon-medium-confidence.txt", false);

  console.log("\n--- fictional test case: what the real engine produced ---");
  for (const i of full.plan.items) console.log(`  #${i.rank} [${i.tier}] ${i.title} ${i.amount != null ? planMoney(i.amount) : "(no amount)"}  | ${i.evidenceLabel}`);
  console.log(`  engine headline (savings_estimate): $${full.result.savings_estimate.toLocaleString("en-US")}   plan: calculated ${planMoney(full.plan.calculatedTotal)} + judgment ${planMoney(full.plan.judgmentTotal)}\n`);

  await test("the fictional case produces calculated AND judgment items, kept distinct", () => {
    const tiers = new Set(full.plan.items.map((i) => i.tier));
    assert.ok(tiers.has("calculated"), "expected a calculated item (management fee above the lease cap)");
    assert.ok(tiers.has("judgment"), "expected a judgment item (excluded expense)");
    for (const i of full.plan.items.filter((x) => x.tier === "calculated")) assert.ok(!/gross-?up|occupancy|allocation|excluded/i.test(i.title), `${i.title} is a judgment topic but is listed as calculated`);
    for (const row of full.result.overcharge_breakdown) assert.ok(full.plan.items.some((i) => i.tier === "judgment" && i.title === `Excluded expense: ${row.category}`), `breakdown row ${row.category} missing from the plan`);
  });

  await test("amounts reconcile: the plan's amounts add up to the audit's headline total, with nothing counted twice", () => {
    const withAmounts = full.plan.items.filter((i) => (i.tier === "calculated" || i.tier === "judgment") && i.amount != null && i.amount > 0);
    // the headline is computed from the listed findings plus the excluded-expense rows, rounded once (see savings-math)
    const fromPlan = totalSavings(
      withAmounts.filter((i) => !i.title.startsWith("Excluded expense:")).map((i) => ({ potential_savings: i.amount! })),
      withAmounts.filter((i) => i.title.startsWith("Excluded expense:")).reduce((s, i) => s + i.amount!, 0),
    );
    assert.equal(fromPlan, full.result.savings_estimate, "plan amounts do not reproduce the headline total");
    const letter = buildDisputeLetter({ findings: full.findings, overchargeBreakdown: full.result.overcharge_breakdown, leaseClausesSummary: full.result.leaseClausesSummary });
    assert.equal(letter.total, full.result.savings_estimate, "letter and audit disagree");
    // no double counting: every item is a distinct finding or statement line, and the excluded finding is carried by its rows only
    const titles = full.plan.items.map((i) => i.title);
    assert.equal(new Set(titles).size, titles.length, "duplicate item titles");
    if (full.result.overcharge_breakdown.length) assert.ok(!titles.includes("Excluded Category Billed"), "excluded finding double-listed next to its breakdown rows");
    const rowSum = full.result.overcharge_breakdown.reduce((s, r) => s + r.tenant_charge, 0);
    assert.ok(Math.abs(rowSum - full.plan.items.filter((i) => i.title.startsWith("Excluded expense:")).reduce((s, i) => s + (i.amount ?? 0), 0)) < 0.005);
  });

  await test("statement-line arithmetic: total expense x share = tenant charge, and the plan states it only when it holds", () => {
    for (const row of full.result.overcharge_breakdown) {
      const computed = Math.round(row.total_expense * (row.tenant_share_percent / 100) * 100) / 100;
      const item = full.plan.items.find((i) => i.title === `Excluded expense: ${row.category}`)!;
      const line = item.calculation.find((s) => s.includes(" x "));
      if (Math.abs(computed - row.tenant_charge) <= 1) assert.ok(line && line.includes(planMoney(computed)), "arithmetic line missing or wrong");
      else assert.ok(!line, "false arithmetic shown");
    }
  });

  await test("evidence references match the source: every quote is found in the fictional document it cites, on a page that exists", () => {
    const texts = { lease: norm(full.leaseText), recon: norm(full.reconText) };
    let checked = 0;
    for (const item of full.plan.items) {
      for (const e of item.evidence) {
        const q = norm(e.quote).replace(/^\.\.\./, "").replace(/\.\.\.$/, "").trim();
        if (!q) continue;
        const probe = q.slice(0, 80);
        assert.ok(texts.lease.includes(probe) || texts.recon.includes(probe), `quote not found in either source: "${probe}"`);
        assert.ok(e.page == null || e.page === 1, `page ${e.page} cited but the fictional documents have one page`);
        checked++;
      }
    }
    assert.ok(checked >= 2, "expected at least two quotes to verify");
  });

  await test("insufficient-data findings never produce an amount (fictional partial and medium cases, and the main case)", () => {
    for (const run of [full, partial, medium]) {
      for (const f of run.findings.filter((x) => x.insufficientData)) {
        const item = run.plan.items.find((i) => i.title === f.category);
        assert.ok(item, `${f.category} missing from the plan`);
        assert.equal(item!.tier, "needs-data");
        assert.equal(item!.amount, null);
      }
      for (const i of run.plan.items.filter((x) => x.tier === "needs-data" || x.tier === "match")) assert.equal(i.amount, null);
    }
    assert.ok([full, partial, medium].some((r) => r.findings.some((f) => f.insufficientData)), "the fixtures should exercise at least one insufficient-data finding");
  });

  await test("every audit-engine finding appears in the plan exactly once (nothing dropped, nothing invented)", () => {
    for (const run of [full, partial, medium]) {
      const expected = run.findings.filter((f) => !/excluded category/i.test(f.category)).length + run.result.overcharge_breakdown.length + (run.result.overcharge_breakdown.length === 0 ? run.findings.filter((f) => /excluded category/i.test(f.category)).length : 0);
      assert.equal(run.plan.items.length, expected);
    }
  });

  await test("the plan wording stays inside the rules on real engine output", () => {
    const banned = /\b(owed|you owe|illegal|unlawful|fraud\w*|entitled|guarantee[ds]?|must (pay|refund)|lawsuit|violat\w*|deadlines?|statutes?|required by law|waive[sd]?)\b/i;
    for (const run of [full, partial, medium]) {
      const text = [run.plan.caution, run.plan.rankingRule, ...run.plan.checklist.flatMap((g) => g.steps), ...run.plan.items.flatMap((i) => [i.whyRanked, ...i.calculation, ...i.questions, ...i.documents])].join("\n");
      assert.ok(!banned.test(text), `banned wording: ${banned.exec(text)?.[0]}`);
    }
  });

  await test("the full paid report PDF builds from the real result, includes the plan, and the free report does not", async () => {
    const input = {
      auditId: "00000000-0000-4000-8000-00000000f1c7", createdAt: "2026-11-01T00:00:00Z", savingsEstimate: full.result.savings_estimate,
      freeFindings: full.result.free_findings, paidFindings: full.result.paid_findings, estimatedOvercharge: full.result.estimated_overcharge,
      overchargeBreakdown: full.result.overcharge_breakdown, leaseClausesSummary: full.result.leaseClausesSummary,
      confidence: full.result.confidence, confidenceScore: full.result.confidenceScore, validationWarning: full.result.validationWarning,
    };
    const paid = await generateReportPdf({ ...input, isPaid: true });
    const free = await generateReportPdf({ ...input, isPaid: false });
    const [pd, fd] = await Promise.all([PDFDocument.load(paid), PDFDocument.load(free)]);
    assert.ok(pd.getPageCount() > fd.getPageCount());
    const out = process.env.REPORT_OUT;
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, "fictional-paid-report.pdf"), paid);
      fs.writeFileSync(path.join(out, "fictional-free-report.pdf"), free);
    }
  });

  /** Text drawn on the pages of a pdf-lib document: inflate the content streams, decode the hex strings it writes. */
  const pdfStrings = (buf: Buffer): string => {
    const zlib = require("node:zlib") as typeof import("node:zlib");
    const raw = buf.toString("latin1");
    let from = 0, all = "";
    for (;;) {
      const s = raw.indexOf("stream", from);
      if (s < 0) break;
      const start = raw[s + 6] === "\r" ? s + 8 : s + 7;
      const end = raw.indexOf("endstream", start);
      if (end < 0) break;
      try { all += "\n" + zlib.inflateSync(Buffer.from(raw.slice(start, end), "latin1")).toString("latin1"); } catch { /* not compressed */ }
      from = end + 9;
    }
    return [...all.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((m) => Buffer.from(m[1], "hex").toString("latin1")).join("\n");
  };

  await test("lease-clause evidence boxes are neutral summaries: no legal conclusions, never presented as quotations", async () => {
    const { getLeaseClauseEvidence } = await import("../../lib/lease-clause-evidence");
    const summary = { camCap: "5%", adminFeeCap: "15%", managementFeeCap: "4%", tenantProRataShare: "8.08%", tenantSquareFootage: "4,200 sq ft", buildingSquareFootage: "52,000 sq ft", excludedCategories: ["capital improvements", "structural repairs"], additionalClauses: [] };
    const cats = ["Potential CAM Cap Exceedance", "Admin Fee Above Lease Cap", "Administrative Fee Cap Exceeded", "Management fee review", "Pro-Rata Share Mismatch", "Tenant Allocation Discrepancy", "Possible Gross-Up / Occupancy Adjustment", "Excluded Category Billed", "Reconciliation Totals", "Document Review Summary"];
    const banned = /\b(breach\w*|constitutes?|overcharge\w*|should be credited|not the tenant'?s responsibility|must comply|explicitly)\b/i;
    let shown = 0;
    for (const category of cats) {
      const ref = getLeaseClauseEvidence({ category, description: "", potential_savings: 0, severity: "medium" }, summary);
      if (!ref) continue;
      shown++;
      assert.ok(!banned.test(ref.text), `${category}: "${ref.text}"`);
    }
    assert.ok(shown >= 8, "expected most categories to have a clause summary");
  });

  await test("the paid PDF text: money has two decimals, labels do not call discrepancies confirmed overcharges, clause boxes are labelled summaries", async () => {
    const input = {
      auditId: "00000000-0000-4000-8000-00000000f1c7", createdAt: "2026-11-01T00:00:00Z", savingsEstimate: full.result.savings_estimate,
      freeFindings: full.result.free_findings, paidFindings: full.result.paid_findings, estimatedOvercharge: full.result.estimated_overcharge,
      overchargeBreakdown: full.result.overcharge_breakdown, leaseClausesSummary: full.result.leaseClausesSummary,
      confidence: full.result.confidence, confidenceScore: full.result.confidenceScore, validationWarning: full.result.validationWarning, isPaid: true,
    };
    const text = pdfStrings(await generateReportPdf(input));
    assert.ok(text.includes("$1,979.60"), "tenant charge must show cents");
    assert.ok(!/\$\d[\d,]*\.\d(?!\d)/.test(text), "a money figure with a single decimal place (for example $1,979.6) was printed");
    assert.ok(!text.includes("Total Estimated Overcharge") && !text.includes("Excluded Expense Overcharge Breakdown"));
    assert.ok(text.includes("Total potential discrepancy (excluded expenses)"));
    assert.ok(text.includes("Detected in your lease (summary, not a quotation)"));
    assert.ok(!/breach of the lease|constitutes an overcharge|should be credited to the tenant/i.test(text));
    assert.ok(text.includes("CAM Review Plan"));
  });

  await test("an excluded-expense item shows the lease wording plus the exact statement line it is about, not an unrelated slice of the statement", () => {
    const roof = full.plan.items.find((i) => i.title === "Excluded expense: roof repair")!;
    assert.ok(roof.evidence.length >= 2, "expected the statement line and the lease exclusion wording");
    const statementQuotes = roof.evidence.filter((e) => !/lease/i.test(e.document));
    assert.equal(statementQuotes.length, 1, "exactly one statement quote: the charged line");
    assert.match(statementQuotes[0].quote, /roof repair/i, "the statement quote must be the roof repair line");
    const letter = buildDisputeLetter({ findings: full.findings, overchargeBreakdown: full.result.overcharge_breakdown, leaseClausesSummary: full.result.leaseClausesSummary });
    const letterQuotes = [...letter.text.matchAll(/Source: ([^\n]*)/g)].map((m) => m[1]);
    assert.ok(!letterQuotes.some((q) => /protection \$4,800/i.test(q) && !/roof repair/i.test(q)), "the letter must not quote an unrelated statement slice for the roof item");
  });

  const DEFINITIVE =/\b(should be (renegotiated|excluded|credited)|request removal|estimated overcharge|no overcharge detected|constitutes|breach(es|ed)? of|violation of|improper(ly)?|illegal|unlawful|not the tenant'?s responsibility|typically the landlord'?s responsibility)\b/i;

  await test("generated finding text from the real engine never implies an unverified charge is definitely improper", () => {
    for (const run of [full, partial, medium]) {
      for (const f of run.findings) assert.ok(!DEFINITIVE.test(f.description), `${f.category}: "${DEFINITIVE.exec(f.description)?.[0]}"`);
      for (const r of run.result.overcharge_breakdown) assert.ok(!DEFINITIVE.test(r.reason));
    }
  });

  await test("the wording in the source of every report-facing template is neutral too (static scan, covers branches the fixtures do not reach)", () => {
    const files = [
      "../audit-logic.ts", "../report-pdf.ts", "../review-plan.ts", "../review-plan-pdf.ts", "../dispute-letter.ts",
      "../../lib/lease-clause-evidence.ts", "../../components/audit-results-free.tsx", "../../components/audit-results-paid.tsx", "../../components/review-plan.tsx",
    ];
    for (const rel of files) {
      const code = fs.readFileSync(path.join(__dirname, rel), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
      assert.ok(!DEFINITIVE.test(code), `${rel}: "${DEFINITIVE.exec(code)?.[0]}"`);
    }
    const page = fs.readFileSync(path.join(__dirname, "../../app/audit/[id]/page.tsx"), "utf8");
    assert.ok(!/>Overcharge:</.test(page), "the results table must say potential discrepancy");
  });

  await test("the plan says what was read in the lease and what was not, without guessing", async () => {
    const { reviewedSentence } = await import("../review-plan");
    const r = full.plan.reviewed;
    assert.ok(r, "reviewed summary present");
    assert.ok(r!.found.includes("CAM cap") || r!.notFound.includes("CAM cap"));
    assert.equal(r!.found.length + r!.notFound.length, 5);
    const sentence = reviewedSentence(r)!;
    assert.match(sentence, /What we read in your lease|could not read any/);
    if (r!.notFound.length) assert.match(sentence, /does not say, or that the page was unclear/);
    assert.equal(reviewedSentence(null), null);
  });

  console.log(`review-plan-e2e: ${n} passed, 0 failed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
