/**
 * The AI extraction step reads only the first 20,000 characters of each document; pattern matching reads all of it.
 * When a document is longer, every surface must say so, and a provision that was not detected must never be called absent.
 *
 * The pipeline runs for real on fictional documents. The network is MOCKED before the AI client exists, so no request
 * leaves this machine and no provider is contacted. A mocked AI step says nothing about how a real model behaves:
 * these tests establish what is SENT, what is RECORDED and what the customer is TOLD, not model accuracy.
 *
 * Run: npx tsx src/lib/__tests__/analysis-coverage.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  AI_TEXT_CHAR_LIMIT, addExtraStatementCoverage, buildCoverage, coverageOf, coverageSentence, coverageShort, isAiTruncated, parseCoverage,
} from "../analysis-coverage";
import { decidePurchase, purchaseInputFromRow, type PurchaseInput } from "../purchase-eligibility";

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  process.stdout.write(`  ✓ ${name}\n`);
}

const FIX = path.join(__dirname, "../../services/__tests__/fixtures");
const clean = (l: string) => l.replace(/\r/g, "").replace(/[^\x20-\x7E]/g, "-");
const leaseFixture = fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf8").split("\n").map(clean);
const reconFixture = fs.readFileSync(path.join(FIX, "recon-high-confidence.txt"), "utf8").split("\n").map(clean);
const BOILER = "ARTICLE FILLER. The parties agree that notices shall be delivered in writing, that headings are for convenience, that this instrument binds successors, and that waiver of one default is not waiver of another.";
const filler: string[] = [];
while (filler.join("\n").length < 45_000) filler.push(BOILER);
const CAP_CLAUSE = "CAM Cap. Controllable Operating Expenses shall not exceed";

const textPdf = async (lines: string[]) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  for (let i = 0; i < lines.length; i += 60) {
    const page = pdf.addPage([612, 792]);
    lines.slice(i, i + 60).forEach((l, k) => page.drawText(l.slice(0, 105), { x: 30, y: 756 - k * 10.8, size: 8, font }));
  }
  return Buffer.from(await pdf.save());
};

(async () => {
  // ── the record itself ──
  await t("buildCoverage: only a document LONGER than the limit counts, and only if the AI step actually ran", () => {
    const L = AI_TEXT_CHAR_LIMIT;
    assert.equal(L, 20_000);
    assert.equal(buildCoverage({ aiRan: true, leaseChars: L, statementChars: L }), null, "exactly at the limit is not truncated");
    assert.equal(buildCoverage({ aiRan: true, leaseChars: 100, statementChars: 100 }), null);
    assert.equal(buildCoverage({ aiRan: false, leaseChars: 99_999, statementChars: 99_999 }), null, "no AI step, nothing was truncated");
    assert.deepEqual(buildCoverage({ aiRan: true, leaseChars: L + 1, statementChars: 5 }), { aiCharLimit: L, leaseAiTruncated: true, statementAiTruncated: false, extraStatementsAiTruncated: 0 });
    assert.deepEqual(buildCoverage({ aiRan: true, leaseChars: 5, statementChars: L + 1 }), { aiCharLimit: L, leaseAiTruncated: false, statementAiTruncated: true, extraStatementsAiTruncated: 0 });
    const merged = addExtraStatementCoverage(buildCoverage({ aiRan: true, leaseChars: L + 5, statementChars: 1 }), [10, L + 1, L + 9]);
    assert.equal(merged?.extraStatementsAiTruncated, 2);
    assert.equal(merged?.leaseAiTruncated, true);
    assert.equal(addExtraStatementCoverage(null, [10, 20]), null);
  });

  await t("a stored coverage record is read defensively: malformed JSON is 'no record', never a claim", () => {
    for (const bad of [null, undefined, "x", 7, [], {}, { aiCharLimit: 0 }, { aiCharLimit: 20000 }, { aiCharLimit: 20000, leaseAiTruncated: "yes" }]) assert.equal(parseCoverage(bad), null);
    assert.equal(isAiTruncated(parseCoverage({ aiCharLimit: 20000, leaseAiTruncated: true })), true);
    assert.equal(coverageOf({ coverage: { aiCharLimit: 20000, statementAiTruncated: true } })?.statementAiTruncated, true);
    assert.equal(coverageOf(null), null);
  });

  await t("the wording separates what pattern matching read, what the AI read, 'not detected' and 'absent', and does not say the text could not be read", () => {
    const s = coverageSentence({ aiCharLimit: 20000, leaseAiTruncated: true, statementAiTruncated: false, extraStatementsAiTruncated: 0 });
    assert.match(s, /Your lease is longer than the AI step reads/);
    assert.match(s, /Pattern matching read the whole text/);
    assert.match(s, /AI step read only the first 20,000 characters/);
    assert.match(s, /may not have been considered/);
    assert.match(s, /did not detect may still be in the document/);
    assert.match(s, /not established that any provision is absent/);
    assert.ok(!/could not be read|failed|unreadable|no readable/i.test(s), "must not describe a read failure");
    const both = coverageSentence({ aiCharLimit: 20000, leaseAiTruncated: true, statementAiTruncated: true, extraStatementsAiTruncated: 2 });
    assert.match(both, /Your lease, your reconciliation statement and 2 of your additional statements are longer/);
    assert.match(coverageShort({ aiCharLimit: 20000, leaseAiTruncated: true, statementAiTruncated: false, extraStatementsAiTruncated: 0 }), /first 20,000 characters of your lease/);
  });

  // ── the real pipeline, with the network mocked ──
  let requests: string[] = [];
  process.env.ANTHROPIC_API_KEY = "sk-ant-api03-MOCKMOCKMOCKMOCKMOCKMOCKMOCK";
  process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9";
  (globalThis as { fetch: typeof fetch }).fetch = (async (_u: unknown, init?: { body?: string }) => {
    requests.push(String(JSON.parse(String(init?.body)).messages[0].content));
    return new Response(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "mock", stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: "text", text: JSON.stringify({ camCapPercentage: null, adminFeePercentage: null, managementFee: null, proRataShare: null, tenantPremisesSqFt: null, buildingTotalSqFt: null, statedTenantSharePercent: null, excludedTerms: [], totalCamCharges: null, reconciliationTotal: null, priorYearTotal: null, reconciliationYear: null, lineItems: [] }) }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const quiet = () => { const l = console.log, w = console.warn, e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; return () => { console.log = l; console.warn = w; console.error = e; }; };

  const restore0 = quiet();
  const { validateDocuments } = await import("../../services/document-validator");
  const { runAudit } = await import("../../services/audit-logic");
  const { buildReviewPlan, reviewedSentence } = await import("../../services/review-plan");
  const { buildDisputeLetter } = await import("../../services/dispute-letter");
  const { generateReportPdf } = await import("../../services/report-pdf");
  const { extractText } = await import("unpdf");
  const reconPdf = await textPdf(reconFixture);

  // A. an over-limit lease whose provisions sit near its END
  const longLease = await textPdf([...filler, ...leaseFixture]);
  requests = [];
  const vA = await validateDocuments(longLease, reconPdf);
  const rA = await runAudit(vA);
  restore0();

  await t("OVER-LIMIT lease with its provisions near the end: the AI request carries only the first 20,000 characters, none of the provisions", () => {
    const leaseRequest = requests.find((r) => r.includes("lease analyst")) ?? "";
    const doc = leaseRequest.split("--- DOCUMENT TEXT ---\n")[1] ?? "";
    assert.equal(doc.length, 20_000);
    assert.ok(!doc.includes(CAP_CLAUSE) && !doc.includes("Pro-Rata Share") && !doc.includes("Administrative Fee"));
  });

  await t("the truncation is detected and recorded, and ONLY for the document that was cut", () => {
    assert.deepEqual(vA.coverage, { aiCharLimit: 20_000, leaseAiTruncated: true, statementAiTruncated: false, extraStatementsAiTruncated: 0 });
    assert.deepEqual(rA.leaseClausesSummary?.coverage, vA.coverage, "the record travels in the stored clause summary");
  });

  await t("pattern matching still processed the FULL text (the cap clause past character 20,000 was detected), so the application did not 'fail to read' it", () => {
    assert.equal(rA.leaseClausesSummary?.camCap, "5%");
    assert.equal(rA.leaseClausesSummary?.tenantProRataShare, "8.08%");
  });

  // B. long, nothing at all detected: the record must still exist
  const restoreB = quiet();
  const vB = await validateDocuments(await textPdf(filler), reconPdf);
  const rB = await runAudit(vB);
  restoreB();
  await t("OVER-LIMIT lease where NOTHING was detected still carries the coverage record (an empty clause summary, not null)", () => {
    assert.ok(rB.leaseClausesSummary, "summary exists");
    assert.equal(rB.leaseClausesSummary?.camCap, null);
    assert.equal(rB.leaseClausesSummary?.excludedCategories.length, 0);
    assert.equal(rB.leaseClausesSummary?.coverage?.leaseAiTruncated, true);
  });

  // C. missing data WITHOUT truncation: short lease whose cap wording is not recognised
  const odd = leaseFixture.map((l) => l.replace(/3\.2 CAM Cap\. Controllable Operating Expenses shall not exceed a 5% annual increase/, "3.2 Escalation limit. Year over year growth in the tenant's controllable contribution is restricted to five percent"));
  const restoreC = quiet();
  const vC = await validateDocuments(await textPdf(odd), reconPdf);
  vC.leaseFields.adminFeePercentage = vC.leaseFields.adminFeePercentage ?? "15";
  const rC = await runAudit(vC);
  restoreC();
  await t("MISSING DATA without truncation: no coverage record, no truncation wording, and the gap is described as 'could not be detected'", () => {
    assert.equal(vC.coverage ?? null, null);
    assert.equal(rC.leaseClausesSummary?.coverage, undefined);
    assert.match(String(rC.validationWarning), /CAM cap percentage could not be detected/);
    assert.ok(!/20,000|longer than the AI step|first part/.test(String(rC.validationWarning)));
  });

  // D. no AI configured: a long document is NOT said to have been cut
  delete process.env.ANTHROPIC_API_KEY;
  const restoreD = quiet();
  const vD = await validateDocuments(longLease, reconPdf);
  restoreD();
  process.env.ANTHROPIC_API_KEY = "sk-ant-api03-MOCKMOCKMOCKMOCKMOCKMOCKMOCK";
  await t("with no AI step configured nothing was truncated, so no truncation is claimed", () => {
    assert.equal(vD.coverage ?? null, null);
  });

  // ── every deliverable states the limitation (and none contradicts it) ──
  const asRow = (r: typeof rA) => ({ free_findings: r.free_findings, paid_findings: r.paid_findings, overcharge_breakdown: r.overcharge_breakdown, lease_clauses_summary: r.leaseClausesSummary, audit_mode: r.auditMode, confidence: r.confidence, validation_warning: r.validationWarning });
  const pdfText = async (paid: boolean) => {
    const pdf = await generateReportPdf({
      auditId: "11111111-2222-3333-4444-555555555555", createdAt: "2026-11-01T00:00:00Z", savingsEstimate: rA.savings_estimate,
      freeFindings: rA.free_findings, paidFindings: rA.paid_findings, isPaid: paid, confidence: rA.confidence, confidenceScore: rA.confidenceScore,
      validationWarning: rA.validationWarning, estimatedOvercharge: rA.estimated_overcharge, overchargeBreakdown: rA.overcharge_breakdown, leaseClausesSummary: rA.leaseClausesSummary,
    });
    if (process.env.KEEP_PDF && paid) fs.writeFileSync(process.env.KEEP_PDF, pdf);
    return String((await extractText(new Uint8Array(pdf), { mergePages: true })).text).replace(/\s+/g, " ");
  };

  await t("PREVIEW and PAID PDFs: a coverage notice, and the confidence label is qualified (never a bare 'HIGH')", async () => {
    for (const paid of [false, true]) {
      const text = await pdfText(paid);
      assert.match(text, /This review does not cover your whole document/);
      assert.match(text, /AI step read only the first 20,000 characters/);
      assert.match(text, /Audit Confidence: [A-Z]+ \(partial coverage\)/);
      assert.ok(!/Audit Confidence: [A-Z]+ \(\d+\/100\)\s*$/.test(text.slice(text.indexOf("Audit Confidence"), text.indexOf("Audit Confidence") + 60)), "a bare score right after the label");
      assert.ok(!/does not say|lease omits/i.test(text) || /does not show that your lease omits it/.test(text), "must not assert absence");
    }
  });

  await t("CAM Review Plan: the confidence note and the 'not detected' sentence carry the limitation and never suggest the lease omits a provision", () => {
    const plan = buildReviewPlan({ findings: [...rA.free_findings, ...rA.paid_findings], overchargeBreakdown: rA.overcharge_breakdown, leaseClausesSummary: rA.leaseClausesSummary, confidence: rA.confidence });
    assert.match(String(plan.confidenceNote), /not confidence that the whole document was analyzed/);
    assert.match(String(plan.confidenceNote), /first 20,000 characters/);
    const s = String(reviewedSentence(plan.reviewed));
    assert.match(s, /Not detected:/);
    assert.match(s, /does not show that your lease omits it/);
    assert.ok(!/does not say/.test(s));
    // and without truncation the plan keeps its ordinary wording
    const plain = buildReviewPlan({ findings: [...rC.free_findings, ...rC.paid_findings], overchargeBreakdown: rC.overcharge_breakdown, leaseClausesSummary: rC.leaseClausesSummary, confidence: rC.confidence });
    assert.match(String(plain.confidenceNote), /^Overall confidence in this audit is/);
    assert.ok(!/first 20,000/.test(String(plain.confidenceNote)));
  });

  await t("DISPUTE LETTER: a bracketed note to delete is added (and listed as an unfilled placeholder), only for a truncated audit", () => {
    const letter = buildDisputeLetter({ findings: [...rA.free_findings, ...rA.paid_findings], overchargeBreakdown: rA.overcharge_breakdown, leaseClausesSummary: rA.leaseClausesSummary });
    assert.ok(letter.text.startsWith("[Delete before sending: AI read only part of lease]"));
    assert.ok(letter.placeholders.includes("[Delete before sending: AI read only part of lease]"));
    assert.ok(!/is absent|does not contain|omits/i.test(letter.text), "the letter never claims a provision is absent");
    const plain = buildDisputeLetter({ findings: [...rC.free_findings, ...rC.paid_findings], overchargeBreakdown: rC.overcharge_breakdown, leaseClausesSummary: rC.leaseClausesSummary });
    assert.ok(!plain.text.includes("Delete before sending"));
  });

  await t("PURCHASE disclosure: a truncated audit with real findings is sold as PARTIAL with the coverage statement", () => {
    const d = decidePurchase(purchaseInputFromRow(asRow(rA)));
    assert.equal(d.eligible, true);
    assert.equal((d as { completeness: string }).completeness, "partial");
    assert.ok((d as { notes: string[] }).notes.some((x) => /first 20,000 characters of your lease/.test(x)));
  });

  await t("a clean-but-truncated audit stays 'nothing to unlock' (reason unchanged) but carries the coverage caveat", () => {
    const base: PurchaseInput = { freeFindings: [{ category: "Pro Rata Share Consistent", description: "x", potential_savings: 0, severity: "low" }], paidFindings: [], overchargeBreakdown: [], leaseClausesSummary: null, auditMode: "full", confidence: "high", validationWarning: null };
    const cov = { aiCharLimit: 20000, leaseAiTruncated: true, statementAiTruncated: false, extraStatementsAiTruncated: 0 };
    const without = decidePurchase(base);
    const withCov = decidePurchase({ ...base, leaseClausesSummary: { camCap: null, adminFeeCap: null, managementFeeCap: null, tenantProRataShare: null, tenantSquareFootage: null, buildingSquareFootage: null, excludedCategories: [], additionalClauses: [], coverage: cov } });
    assert.deepEqual(without, { eligible: false, reason: "nothing_to_unlock" });
    assert.equal(withCov.eligible, false);
    assert.equal((withCov as { reason: string }).reason, "nothing_to_unlock");
    assert.match(String((withCov as { coverageNote?: string }).coverageNote), /first 20,000 characters of your lease/);
  });

  // ── part 2: the partial-review wording, and eligibility untouched ──
  const SELLABLE: PurchaseInput = { freeFindings: [], paidFindings: [{ category: "Admin Fee Above Lease Cap", description: "x", potential_savings: 1359, severity: "medium" }], overchargeBreakdown: [], leaseClausesSummary: null, auditMode: "full", confidence: "high", validationWarning: null };
  await t("WORDING: a generic data-gap warning is described neutrally; only a KNOWN unreadable cause says 'could not be read'", () => {
    const generic = decidePurchase({ ...SELLABLE, validationWarning: "Some audit checks have limited data: CAM cap percentage could not be detected in the lease." }) as { completeness: string; notes: string[] };
    assert.equal(generic.completeness, "partial", "still disclosed as partial");
    assert.deepEqual(generic.notes, ["Some checks could not be completed with the information found in the documents. See the notice above."]);
    assert.ok(!generic.notes.join(" ").includes("could not be read"));
    const unread = decidePurchase({ ...SELLABLE, validationWarning: "Page 2 of your lease had no readable text, so anything printed there was not reviewed." }) as { notes: string[] };
    assert.deepEqual(unread.notes, ["Part of the uploaded material could not be read. See the notice above."]);
    const info = decidePurchase({ ...SELLABLE, validationWarning: "Total estimated from detected line items." }) as { completeness: string };
    assert.equal(info.completeness, "complete");
  });

  await t("ELIGIBILITY is unchanged by any warning text or coverage record, across a matrix of inputs", () => {
    const cov = { aiCharLimit: 20000, leaseAiTruncated: true, statementAiTruncated: true, extraStatementsAiTruncated: 1 };
    const summaryWith = { camCap: null, adminFeeCap: null, managementFeeCap: null, tenantProRataShare: null, tenantSquareFootage: null, buildingSquareFootage: null, excludedCategories: [], additionalClauses: [], coverage: cov };
    const F = { description: "x", severity: "medium" as const, potential_savings: 0 };
    const sets: PurchaseInput[] = [
      { ...SELLABLE },
      { ...SELLABLE, auditMode: "limited" },
      { ...SELLABLE, freeFindings: [{ ...F, category: "CAM Cap Review: Prior-Year Data Needed", insufficientData: true }] },
      { ...SELLABLE, paidFindings: [], freeFindings: [{ ...F, category: "Pro Rata Share Consistent", severity: "low" }] },
      { ...SELLABLE, paidFindings: [], freeFindings: [] },
      { ...SELLABLE, paidFindings: [], freeFindings: [{ ...F, category: "Document Review Summary", insufficientData: true }], auditMode: "limited" },
    ];
    const warnings = [null, "Some audit checks have limited data: x could not be detected.", "Page 2 of your lease had no readable text.", "Total estimated from detected line items.", "were not processed"];
    for (const base of sets) {
      const expected = decidePurchase(base).eligible;
      for (const w of warnings) for (const lcs of [null, summaryWith]) {
        assert.equal(decidePurchase({ ...base, validationWarning: w, leaseClausesSummary: lcs }).eligible, expected, `eligibility changed for warning=${w} coverage=${!!lcs}`);
      }
    }
  });

  await t("SCREEN: the results page uses the stored record (always-visible notice, qualified confidence), the letter page shows the note, the no-purchase panel carries the caveat", () => {
    const SRC = path.join(__dirname, "../..");
    const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");
    const page = read("app/audit/[id]/page.tsx");
    assert.match(page, /isAiTruncated\(coverage\) && <CoverageNotice coverage=\{coverage\} \/>/);
    assert.match(page, /coverageLimited=\{isAiTruncated\(coverage\)\}/);
    assert.match(page, /CONFIDENCE_COVERAGE_QUALIFIER/);
    assert.ok(page.indexOf("<CoverageNotice") < page.indexOf("Limited audit mode banner") + 400, "the notice is outside the limited-mode branch that hides warning text");
    assert.match(read("app/audit/[id]/letter/page.tsx"), /draft\?\.coverageNote/);
    assert.match(read("components/audit-no-purchase.tsx"), /coverageNote/);
    // coverage is saved with the guaranteed write, not the best-effort one
    const route = read("app/api/upload/route.ts");
    const core = route.slice(route.indexOf("const coreUpdate"), route.indexOf("const { error: coreErr }"));
    assert.match(core, /lease_clauses_summary: result\.leaseClausesSummary/);
    const analytics = route.slice(route.indexOf("const analyticsUpdate"), route.indexOf("const { error: analyticsErr }"));
    assert.ok(!/lease_clauses_summary/.test(analytics));
  });

  process.stdout.write(`analysis-coverage: ${n} passed, 0 failed\n`);
  process.exit(0);
})().catch((e) => {
  process.stdout.write(String(e instanceof Error ? e.stack : e) + "\n");
  process.exit(1);
});
