/**
 * Wording for an audit whose ONLY findings are no-cap observations (a year-over-year change, and the fact that the lease had
 * no cap to compare it with). The page must not read as though a cap comparison was run and passed.
 *
 * The wording applies to that case only. Eligibility, prices, payment behavior, findings and evidence are not touched, and
 * this file pins that too. Fictional data only, no database, no AI, and NO NETWORK (every outbound path throws and is counted).
 *
 * Run: npx tsx src/services/__tests__/nocap-only-wording.test.ts
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

const SRC = path.join(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");
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
    lines.slice(i, i + 68).forEach((l, j) => page.drawText(l.replace(/[^\x20-\x7E]/g, "-"), { x: 36, y: 756 - j * 10.5, size: 8, font }));
  }
  return Buffer.from(await pdf.save());
}
const flat = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

// The exact wording that existed before this change, for the cases it must NOT change.
const OLD_BOX_LABEL = "No Clear Discrepancies Detected";
const OLD_BOX_BODY = "The uploaded documents did not show a clear billing discrepancy based on current audit checks.";
const OLD_PANEL_NORMAL = "Having no flagged items is a normal result.";
const OLD_PANEL_CHECKS = "LeaseGuard runs a defined set of checks (CAM cap, fees, your share, excluded expenses and year-over-year change).";

const NO_CAP_FACT = "No CAM cap was detected in the lease to compare against.";
const OBS = (over: Record<string, unknown> = {}) => ({
  category: "Year-over-Year CAM Change (Multi-Year)",
  description: `CAM charges changed 15.0% from 2023 ($400,000) to 2024 ($460,000). ${NO_CAP_FACT}`,
  potential_savings: 0, severity: "low" as const,
  sourceEvidence: [{ document: "statement-2023.pdf", page: null, extractedText: "2023 Total: $400,000" }, { document: "statement-2024.pdf", page: null, extractedText: "2024 Total: $460,000" }],
  ...over,
});
const FEE = { category: "Admin Fee Above Lease Cap", description: "Management fee billed at 18% against a 15% lease limit.", potential_savings: 1359, severity: "medium" as const };

async function main() {
  await test("NETWORK: canary - the guard blocks and counts, then resets", async () => {
    await assert.rejects(() => fetch("https://example.invalid/"), /network blocked/);
    assert.ok(blocked.length >= 1);
    blocked.length = 0;
  });

  const Q = await import("../../lib/quantification");
  const { NoDiscrepancyBox } = await import("../../components/audit-headline");
  const { NoPurchasePanel } = await import("../../components/audit-no-purchase");
  const { decidePurchase, purchaseInputFromRow } = await import("../../lib/purchase-eligibility");
  const { TIERS } = await import("../../lib/payments");
  const { validateDocuments } = await import("../document-validator");
  const { runAudit } = await import("../audit-logic");

  await test("SCOPE: the wording applies ONLY when every finding is a no-cap observation - any other finding, of any kind, switches it off", () => {
    assert.strictEqual(Q.isNoCapObservationOnly([OBS()]), true);
    assert.strictEqual(Q.isNoCapObservationOnly([OBS({ category: "Year-over-Year CAM Increase Detected", description: `Year-over-year CAM expenses increased by 10.0%, from $40,000 to $44,000. ${NO_CAP_FACT} Check your lease for any limit on increases.` })]), true);
    assert.strictEqual(Q.isNoCapObservationOnly([OBS(), OBS({ category: "Year-over-Year CAM Increase Detected" })]), true, "both no-cap kinds together");
    assert.strictEqual(Q.isNoCapObservationOnly([]), false);
    assert.strictEqual(Q.isNoCapObservationOnly(null), false);
    assert.strictEqual(Q.isNoCapObservationOnly([OBS(), FEE]), false, "a qualifying finding");
    assert.strictEqual(Q.isNoCapObservationOnly([OBS(), { category: "Pro-Rata Share (matches lease)", description: "ok", potential_savings: 0, severity: "low" }]), false, "any other note");
    assert.strictEqual(Q.isNoCapObservationOnly([OBS(), { category: "CAM Cap Compliance", description: "x", potential_savings: 0, severity: "medium", insufficientData: true }]), false, "a needs-data item");
    assert.strictEqual(Q.isNoCapObservationOnly([{ category: "CAM Cap Review: Increase Below Stated Percentage", description: "x", potential_savings: 0, severity: "low" }]), false, "a cap WAS found: different case");
    assert.strictEqual(Q.isNoCapObservationOnly([OBS({ description: "CAM charges changed 15.0% from 2023 ($400,000) to 2024 ($460,000)." })]), false, "category alone is not enough: the no-cap fact must be stated");
    assert.strictEqual(Q.isNoCapObservationOnly([OBS({ description: "Full details are included in the complete report." })]), false, "a locked teaser has no text to establish it");
  });

  await test("HEADLINE BOX, no-cap-only: the approved sentences, and nothing that implies a cap comparison passed", () => {
    const t = flat(renderToStaticMarkup(React.createElement(NoDiscrepancyBox, { noCapOnly: true })) as string);
    assert.ok(t.includes("No billing discrepancy was identified by the checks that could run."));
    assert.ok(t.includes("No CAM cap was found in the uploaded lease, so the observed change could not be compared with a lease cap."));
    assert.ok(t.includes(Q.NO_CAP_ONLY_LABEL));
    assert.ok(!t.includes(OLD_BOX_LABEL) && !t.includes(OLD_BOX_BODY), "the old wording is not shown here");
    assert.ok(!/within (the )?(lease )?cap|complies|compliant|passed|no cap issue|clear billing/i.test(t), t);
  });

  await test("NO-PURCHASE PANEL, no-cap-only: no 'normal result', no list of checks that includes the cap, and an explicit 'not a statement of compliance'", () => {
    const t = flat(renderToStaticMarkup(React.createElement(NoPurchasePanel, { reason: "nothing_to_unlock", noCapObservationOnly: true })) as string);
    assert.ok(t.includes("No additional findings were detected"));
    assert.ok(t.includes("no paid report to unlock and nothing to buy"));
    assert.ok(t.includes("No CAM cap was found in the uploaded lease, so the observed change could not be compared with a lease cap."));
    assert.ok(t.includes("This is not a statement that the charges comply with a cap, or that the statement is correct in every respect."));
    assert.ok(!t.includes(OLD_PANEL_NORMAL) && !t.includes(OLD_PANEL_CHECKS) && !/\(CAM cap, fees/.test(t), "the wording that implied a cap check ran is gone");
    assert.ok(!/passed|compl(y|ies|iant)(?! with a cap, or)/i.test(t.replace("comply with a cap, or", "")), t);
    assert.ok(!/Unlock Full Report|\$49|\$149|checkout/i.test(t), "still no purchase control");
    // a coverage note, when there is one, is still shown
    const withCov = flat(renderToStaticMarkup(React.createElement(NoPurchasePanel, { reason: "nothing_to_unlock", noCapObservationOnly: true, coverageNote: "COVERAGE-NOTE-X" })) as string);
    assert.ok(withCov.includes("COVERAGE-NOTE-X"));
  });

  await test("EVERY OTHER CASE IS WORD-FOR-WORD UNCHANGED: the default box and panel, and the panels for incomplete analysis", () => {
    for (const props of [{ noCapOnly: false }]) {
      const t = flat(renderToStaticMarkup(React.createElement(NoDiscrepancyBox, props)) as string);
      assert.ok(t.includes(OLD_BOX_LABEL) && t.includes(OLD_BOX_BODY), t);
      assert.ok(!t.includes("could run"));
    }
    for (const props of [{ reason: "nothing_to_unlock" as const }, { reason: "nothing_to_unlock" as const, noCapObservationOnly: false }]) {
      const t = flat(renderToStaticMarkup(React.createElement(NoPurchasePanel, props)) as string);
      assert.ok(t.includes(OLD_PANEL_NORMAL) && t.includes(OLD_PANEL_CHECKS), "the ordinary clean-audit panel is unchanged");
      assert.ok(!t.includes("could not be compared with a lease cap"));
    }
    const incomplete = flat(renderToStaticMarkup(React.createElement(NoPurchasePanel, { reason: "insufficient_analysis", noCapObservationOnly: true, unquantifiedChecks: 2 })) as string);
    assert.ok(/not a clean result/.test(incomplete) && !incomplete.includes("could not be compared with a lease cap"), "the flag cannot change the insufficient-analysis panel");
  });

  await test("PAGE WIRING (source scan, not a browser check): the flag is computed from ALL findings and reaches both places; the old box is only the default", () => {
    const page = read("app/audit/[id]/page.tsx");
    assert.ok(/const noCapOnly = isNoCapObservationOnly\(\[\.\.\.freeFindings, \.\.\.paidFindings\]\);/.test(page));
    assert.ok(/<NoDiscrepancyBox noCapOnly=\{noCapOnly\} \/>/.test(page));
    assert.ok(/noCapObservationOnly=\{noCapOnly\}/.test(page));
    assert.ok(!/No Clear Discrepancies Detected/.test(page), "the default text now lives in one component, not duplicated in the page");
  });

  // ---- the real engine, on a minimal fictional lease with no cap and two consecutive statements ----
  const LEASE_MIN = ["COMMERCIAL LEASE", "Premises: Suite 100, fictional building.", "Tenant pays its pro rata share of operating expenses.", "Tenant pro rata share: 10%.", "Tenant premises: 5,000 sq ft. Building: 50,000 sq ft.", "Landlord shall provide statements annually."].join("\n");
  const RECON_MIN = ["2024 CAM RECONCILIATION STATEMENT", "Property: Fictional Plaza", "Reconciliation Year: 2024", "Total CAM Charges: $460,000.00", "Janitorial   $60,000.00", "Security   $40,000.00"].join("\n");
  // Padding keeps the extractor on the text layer: a very short document would send it to OCR, which tries to download language data
  // (that request is blocked here, but it is not what this test is about).
  const FILLER = Array.from({ length: 40 }, (_, i) => `Note ${i + 1}: this paragraph is neutral filler text in a fictional document and states nothing about charges or limits.`).join("\n");
  const v = await validateDocuments(await textToPdf(LEASE_MIN + "\n" + FILLER), await textToPdf(RECON_MIN + "\n" + FILLER));
  (v.leaseFields as any).camCapPercentage = null;
  v.reconFields.priorYearTotal = null;
  const result = await runAudit(v, { multiYearReconciliations: [{ year: 2023, total: 400000, lineItems: [], docName: "statement-2023.pdf" }, { year: 2024, total: 460000, lineItems: [], docName: "statement-2024.pdf" }] });
  const findings = [...result.free_findings, ...result.paid_findings];

  await test("REAL ENGINE: eligibility, findings and evidence are untouched; the audit is the identified case; prices are unchanged", () => {
    assert.strictEqual(findings.length, 1, findings.map((f) => f.category).join(", "));
    const f = findings[0];
    assert.strictEqual(f.category, "Year-over-Year CAM Change (Multi-Year)");
    assert.ok(f.description.includes("$400,000") && f.description.includes("$460,000") && f.description.includes(NO_CAP_FACT), "observation text and figures intact");
    assert.deepStrictEqual((f.sourceEvidence ?? []).map((e) => e.extractedText), ["2023 Total: $400,000", "2024 Total: $460,000"], "evidence intact");
    assert.strictEqual(f.potential_savings, 0);
    assert.strictEqual(f.severity, "low");
    assert.strictEqual(Q.isNoCapObservationOnly(findings), true);
    assert.deepStrictEqual(decidePurchase(purchaseInputFromRow({ free_findings: result.free_findings, paid_findings: result.paid_findings })), { eligible: false, reason: "nothing_to_unlock" });
    assert.strictEqual(TIERS.single.amount, 4900);
    assert.strictEqual(TIERS.multi.amount, 14900);
    const elig = read("lib/purchase-eligibility.ts");
    assert.ok(/const actionable = plan\.tierCounts\.calculated \+ plan\.tierCounts\.judgment;/.test(elig));
    const pay = read("lib/payments.ts");
    assert.ok(/return years === 1 \? "single" : "multi";/.test(pay) && !/noCap|NoCap|nocap/.test(pay) && !/isNoCapObservationOnly/.test(elig), "eligibility and payment code do not know about this wording");
  });

  await test("MIXED AUDITS are unaffected: with a qualifying finding the audit stays purchasable and the flag is off", () => {
    const mixed = [...findings, FEE];
    assert.strictEqual(Q.isNoCapObservationOnly(mixed), false);
    const d = decidePurchase(purchaseInputFromRow({ free_findings: mixed, paid_findings: [] }));
    assert.ok(d.eligible, "eligible because of the fee finding");
  });

  await test("STORED NO-CAP RECORDS (through the legacy adapter) are recognised too, and a record that merely shares the category is not", async () => {
    const { containLegacyAudit } = await import("../../lib/legacy-containment");
    const stored = { free_findings: [OBS({ severity: "medium" })], paid_findings: [] };
    const out = containLegacyAudit(stored as any) as any;
    assert.strictEqual(Q.isNoCapObservationOnly(out.free_findings), true);
    assert.deepStrictEqual(decidePurchase(purchaseInputFromRow(stored)), { eligible: false, reason: "nothing_to_unlock" });
    assert.strictEqual(Q.isNoCapObservationOnly([OBS({ description: "CAM charges changed 15.0%. This is within the lease CAM cap of 5%." })]), false);
  });

  await test("NETWORK: no outbound request was attempted by any step above", () => {
    assert.deepStrictEqual(blocked, []);
  });

  console.log(`\nnocap-only-wording: ${passed} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
