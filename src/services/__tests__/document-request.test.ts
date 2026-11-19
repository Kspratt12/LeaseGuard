/**
 * Audit-rights clauses, window-date arithmetic, the supporting-document request draft, and the paid boundary on the
 * quoted clause. Run: npx tsx src/services/__tests__/document-request.test.ts
 * All lease text is fictional. No network, no AI.
 */
delete process.env.ANTHROPIC_API_KEY;

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { extractAuditRights, parseAuditRights, windowEndDate, WINDOW_CAUTION } from "../../lib/audit-rights";
import { buildDocumentRequest } from "../document-request";
import { buildDisputeLetter } from "../dispute-letter";
import { toPublicAudit } from "../../lib/audit-access";
import type { Finding, LeaseClauseSummary } from "../audit-logic";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const LEASE = fs.readFileSync(path.join(__dirname, "fixtures", "lease-high-confidence.txt"), "utf-8");

async function main() {
  // ---------------- clause extraction ----------------
  await test("fixture lease: the audit-rights sentence is quoted with its 120-day period and trigger", () => {
    const c = extractAuditRights(LEASE);
    assert.strictEqual(c.length, 1, JSON.stringify(c));
    assert.strictEqual(c[0].kind, "audit");
    assert.ok(c[0].quote.startsWith("Tenant shall have the right, at Tenant's expense, to audit Landlord's books and records"));
    assert.deepStrictEqual(c[0].period, { count: 120, unit: "days" });
    assert.strictEqual(c[0].trigger, "receiving the annual reconciliation statement");
  });

  await test("number words, parenthesised digits, months and business days are read as written", () => {
    const one = extractAuditRights("Tenant may audit Landlord's records within one hundred twenty days after delivery of the statement.");
    assert.deepStrictEqual(one[0].period, { count: 120, unit: "days" });
    const two = extractAuditRights("Tenant may inspect Landlord's books and records within ninety (90) days following receipt of the Annual Statement.");
    assert.deepStrictEqual(two[0].period, { count: 90, unit: "days" });
    assert.strictEqual(two[0].trigger, "receipt of the Annual Statement");
    const three = extractAuditRights("Tenant shall have the right to examine Landlord's records for six (6) months after receipt of the reconciliation.");
    assert.deepStrictEqual(three[0].period, { count: 6, unit: "months" });
    const four = extractAuditRights("Any objection to the reconciliation statement must be made within thirty (30) business days of its delivery.");
    assert.strictEqual(four[0].kind, "dispute");
    assert.deepStrictEqual(four[0].period, { count: 30, unit: "business days" });
  });

  await test("a clause with no stated period is quoted with period null, never a default", () => {
    const c = extractAuditRights("Tenant shall have the right to audit Landlord's books and records relating to Operating Expenses.");
    assert.strictEqual(c.length, 1);
    assert.strictEqual(c[0].period, null);
  });

  await test("unrelated sentences are not treated as audit clauses", () => {
    assert.deepStrictEqual(extractAuditRights("Landlord shall review the plans within 30 days. Rent is due monthly in advance on the first day."), []);
    assert.deepStrictEqual(extractAuditRights(""), []);
  });

  await test("page is taken from form-feed page breaks", () => {
    const c = extractAuditRights("Page one text about rent payable monthly.\fTenant may audit Landlord's records within 60 days after receipt of the statement.");
    assert.strictEqual(c[0].page, 2);
  });

  await test("stored JSON is validated: malformed entries are dropped, never trusted", () => {
    const ok = parseAuditRights([{ kind: "audit", quote: "Tenant may audit.", page: 3, period: { count: 120, unit: "days" }, trigger: "receipt" }]);
    assert.strictEqual(ok.length, 1);
    assert.deepStrictEqual(parseAuditRights([{ kind: "evil", quote: "x" }, null, "x", { kind: "audit", quote: "" }]), []);
    assert.strictEqual(parseAuditRights([{ kind: "audit", quote: "q", period: { count: -5, unit: "days" } }])[0].period, null);
    assert.deepStrictEqual(parseAuditRights(undefined), []);
  });

  // ---------------- dates ----------------
  await test("window date: days, months (clamped to month end) and years, from the date the customer entered", () => {
    assert.deepStrictEqual(windowEndDate("2025-02-15", { count: 120, unit: "days" }), { ok: true, date: "2025-06-15", formula: "2025-02-15 + 120 days = 2025-06-15" });
    const m = windowEndDate("2025-01-31", { count: 1, unit: "months" });
    assert.ok(m.ok && m.date === "2025-02-28");
    const leap = windowEndDate("2024-01-31", { count: 1, unit: "months" });
    assert.ok(leap.ok && leap.date === "2024-02-29");
    const y = windowEndDate("2024-02-29", { count: 1, unit: "years" });
    assert.ok(y.ok && y.date === "2025-02-28");
  });

  await test("window date refuses business days, missing periods and invalid dates", () => {
    assert.ok(!windowEndDate("2025-02-15", { count: 30, unit: "business days" }).ok);
    assert.ok(!windowEndDate("2025-02-15", null).ok);
    assert.ok(!windowEndDate("2025-02-30", { count: 30, unit: "days" }).ok);
    assert.ok(!windowEndDate("02/15/2025", { count: 30, unit: "days" }).ok);
  });

  await test("the caution says it is not a legal deadline and names what can change it", () => {
    assert.ok(/not a determination of your legal deadline/.test(WINDOW_CAUTION));
    assert.ok(/receipt|notice|amendments|applicable law/.test(WINDOW_CAUTION));
    assert.ok(!/days left|hurry|act now|expires soon/i.test(WINDOW_CAUTION));
  });

  // ---------------- document request ----------------
  const F = (o: Partial<Finding>): Finding => ({ category: "x", description: "d", potential_savings: 0, severity: "medium", ...o });
  const findings: Finding[] = [
    F({ category: "Admin Fee Above Lease Cap", potential_savings: 1359, severity: "medium" }),
    F({ category: "Tenant Allocation Discrepancy", potential_savings: 0, severity: "high", letterText: "Please explain how my share was determined." }),
    F({ category: "Admin Fee Compliance", potential_savings: 0, severity: "low" }),
  ];
  const summary = (auditRights?: unknown): LeaseClauseSummary =>
    ({ camCap: null, adminFeeCap: "15%", managementFeeCap: null, tenantProRataShare: "8.08%", tenantSquareFootage: null, buildingSquareFootage: null, excludedCategories: [], additionalClauses: [], ...(auditRights ? { auditRights } : {}) }) as LeaseClauseSummary;

  await test("request: one numbered item per item to raise, with the plan's documents; matches are left out", () => {
    const r = buildDocumentRequest({ findings, overchargeBreakdown: [], leaseClausesSummary: summary() });
    assert.deepStrictEqual(r.items.map((i) => i.title).sort(), ["Admin Fee Above Lease Cap", "Tenant Allocation Discrepancy"]);
    assert.ok(r.items.every((i) => i.documents.length > 0));
    assert.ok(r.items.find((i) => /Admin Fee/.test(i.title))!.documents.some((d) => /fee calculation/i.test(d)));
    assert.ok(!r.text.includes("Admin Fee Compliance"), "a compliant item is not raised");
    assert.ok(!/\(ask for/.test(r.text), "internal hints are stripped");
    assert.ok(!/^\s+- The lease/m.test(r.text), "the tenant's own lease is not requested from the landlord");
  });

  await test("request without an audit clause is a plain request: no lease citation", () => {
    const r = buildDocumentRequest({ findings, overchargeBreakdown: [], leaseClausesSummary: summary() });
    assert.strictEqual(r.citedClause, null);
    assert.ok(/I would appreciate copies/.test(r.text));
    assert.ok(!/My lease contains the following provision/.test(r.text));
  });

  await test("request with an audit clause quotes it verbatim but does not claim an entitlement to copies", () => {
    const clauses = extractAuditRights(LEASE);
    const r = buildDocumentRequest({ findings, overchargeBreakdown: [], leaseClausesSummary: summary(clauses) });
    assert.ok(r.citedClause);
    assert.ok(r.text.includes(`"${clauses[0].quote}"`));
    assert.ok(!/entitled|you are required|you must provide|obligat/i.test(r.text));
  });

  await test("request carries no amounts, deadlines, statutes or accusations; unknowns are placeholders", () => {
    const r = buildDocumentRequest({ findings, overchargeBreakdown: [], leaseClausesSummary: summary(extractAuditRights(LEASE)) });
    assert.ok(!/\$\d/.test(r.text), "no amounts");
    assert.ok(!/overcharg|fraud|violat|§|U\.S\.C|statute/i.test(r.text));
    assert.ok(r.placeholders.includes("[response date]") && r.placeholders.includes("[Your name]"));
  });

  await test("request with no items still asks for the general ledger and the share calculation", () => {
    const r = buildDocumentRequest({ findings: [F({ category: "Admin Fee Compliance", severity: "low" })], overchargeBreakdown: [], leaseClausesSummary: null });
    assert.strictEqual(r.items.length, 0);
    assert.ok(/general ledger detail/.test(r.text) && /calculation of my share/.test(r.text));
  });

  await test("the dispute letter is unchanged by the audit-rights record: it adds no dates or periods", () => {
    const withClause = buildDisputeLetter({ findings, overchargeBreakdown: [], leaseClausesSummary: summary(extractAuditRights(LEASE)) });
    assert.ok(!/120 days/.test(withClause.text));
  });

  // ---------------- paid boundary ----------------
  await test("the quoted clause is withheld from the unpaid API response and released after verified payment", () => {
    const row = { id: "a", status: "completed", free_findings: [], lease_clauses_summary: summary(extractAuditRights(LEASE)) };
    const locked = toPublicAudit(row, [], { unlocked: false, tier: "single", amountCents: 4900, reportAvailable: true });
    assert.ok(!("auditRights" in (locked.lease_clauses_summary as object)), "withheld before payment");
    assert.strictEqual((locked.lease_clauses_summary as LeaseClauseSummary).adminFeeCap, "15%", "the rest of the summary is unchanged");
    const open = toPublicAudit(row, [], { unlocked: true, tier: "single", amountCents: 4900, reportAvailable: true });
    assert.strictEqual((open.lease_clauses_summary as LeaseClauseSummary).auditRights?.length, 1);
  });

  console.log(`\ndocument-request: ${passed} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
