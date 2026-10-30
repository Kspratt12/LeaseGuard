/**
 * Wherever a total appears, the same rounding explanation appears with it: paid results page, PDF report, CAM Review
 * Plan (screen and PDF) and the dispute letter. Also checks the explanation is TRUE for what the engine produces.
 * Run: npx tsx src/lib/__tests__/rounding-note.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { ROUNDING_NOTE, ROUNDING_NOTE_SHORT } from "../format";

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  process.stdout.write(`  ✓ ${name}\n`);
}
const SRC = path.join(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8").replace(/\r\n/g, "\n");
const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();

(async () => {
  await t("the wording is plain, accurate and says the total is the exact sum", () => {
    assert.match(ROUNDING_NOTE, /rounded to the nearest dollar/);
    assert.match(ROUNDING_NOTE, /excluded-expense rows are shown to the cent/);
    assert.match(ROUNDING_NOTE, /exact sum of the amounts shown/);
    assert.match(ROUNDING_NOTE_SHORT, /exact sum of the amounts listed/);
    assert.ok(!/confirmed|overcharge|violat/i.test(ROUNDING_NOTE + ROUNDING_NOTE_SHORT));
  });

  await t("the paid results page, the plan (screen and PDF), the report PDF and the letter all use the shared note", () => {
    assert.match(read("app/audit/[id]/page.tsx"), /\{ROUNDING_NOTE\}/);
    assert.match(read("components/review-plan.tsx"), /\{ROUNDING_NOTE\}/);
    assert.match(read("services/review-plan-pdf.ts"), /\$\{ROUNDING_NOTE\}/);
    assert.match(read("services/report-pdf.ts"), /ROUNDING_NOTE/);
    assert.match(read("services/dispute-letter.ts"), /ROUNDING_NOTE_SHORT/);
  });

  // ── real output ──
  const FIX = path.join(__dirname, "../../services/__tests__/fixtures");
  const clean = (l: string) => l.replace(/\r/g, "").replace(/[^\x20-\x7E]/g, "-");
  const lines = (f: string) => fs.readFileSync(path.join(FIX, f), "utf8").split("\n").map(clean);
  const textPdf = async (ls: string[]) => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Courier);
    for (let i = 0; i < ls.length; i += 60) {
      const page = pdf.addPage([612, 792]);
      ls.slice(i, i + 60).forEach((l, k) => page.drawText(l, { x: 36, y: 756 - k * 10.8, size: 8.5, font }));
    }
    return Buffer.from(await pdf.save());
  };
  const log = console.log; console.log = () => {}; console.warn = () => {};
  const { validateDocuments } = await import("../../services/document-validator");
  const { runAudit } = await import("../../services/audit-logic");
  const { generateReportPdf } = await import("../../services/report-pdf");
  const { buildDisputeLetter } = await import("../../services/dispute-letter");
  const { extractText } = await import("unpdf");
  const v = await validateDocuments(await textPdf(lines("lease-high-confidence.txt")), await textPdf(lines("recon-high-confidence.txt")));
  v.leaseFields.adminFeePercentage = "15";
  v.reconFields.adminFeePercentage = "18";
  if (!v.reconFields.lineItems.some((i) => /management fee/i.test(i.category))) v.reconFields.lineItems.push({ category: "Management Fee", amount: "100,897.20", rawLine: "Management Fee (18%)  $91,080.00  $100,897.20" });
  // the AI step (off in tests) supplies the Budget/Actual column choice for this row, so inject it as the other tests do
  v.reconFields.lineItems = v.reconFields.lineItems.filter((i) => !/roof repair/i.test(i.category));
  v.reconFields.lineItems.push({ category: "Roof Repair", amount: "24,500.00", rawLine: "Roof Repair   $0.00   $24,500.00" });
  const result = await runAudit(v);
  console.log = log;
  const all = [...result.free_findings, ...result.paid_findings];

  await t("the explanation is true: every finding amount is a whole dollar, excluded-expense rows may carry cents, and the total is their exact sum", () => {
    for (const f of all) assert.equal(f.potential_savings, Math.round(f.potential_savings), `finding amount ${f.potential_savings} is not whole dollars`);
    assert.ok(result.overcharge_breakdown.some((r) => !Number.isInteger(r.tenant_charge)), "fixture should include a row with cents: " + JSON.stringify(result.overcharge_breakdown.map((r) => r.tenant_charge)) + " / " + result.savings_estimate);
    const exact = Math.round((all.filter((f) => !f.insufficientData).reduce((s, f) => s + f.potential_savings, 0) + result.overcharge_breakdown.reduce((s, r) => s + r.tenant_charge, 0)) * 100) / 100;
    assert.equal(result.savings_estimate, exact);
    assert.ok(!Number.isInteger(result.savings_estimate), "the headline total carries cents here, which the note explains");
  });

  await t("the generated PDF report states the rounding note next to the total", async () => {
    const pdf = await generateReportPdf({
      auditId: "11111111-2222-3333-4444-555555555555", createdAt: "2026-11-01T00:00:00Z", savingsEstimate: result.savings_estimate,
      freeFindings: result.free_findings, paidFindings: result.paid_findings, isPaid: true, confidence: result.confidence, confidenceScore: result.confidenceScore,
      validationWarning: result.validationWarning, estimatedOvercharge: result.estimated_overcharge, overchargeBreakdown: result.overcharge_breakdown, leaseClausesSummary: result.leaseClausesSummary,
    });
    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
    const flat = squash(text as string);
    const occurrences = flat.split(squash("How the amounts add up")).length - 1;
    assert.ok(occurrences >= 2, `expected the note on the summary page and in the review plan, found ${occurrences}`);
    assert.ok(flat.includes(squash("exact sum of the amounts shown")));
  });

  await t("the dispute letter states the short note under its total", () => {
    const letter = buildDisputeLetter({ findings: all, overchargeBreakdown: result.overcharge_breakdown, leaseClausesSummary: result.leaseClausesSummary });
    const i = letter.text.indexOf("Total of the items above:");
    assert.ok(i >= 0);
    assert.ok(letter.text.slice(i, i + 400).includes(ROUNDING_NOTE_SHORT));
  });

  process.stdout.write(`rounding-note: ${n} passed, 0 failed\n`);
  process.exit(0);
})().catch((e) => { process.stdout.write(String(e instanceof Error ? e.stack : e) + "\n"); process.exit(1); });
