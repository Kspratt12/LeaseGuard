/**
 * Customer corrections of extracted numbers (src/lib/input-overrides.ts). Known answers are worked by hand in comments.
 * Run: npx tsx src/lib/__tests__/input-overrides.test.ts
 * Fictional data only; no database, no network, no AI.
 */
delete process.env.ANTHROPIC_API_KEY;

import assert from "node:assert";
import {
  applyInputOverrides,
  listCorrectableInputs,
  mergeOverrides,
  parseOverrides,
  validateCorrections,
  type InputOverrides,
} from "../input-overrides";
import { buildDisputeLetter } from "../../services/dispute-letter";
import { buildDocumentRequest } from "../../services/document-request";
import { shareFinding } from "../../services/share-math";
import type { Finding, LeaseClauseSummary } from "../../services/audit-logic";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const NOW = "2026-11-20T10:00:00.000Z";
const share = {
  ...shareFinding(
    { kind: "share", billedShare: 10, expectedShare: 8.08, expectedBasis: "stated", pool: 661437.2, tenantCharge: 66143.72 },
    { expectedSentence: "The lease text identified in this review states a share of 8.08%." },
  ),
  sourceEvidence: [{ document: "Lease.pdf", page: 2, extractedText: "Tenant's pro-rata share ... shall be 8.08%" }],
} as Finding;
const feeFinding: Finding = {
  category: "Admin Fee Above Lease Cap",
  checkId: "admin-fee",
  calc: { kind: "admin-fee", method: "stated-rate", feeAmountBuilding: 100897.2, statedPercent: 18, capPercent: 15, feeBase: null, tenantSharePercent: 8.08 },
  description: "fee", potential_savings: 1359, severity: "medium",
};
const capObs: Finding = { category: "CAM Cap Review: Increase Above Stated Percentage", description: "cap", potential_savings: 0, quantified: false, severity: "medium", letterText: "Please explain the cap." };
const excluded: Finding = { category: "Excluded Category Billed", description: "roof", potential_savings: 0, severity: "high" };
const row = () => ({
  free_findings: [share, excluded],
  paid_findings: [feeFinding, capObs],
  overcharge_breakdown: [{ category: "roof repair", total_expense: 24500, tenant_share_percent: 8.08, tenant_charge: 1979.6, reason: "Excluded Expense" }],
  estimated_overcharge: 1979.6,
  savings_estimate: 12700 + 1359 + 1979.6, // 16,038.60
  validation_warning: null,
  lease_clauses_summary: { camCap: "5%", adminFeeCap: "15%", managementFeeCap: null, tenantProRataShare: "8.08%", tenantSquareFootage: null, buildingSquareFootage: null, excludedCategories: [], additionalClauses: [] } as LeaseClauseSummary,
});
const ov = (values: Record<string, number>): InputOverrides => ({
  version: 1,
  values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v, original: null, at: NOW }])),
});
const cats = (r: Record<string, unknown>) => [...(r.free_findings as Finding[]), ...(r.paid_findings as Finding[])];

async function main() {
  await test("the inputs listed are exactly the numbers the deterministic checks used, with their extracted values", () => {
    const inputs = listCorrectableInputs(row(), null);
    const byKey = Object.fromEntries(inputs.map((i) => [i.key, i.extracted]));
    assert.deepStrictEqual(byKey, {
      "share.billedShare": 10, "share.expectedShare": 8.08, "share.pool": 661437.2, "share.tenantCharge": 66143.72,
      "fee.feeAmountBuilding": 100897.2, "fee.statedPercent": 18, "fee.capPercent": 15, "fee.tenantSharePercent": 8.08,
      "excluded.sharePercent": 8.08, "excluded.row0.amount": 24500,
    });
    assert.ok(inputs.every((i) => !i.corrected && i.current === i.extracted));
  });

  await test("no corrections: the same object is returned (nothing is recomputed)", () => {
    const r = row();
    assert.strictEqual(applyInputOverrides(r, null), r);
    assert.strictEqual(applyInputOverrides(r, { version: 1, values: {} }), r);
    assert.strictEqual(applyInputOverrides(r, "garbage"), r);
  });

  await test("lease share corrected to 9%: share amount and headline recomputed, other figures unchanged", () => {
    const r = row();
    const out = applyInputOverrides(r, ov({ "share.expectedShare": 9 }));
    const s = cats(out).find((f) => f.checkId === "pro-rata-share")!;
    // 661,437.20 x 9% = 59,529.348 -> 59,529.35; 66,143.72 - 59,529.35 = 6,614.37 -> $6,614
    assert.strictEqual(s.potential_savings, 6614);
    assert.ok(s.description.includes("$66,143.72 - $59,529.35 = $6,614.37"));
    assert.ok(/Corrected values used: your share under the lease 9% \(the documents gave/.test(s.description));
    assert.deepStrictEqual(s.correctedInputs, ["share.expectedShare"]);
    assert.deepStrictEqual(s.sourceEvidence, share.sourceEvidence, "source evidence is kept");
    assert.strictEqual(out.savings_estimate, 6614 + 1359 + 1979.6); // 9,952.60
    assert.strictEqual(cats(out).find((f) => f.checkId === "admin-fee")!.potential_savings, 1359, "the fee is not touched");
  });

  await test("the stored row is never modified", () => {
    const r = row();
    const before = JSON.stringify(r);
    applyInputOverrides(r, ov({ "share.expectedShare": 9, "excluded.row0.amount": 20000 }));
    assert.strictEqual(JSON.stringify(r), before);
  });

  await test("a correction that removes the discrepancy turns it into a note with no amount, not raised in the letter", () => {
    const out = applyInputOverrides(row(), ov({ "share.expectedShare": 10 }));
    const s = cats(out).find((f) => f.checkId === "pro-rata-share")!;
    assert.strictEqual(s.potential_savings, 0);
    assert.strictEqual(s.letterText, "");
    assert.strictEqual(s.severity, "low");
    const l = buildDisputeLetter({ findings: cats(out), overchargeBreakdown: out.overcharge_breakdown as never, leaseClausesSummary: out.lease_clauses_summary as LeaseClauseSummary });
    assert.ok(!l.items.some((i) => /share/i.test(i.title)));
  });

  await test("excluded rows: amount and share corrections recompute the row to the cent and the overcharge total", () => {
    // 20,000 x 8.08% = 1,616.00
    const a = applyInputOverrides(row(), ov({ "excluded.row0.amount": 20000 }));
    assert.strictEqual((a.overcharge_breakdown as Array<{ tenant_charge: number }>)[0].tenant_charge, 1616);
    assert.strictEqual(a.estimated_overcharge, 1616);
    assert.strictEqual(a.savings_estimate, 12700 + 1359 + 1616);
    // 24,500 x 7.5% = 1,837.50
    const b = applyInputOverrides(row(), ov({ "excluded.sharePercent": 7.5 }));
    assert.strictEqual((b.overcharge_breakdown as Array<{ tenant_charge: number }>)[0].tenant_charge, 1837.5);
  });

  await test("fee (stated rate): cap corrected to 16% -> 100,897.20 x (18-16)/18 x 8.08% = $905.83 -> $906", () => {
    const out = applyInputOverrides(row(), ov({ "fee.capPercent": 16 }));
    assert.strictEqual(cats(out).find((f) => f.checkId === "admin-fee")!.potential_savings, 906);
  });

  await test("the result says what was corrected and names the lease-reading items that were NOT reassessed", () => {
    const out = applyInputOverrides(row(), ov({ "share.expectedShare": 9 }));
    const rec = (out.lease_clauses_summary as LeaseClauseSummary).inputCorrections!;
    assert.deepStrictEqual(rec.applied.map((a) => a.key), ["share.expectedShare"]);
    assert.deepStrictEqual(rec.notReassessed, ["CAM Cap Review: Increase Above Stated Percentage"]);
    assert.ok(/Recalculated with figures you corrected/.test(String(out.validation_warning)));
    assert.ok(/were not reassessed: CAM Cap Review/.test(String(out.validation_warning)));
  });

  await test("an unavailable legacy headline stays unavailable after a correction", () => {
    const r = { ...row(), savings_estimate: null };
    assert.strictEqual(applyInputOverrides(r, ov({ "share.expectedShare": 9 })).savings_estimate, null);
  });

  await test("letter, document request and headline agree on the corrected view", () => {
    const out = applyInputOverrides(row(), ov({ "share.expectedShare": 9 }));
    const l = buildDisputeLetter({ findings: cats(out), overchargeBreakdown: out.overcharge_breakdown as never, leaseClausesSummary: out.lease_clauses_summary as LeaseClauseSummary });
    assert.strictEqual(l.total, out.savings_estimate);
    assert.ok(l.text.includes("$6,614"));
    assert.ok(!l.text.includes("$12,700"), "no stale amount");
    const req = buildDocumentRequest({ findings: cats(out), overchargeBreakdown: out.overcharge_breakdown as never, leaseClausesSummary: out.lease_clauses_summary as LeaseClauseSummary });
    assert.ok(req.items.some((i) => i.title === "Tenant Allocation Discrepancy"));
  });

  await test("the report PDF prints the corrected amount and headline, and the correction notice", async () => {
    const out = applyInputOverrides(row(), ov({ "share.expectedShare": 9 }));
    const { generateReportPdf } = await import("../../services/report-pdf");
    const { extractTextFromPdf } = await import("../../services/document-validator");
    const pdf = await generateReportPdf({
      auditId: "00000000-0000-0000-0000-000000000000", createdAt: NOW, savingsEstimate: out.savings_estimate as number,
      freeFindings: out.free_findings as Finding[], paidFindings: out.paid_findings as Finding[], isPaid: true,
      validationWarning: String(out.validation_warning), estimatedOvercharge: out.estimated_overcharge as number,
      overchargeBreakdown: out.overcharge_breakdown as never, leaseClausesSummary: out.lease_clauses_summary as LeaseClauseSummary,
    });
    const text = (await extractTextFromPdf(Buffer.from(pdf))).text.replace(/\s+/g, " ");
    assert.ok(text.includes("$9,952.60"), "corrected headline");
    assert.ok(text.includes("$6,614"), "corrected share amount");
    assert.ok(/Recalculated with figures you corrected/.test(text), "correction notice");
  });

  await test("validation: unknown keys, out-of-range percentages and amounts, and non-numbers are refused", () => {
    const inputs = listCorrectableInputs(row(), null);
    assert.ok(!validateCorrections(inputs, { "share.secret": 1 }).ok);
    assert.ok(!validateCorrections(inputs, { "share.expectedShare": 0 }).ok);
    assert.ok(!validateCorrections(inputs, { "share.expectedShare": 100 }).ok);
    assert.ok(!validateCorrections(inputs, { "share.pool": -1 }).ok);
    assert.ok(!validateCorrections(inputs, { "share.pool": 2e9 }).ok);
    assert.ok(!validateCorrections(inputs, { "share.pool": "1,000" }).ok);
    assert.ok(!validateCorrections(inputs, {}).ok);
    const ok = validateCorrections(inputs, { "share.pool": 1234.567, "share.expectedShare": 9.123456 });
    assert.ok(ok.ok && ok.changes["share.pool"] === 1234.57 && ok.changes["share.expectedShare"] === 9.1235);
  });

  await test("merge keeps provenance; null or the extracted value removes a correction; removing all returns null", () => {
    const inputs = listCorrectableInputs(row(), null);
    const m = mergeOverrides(null, inputs, { "share.expectedShare": 9 }, NOW)!;
    assert.deepStrictEqual(m.values["share.expectedShare"], { value: 9, original: 8.08, at: NOW });
    assert.strictEqual(mergeOverrides(m, inputs, { "share.expectedShare": null }, NOW), null);
    assert.strictEqual(mergeOverrides(m, inputs, { "share.expectedShare": 8.08 }, NOW), null);
  });

  await test("stored JSON is validated: malformed entries are ignored", () => {
    assert.strictEqual(parseOverrides({ version: 2, values: {} }), null);
    assert.strictEqual(parseOverrides({ version: 1, values: { "bad key!": { value: 1 } } }), null);
    const p = parseOverrides({ version: 1, values: { "share.pool": { value: "1" }, "share.expectedShare": { value: 9, original: 8.08, at: NOW } } });
    assert.deepStrictEqual(Object.keys(p!.values), ["share.expectedShare"]);
  });

  await test("an audit stored before inputs were recorded offers only its excluded-expense rows, and says nothing else changed", () => {
    const old = { ...row(), free_findings: [{ ...share, calc: undefined, checkId: undefined }], paid_findings: [] };
    const keys = listCorrectableInputs(old, null).map((i) => i.key);
    assert.deepStrictEqual(keys, ["excluded.sharePercent", "excluded.row0.amount"]);
  });

  console.log(`\ninput-overrides: ${passed} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
