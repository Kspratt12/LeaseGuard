/**
 * Two wording corrections, nothing else: (1) the review-plan rounding note refers to "each displayed subtotal" because the plan
 * shows two separate amounts, not one total; (2) the PDF summary box for an audit whose ONLY findings are no-cap observations
 * says no cap was found to compare with, instead of "potential discrepancies ... warrant further review".
 * Findings, figures, evidence, eligibility and prices are pinned unchanged. Fictional data, no database, no AI, no network.
 *
 * Run: npx tsx src/services/__tests__/copy-corrections.test.ts
 */
delete process.env.ANTHROPIC_API_KEY;

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROUNDING_NOTE, ROUNDING_NOTE_PLAN } from "../../lib/format";
import { NO_CAP_ONLY_IDENTIFIED, NO_CAP_ONLY_LABEL, NO_CAP_ONLY_NO_CAP, NO_CAP_ONLY_NOT_A_PASS } from "../../lib/quantification";
import { generateReportPdf } from "../report-pdf";
import { extractTextFromPdf } from "../document-validator";

(globalThis as { fetch: unknown }).fetch = async () => {
  throw new Error("network blocked");
};

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  process.stdout.write(`  ✓ ${name}\n`);
}
const SRC = path.join(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8").replace(/\r\n/g, "\n");
const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();

const obs = {
  category: "Year-over-Year CAM Change (Multi-Year)",
  description: "CAM charges changed 15.0% from 2023 ($400,000) to 2024 ($460,000). No CAM cap was detected in the lease to compare against.",
  potential_savings: 0, severity: "low" as const,
  sourceEvidence: [{ document: "statement-2023.pdf", page: null, extractedText: "2023 Total: $400,000" }],
};
const fee = {
  category: "Admin Fee Above Lease Cap", description: "Management fee billed at 18% against a 15% lease limit (fictional).",
  potential_savings: 1359, severity: "medium" as const,
  sourceEvidence: [{ document: "statement.pdf", page: 1, extractedText: "Management Fee (18%) $100,897.20" }],
};
const pdfText = async (findings: unknown[], savings: number, isPaid: boolean) => {
  const buf = await generateReportPdf({
    auditId: "00000000-0000-0000-0000-000000000000", createdAt: "2026-11-05T00:00:00.000Z", savingsEstimate: savings,
    freeFindings: findings, paidFindings: [], isPaid, confidence: "medium", confidenceScore: 40, validationWarning: null,
    estimatedOvercharge: 0, overchargeBreakdown: [], leaseClausesSummary: null,
  } as never);
  return (await extractTextFromPdf(Buffer.from(buf))).text.replace(/\s+/g, " ");
};

(async () => {
  await t("review-plan note refers to each displayed subtotal, keeps the rounding rule, and does not call it a single total", () => {
    assert.match(ROUNDING_NOTE_PLAN, /Each displayed subtotal is the exact sum of the amounts shown in it/);
    assert.match(ROUNDING_NOTE_PLAN, /rounded to the nearest dollar/);
    assert.match(ROUNDING_NOTE_PLAN, /excluded-expense rows are shown to the cent/);
    assert.ok(!/\bThe total\b/.test(ROUNDING_NOTE_PLAN));
  });

  await t("the headline note is unchanged where one total really is shown", () => {
    assert.equal(ROUNDING_NOTE, "How the amounts add up: each finding's amount is rounded to the nearest dollar when it is calculated, while excluded-expense rows are shown to the cent. The total is the exact sum of the amounts shown, so it can include cents.");
  });

  await t("review plan (screen and PDF) uses the subtotal note; the results page and report summary keep the total note", () => {
    for (const f of ["components/review-plan.tsx", "services/review-plan-pdf.ts"]) {
      const s = read(f);
      assert.ok(/\bROUNDING_NOTE_PLAN\b/.test(s), f);
      assert.ok(!/\bROUNDING_NOTE\b/.test(s), `${f} still uses the single-total note`);
    }
    assert.ok(/\bROUNDING_NOTE\b/.test(read("app/audit/[id]/page.tsx")));
    assert.ok(/\bROUNDING_NOTE\b/.test(read("services/report-pdf.ts")));
  });

  await t("the generated paid PDF's review plan carries the subtotal note, with the two amounts kept separate", async () => {
    const flat = squash(await pdfText([fee], 1359, true));
    assert.ok(flat.includes(squash("Each displayed subtotal is the exact sum of the amounts shown in it")), "plan note missing from PDF");
    assert.ok(flat.includes(squash("calculated and")) && flat.includes(squash("that depends on judgment")));
  });

  await t("no-cap-only PDF (paid and unpaid): qualified wording, not 'potential discrepancies detected'", async () => {
    for (const isPaid of [true, false]) {
      const flat = squash(await pdfText([obs], 0, isPaid));
      assert.ok(flat.includes(squash(NO_CAP_ONLY_LABEL)), `isPaid=${isPaid}: label missing`);
      assert.ok(flat.includes(squash(NO_CAP_ONLY_IDENTIFIED)));
      assert.ok(flat.includes(squash(NO_CAP_ONLY_NO_CAP)));
      assert.ok(flat.includes(squash(NO_CAP_ONLY_NOT_A_PASS)));
      assert.ok(!flat.includes(squash("POTENTIAL DISCREPANCIES DETECTED")), `isPaid=${isPaid}: old heading still present`);
      assert.ok(!flat.includes(squash("warrant further review")), `isPaid=${isPaid}: old summary sentence still present`);
      assert.ok(!/withinthecap|complieswiththecap|complywiththecap/.test(flat), "must not read as a passed cap comparison");
    }
  });

  await t("no-cap-only PDF still prints the finding, its figures and its evidence (paid)", async () => {
    const flat = squash(await pdfText([obs], 0, true));
    assert.ok(flat.includes(squash("15.0% from 2023")), "finding text missing");
    assert.ok(flat.includes(squash("$400,000")) && flat.includes(squash("$460,000")));
    assert.ok(flat.includes(squash("statement-2023.pdf")), "evidence reference missing");
  });

  await t("an audit with ANY other finding keeps the existing summary wording (no-cap wording does not leak)", async () => {
    const withAmount = squash(await pdfText([obs, fee], 1359, true));
    assert.ok(!withAmount.includes(squash(NO_CAP_ONLY_LABEL)));
    assert.ok(withAmount.includes(squash("POTENTIAL BILLING DISCREPANCIES")));
    const otherZero = { ...fee, potential_savings: 0, quantified: false as const };
    const mixed = squash(await pdfText([obs, otherZero], 0, true));
    assert.ok(!mixed.includes(squash(NO_CAP_ONLY_LABEL)));
    assert.ok(mixed.includes(squash("POTENTIAL DISCREPANCIES DETECTED")));
  });

  await t("source: only wording changed in the summary branch (amount logic untouched)", () => {
    const r = read("services/report-pdf.ts");
    assert.ok(/noCapOnlyBox = !totalUnavailable && !hasOvercharge && effectiveSavings <= 0 && isNoCapObservationOnly\(totalFindings\)/.test(r));
    assert.ok(/effectiveSavings = totalUnavailable \? 0 : Math\.max\(input\.savingsEstimate \?\? 0, totalSavingsFromFindings\)/.test(r));
  });

  process.stdout.write(`copy-corrections: ${n} passed, 0 failed\n`);
  process.exit(0);
})().catch((e) => { process.stdout.write(String(e instanceof Error ? e.stack : e) + "\n"); process.exit(1); });
