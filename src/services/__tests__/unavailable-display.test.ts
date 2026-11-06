/**
 * Display behavior for an earlier audit whose overall total could not be reconciled ("unavailable total").
 *
 * What is rendered or generated for real here: the audit page's headline area (the AuditHeadline component, the same one
 * the page uses), the page's headline decision (headlineFigures), the API response, the letter text and the PDF text.
 * What is NOT covered: a browser. The page's own wiring (that it passes these inputs to AuditHeadline) is checked only by
 * a source scan, and nothing here verifies layout, styling or client-side behavior.
 *
 * Fictional data only. No database, no AI, and NO NETWORK: every outbound path throws and is counted.
 *
 * Run: npx tsx src/services/__tests__/unavailable-display.test.ts
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

const SRC = path.join(__dirname, "../..");
let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// A legacy record whose stored headline (70,000) does NOT reconcile: fee 1,359 + excluded 1,979.60 = 3,338.60 is what remains.
const FEE = { category: "Admin Fee Above Lease Cap", description: "Management fee billed at 18% against a 15% lease limit.", potential_savings: 1359, severity: "medium" as const };
const OLD_CAP = {
  category: "Year-over-Year CAM Escalation Exceeds Lease Cap",
  description: "CAM charges increased 15.0% from 2023 ($400,000) to 2024 ($460,000). Applying the cap, the total for 2024 would be $420,000. Potential discrepancy: $40,000.",
  potential_savings: 40000,
  severity: "high" as const,
  sourceEvidence: [{ document: "statement-2023.pdf", page: null, extractedText: "2023 Total: $400,000" }],
};
const OLD_GROSS = { category: "Possible Gross-Up / Occupancy Adjustment", description: "Potential review amount: $25,897.", potential_savings: 25897, severity: "high" as const };
const ROOF = {
  category: "roof repair", total_expense: 24500, tenant_share_percent: 8.08, tenant_charge: 1979.6, reason: "Excluded Expense",
  sourceEvidence: { document: "recon.pdf", page: 1, extractedText: "Roof Repair   $24,500.00", findingCategory: "Excluded Category Billed" },
};
const LCS = { camCap: "5%", adminFeeCap: "15%", managementFeeCap: null, tenantProRataShare: "8.08%", tenantSquareFootage: null, buildingSquareFootage: null, excludedCategories: ["roof repair"], additionalClauses: [] };
const stored = (headline: number | null) => ({
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", status: "completed", created_at: "2026-09-01T00:00:00.000Z",
  free_findings: [FEE], paid_findings: [OLD_CAP, OLD_GROSS], overcharge_breakdown: [ROOF], estimated_overcharge: 1979.6,
  lease_clauses_summary: LCS, audit_mode: "full", confidence: "high", confidence_score: 70, validation_warning: null, savings_estimate: headline,
});
const UNRECONCILED = () => stored(70000); // 70,000 - 65,897 = 4,103, but the components say 3,338.60
const RECONCILED = () => stored(69235.6); // 69,235.60 - 65,897 = 3,338.60

const OLD_FIGURES = ["$70,000", "$40,000", "$25,897", "$420,000", "$65,897", "$69,235"];

async function main() {
  await test("NETWORK: canary - the guard blocks and counts, then resets", async () => {
    await assert.rejects(() => fetch("https://example.invalid/"), /network blocked/);
    assert.ok(blocked.length >= 1);
    blocked.length = 0;
  });

  const { toPublicAudit } = await import("../../lib/audit-access");
  const { containLegacyAudit } = await import("../../lib/legacy-containment");
  const { comparisonStatusOf, headlineFigures } = await import("../../lib/quantification");
  const { AuditHeadline } = await import("../../components/audit-headline");
  const { buildDisputeLetter } = await import("../dispute-letter");
  const { generateReportPdf } = await import("../report-pdf");
  const { extractTextFromPdf } = await import("../document-validator");
  const { formatMoney } = await import("../../lib/format");

  const api = (r: ReturnType<typeof stored>) =>
    toPublicAudit(
      { id: r.id, status: r.status, savings_estimate: r.savings_estimate, free_findings: r.free_findings, confidence: r.confidence, lease_clauses_summary: r.lease_clauses_summary, overcharge_breakdown: r.overcharge_breakdown, estimated_overcharge: r.estimated_overcharge },
      r.paid_findings,
      { unlocked: false, tier: "multi", amountCents: 14900, reportAvailable: false },
    ) as any;

  /** What the page does with an API response, minus the browser: decide the figures, then render the headline area. */
  const renderHeadline = (a: any) => {
    const findings = [...a.free_findings, ...(a.paid_findings ?? [])];
    const status = comparisonStatusOf(a.lease_clauses_summary);
    const { unavailable, savingsEstimate } = headlineFigures({ storedHeadline: a.savings_estimate, findings, status });
    const hasOvercharge = (a.estimated_overcharge ?? 0) > 0 && (a.overcharge_breakdown ?? []).length > 0;
    return renderToStaticMarkup(
      React.createElement(AuditHeadline, { unavailable, hasOvercharge, savingsEstimate, breakdown: a.overcharge_breakdown ?? [] }, React.createElement("p", null, "REMAINDER-OF-CHAIN")),
    ) as string;
  };

  await test("PAGE DECISION: an unavailable total yields no figure - neither the stored headline nor the sum of the counted findings can win the max() fallback", () => {
    const a = api(UNRECONCILED());
    assert.strictEqual(a.savings_estimate, null);
    const f = headlineFigures({ storedHeadline: 70000, findings: [...a.free_findings, ...a.paid_findings], status: comparisonStatusOf(a.lease_clauses_summary) });
    assert.deepStrictEqual(f, { unavailable: true, savingsEstimate: 0 });
    // the same inputs WITHOUT the unavailable record would have produced a figure (the fallback is real, and is what is bypassed)
    assert.ok(headlineFigures({ storedHeadline: 70000, findings: a.free_findings, status: null }).savingsEstimate > 0);
  });

  await test("PAGE RENDER (unavailable): the unavailable-total notice shows, no headline figure or 'Potential Billing Discrepancies' box is rebuilt", () => {
    const html = renderHeadline(api(UNRECONCILED()));
    assert.ok(/data-testid="headline-unavailable"/.test(html) && /Overall total not available/.test(html) && /could not be reconciled from its stored figures/.test(html));
    assert.ok(!/Potential Billing Discrepancies/.test(html), "no headline box");
    assert.ok(!/REMAINDER-OF-CHAIN/.test(html), "the 'no discrepancies / incomplete' fallbacks are not shown instead");
    for (const f of OLD_FIGURES) assert.ok(!html.includes(f), `${f} appears`);
    assert.ok(!html.includes("$3,338.60") && !html.includes("$4,103"), "no recomputed or residual total appears");
  });

  await test("PAGE RENDER (unavailable): the excluded-expense rows stay visible as individual items, with wording that does not imply a reconciled total", () => {
    const html = renderHeadline(api(UNRECONCILED()));
    assert.ok(/data-testid="excluded-breakdown"/.test(html));
    assert.ok(/roof repair/.test(html) && html.includes("$24,500.00") && html.includes("8.08%") && html.includes("$1,979.60") && /Excluded Expense/.test(html), "the row, its amounts and reason");
    assert.ok(html.includes("Roof Repair   $24,500.00") && /recon\.pdf/.test(html), "the row's source evidence is still shown");
    assert.ok(/not an overall total and do not establish one/.test(html));
    assert.ok(html.indexOf("Overall total not available") < html.indexOf("excluded-breakdown"), "the notice comes first and is a separate element");
    // the notice box itself carries no row data
    const noticeBox = html.slice(html.indexOf('data-testid="headline-unavailable"'), html.indexOf("excluded-breakdown"));
    assert.ok(!/roof repair|\$1,979\.60/.test(noticeBox));
  });

  await test("PAGE RENDER (unavailable, no breakdown rows): no empty breakdown section is drawn", () => {
    const a = api({ ...UNRECONCILED(), overcharge_breakdown: [], estimated_overcharge: 0 } as any);
    const html = renderHeadline(a);
    assert.ok(/headline-unavailable/.test(html) && !/excluded-breakdown/.test(html));
  });

  await test("PAGE RENDER (reconciled): behavior is unchanged - the reconciled figure, the rows and their evidence", () => {
    const a = api(RECONCILED());
    assert.strictEqual(a.savings_estimate, 3338.6);
    const html = renderHeadline(a);
    assert.ok(/Potential Billing Discrepancies/.test(html) && html.includes(formatMoney(3338.6)));
    assert.ok(html.includes("$24,500.00") && html.includes("Roof Repair   $24,500.00"));
    assert.ok(!/headline-unavailable|Overall total not available/.test(html));
    for (const f of OLD_FIGURES) assert.ok(!html.includes(f), `${f} appears`);
  });

  await test("PAGE WIRING (source scan only, NOT a browser check): the page hands these inputs to AuditHeadline and keeps no private max() fallback", () => {
    const page = fs.readFileSync(path.join(SRC, "app/audit/[id]/page.tsx"), "utf8");
    assert.ok(/<AuditHeadline unavailable=\{headlineUnavailable\(comparisonStatusOf\(audit\.lease_clauses_summary\)\)\}/.test(page));
    assert.ok(/breakdown=\{overchargeBreakdown\}/.test(page) && /headlineFigures\(\{/.test(page));
    assert.ok(!/Math\.max\(dbSavings/.test(page), "no inline fallback is left on the page");
  });

  await test("LETTER: individual items and their amounts remain; the overall total is omitted and explained; no competing total is rebuilt", () => {
    const c = containLegacyAudit(UNRECONCILED() as any) as any;
    const letter = buildDisputeLetter({ findings: [...c.free_findings, ...c.paid_findings], overchargeBreakdown: c.overcharge_breakdown, leaseClausesSummary: c.lease_clauses_summary });
    assert.strictEqual(letter.total, null);
    assert.ok(letter.totalNote && /could not be reconciled/.test(letter.totalNote));
    assert.ok(!/Total of the items above/.test(letter.text));
    assert.ok(/Admin Fee Above Lease Cap - \$1,359/.test(letter.text) && /Excluded expense: roof repair - \$1,979\.60/.test(letter.text), "retained individual items and factual amounts");
    for (const f of [...OLD_FIGURES, "$3,338.60", "$4,103"]) assert.ok(!letter.text.includes(f), `${f} in the letter`);
    const reconciled = containLegacyAudit(RECONCILED() as any) as any;
    const ok = buildDisputeLetter({ findings: [...reconciled.free_findings, ...reconciled.paid_findings], overchargeBreakdown: reconciled.overcharge_breakdown, leaseClausesSummary: reconciled.lease_clauses_summary });
    assert.strictEqual(ok.total, 3338.6);
    assert.ok(/Total of the items above: \$3,338\.60/.test(ok.text));
  });

  const pdfText = async (r: ReturnType<typeof stored>, isPaid: boolean) =>
    (
      await extractTextFromPdf(
        Buffer.from(
          await generateReportPdf({
            auditId: "00000000-0000-0000-0000-000000000000", createdAt: "2026-09-01T00:00:00.000Z",
            savingsEstimate: r.savings_estimate as number, freeFindings: r.free_findings as any, paidFindings: r.paid_findings as any, isPaid,
            confidence: "high", confidenceScore: 70, validationWarning: null,
            estimatedOvercharge: r.estimated_overcharge, overchargeBreakdown: r.overcharge_breakdown as any, leaseClausesSummary: r.lease_clauses_summary as any,
          }),
        ),
      )
    ).text.replace(/\s+/g, " ");

  await test("PDF (preview and paid): the stored row is read, the total shows as unavailable, and no fallback total is resurrected; the breakdown table stays", async () => {
    for (const isPaid of [false, true]) {
      const t = await pdfText(UNRECONCILED(), isPaid);
      assert.ok(/OVERALL TOTAL NOT AVAILABLE/.test(t) && /could not be reconciled/.test(t), `isPaid=${isPaid}`);
      assert.ok(!/POTENTIAL BILLING DISCREPANCIES/.test(t), "no headline box");
      // The headline area's "how the total adds up" note would come from the max() fallback: it must not appear for a total
      // that is not shown. (The paid PDF's review-plan section prints its OWN note beside its separate per-group sums; that
      // is unchanged, so only an occurrence BEFORE the plan section counts.)
      const note = t.indexOf("How the amounts add up");
      const plan = t.indexOf("Amounts in question");
      assert.ok(note === -1 || (isPaid && plan >= 0 && note > plan), `rounding note in the headline area (isPaid=${isPaid})`);
      for (const f of [...OLD_FIGURES, "$3,338.60", "$4,103"]) assert.ok(!t.includes(f), `${f} in the ${isPaid ? "paid" : "preview"} PDF`);
      assert.ok(/Excluded Expense Breakdown/.test(t) && t.includes("$24,500.00") && t.includes("$1,979.60"), "breakdown rows remain");
    }
    // a record that does reconcile still shows its headline
    const ok = await pdfText(RECONCILED(), true);
    assert.ok(/POTENTIAL BILLING DISCREPANCIES/.test(ok) && ok.includes("$3,338.60") && !/OVERALL TOTAL NOT AVAILABLE/.test(ok));
  });

  await test("NETWORK: no outbound request was attempted by any step above", () => {
    assert.deepStrictEqual(blocked, []);
  });

  console.log(`\nunavailable-display: ${passed} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
