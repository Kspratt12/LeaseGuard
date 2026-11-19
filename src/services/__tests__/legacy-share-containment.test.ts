/**
 * Read-time containment of audits stored with the earlier pro-rata share amounts.
 * Run: npx tsx src/services/__tests__/legacy-share-containment.test.ts
 *
 * fixtures/legacy-share-audit.json was produced by the PRE-FIX engine on fictional fixtures (statement billed at 10.00%
 * against a lease share of 8.08%): four share findings, $1,272 + $1,270 + $1,272 + $1,272 = $5,086 headline for one
 * discrepancy, each priced as the tenant's charge x the percentage-point gap.
 */
delete process.env.ANTHROPIC_API_KEY;

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { containLegacyAudit } from "../../lib/legacy-containment";
import { comparisonStatusOf, quantificationNotice } from "../../lib/quantification";
import { buildDisputeLetter } from "../dispute-letter";
import { decidePurchase, purchaseInputFromRow } from "../../lib/purchase-eligibility";
import { toPublicAudit } from "../../lib/audit-access";
import type { Finding, LeaseClauseSummary } from "../audit-logic";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const FIX = path.join(__dirname, "fixtures");
const legacy = JSON.parse(fs.readFileSync(path.join(FIX, "legacy-share-audit.json"), "utf-8")) as Record<string, unknown>;
const SHARE = /allocation|pro-?rata|share/i;
const all = (r: Record<string, unknown>) => [...((r.free_findings as Finding[]) ?? []), ...((r.paid_findings as Finding[]) ?? [])];

async function main() {
  await test("the fixture really is the legacy pattern: four share findings, $5,086 headline", () => {
    const share = all(legacy).filter((f) => SHARE.test(f.category));
    assert.strictEqual(share.length, 4);
    assert.strictEqual(legacy.savings_estimate, 5086);
  });

  const c = containLegacyAudit(legacy);

  await test("the four collapse into ONE share item with no amount, keeping the stored percentages", () => {
    const share = all(c).filter((f) => SHARE.test(f.category));
    assert.strictEqual(share.length, 1, share.map((f) => f.category).join(", "));
    assert.strictEqual(share[0].category, "Tenant Allocation Discrepancy");
    assert.strictEqual(share[0].potential_savings, 0);
    assert.strictEqual(share[0].severity, "high");
    assert.ok(share[0].description.startsWith("The statement applies a tenant share of 10.00%, and the expected share recorded by this review is 8.08%."));
    assert.ok(/earlier version/i.test(share[0].description) && /No amount is counted/.test(share[0].description));
  });

  await test("the evidence quoted from the documents is kept as stored", () => {
    const original = (legacy.free_findings as Finding[]).find((f) => f.category === "Tenant Allocation Discrepancy")!;
    const kept = all(c).find((f) => f.category === "Tenant Allocation Discrepancy")!;
    assert.deepStrictEqual(kept.sourceEvidence, original.sourceEvidence);
  });

  await test("the headline reconciles under the documented rule: $5,086 - $5,086 withheld = $0", () => {
    assert.strictEqual(c.savings_estimate, 0);
    assert.ok(!comparisonStatusOf(c.lease_clauses_summary as LeaseClauseSummary)?.headlineUnavailable);
  });

  await test("the notice states the share correction, not the cap/gross-up correction", () => {
    const status = comparisonStatusOf(c.lease_clauses_summary as LeaseClauseSummary)!;
    assert.strictEqual(status.legacyShareContained, true);
    assert.ok(!status.legacyContained, "no cap or gross-up amount was contained");
    const lines = quantificationNotice(status)!.lines.join(" ");
    assert.ok(/pro-rata share amount is no longer shown/.test(lines));
    assert.ok(!/cap and gross-up calculations/.test(lines));
  });

  await test("idempotent: containing the contained row changes nothing", () => {
    assert.deepStrictEqual(containLegacyAudit(c), c);
  });

  await test("the stored row is not mutated", () => {
    assert.strictEqual(legacy.savings_estimate, 5086);
    assert.strictEqual(all(legacy).filter((f) => SHARE.test(f.category)).length, 4);
  });

  await test("the letter raises the share once as a question, with no amount, and its total matches the contained headline", () => {
    const l = buildDisputeLetter({ findings: all(c), overchargeBreakdown: (c.overcharge_breakdown as never) ?? [], leaseClausesSummary: c.lease_clauses_summary as LeaseClauseSummary });
    const items = l.items.filter((i) => SHARE.test(i.title));
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].kind, "clarify");
    assert.ok(/Please explain how my share was determined/.test(items[0].explanation));
    assert.strictEqual(l.total, c.savings_estimate);
  });

  await test("the letter built straight from the stored lists (no row adapter) also lists the share once", () => {
    const l = buildDisputeLetter({ findings: all(legacy), overchargeBreakdown: [], leaseClausesSummary: legacy.lease_clauses_summary as LeaseClauseSummary });
    assert.strictEqual(l.items.filter((i) => SHARE.test(i.title)).length, 1);
    assert.ok(!l.items.some((i) => i.amount != null && i.amount > 0 && SHARE.test(i.title)));
  });

  await test("the audit remains purchasable: the share difference is still an item to raise", () => {
    const d = decidePurchase(purchaseInputFromRow({ ...legacy, audit_mode: "full", confidence: "high" }));
    assert.strictEqual(d.eligible, true);
  });

  await test("the locked teaser shows no withheld share amount", () => {
    const t = toPublicAudit({ ...legacy, id: "x", status: "completed" }, legacy.paid_findings, { unlocked: false, tier: "single", amountCents: 4900, reportAvailable: true });
    const teaser = [...((t.free_findings as Finding[]) ?? []), ...((t.paid_findings as Finding[]) ?? [])];
    assert.ok(!teaser.some((f) => SHARE.test(f.category) && f.potential_savings > 0));
    assert.strictEqual(t.savings_estimate, 0);
  });

  await test("an underbilled legacy share is contained as a low note that the letter does not raise", () => {
    const f: Finding = {
      category: "Pro-Rata Share Mismatch",
      description: "The reconciliation applies a tenant share of 7%, but the lease specifies 8.08% based on rentable square footage. This 1.08% difference means the tenant is being underbilled. Estimated annual impact: $577.",
      potential_savings: 577,
      severity: "high",
    };
    const r = containLegacyAudit({ free_findings: [], paid_findings: [f], savings_estimate: 577, estimated_overcharge: 0 });
    const out = (r.paid_findings as Finding[])[0];
    assert.strictEqual(out.category, "Pro-Rata Share Below Lease Share");
    assert.strictEqual(out.potential_savings, 0);
    assert.strictEqual(out.severity, "low");
    assert.strictEqual(out.letterText, "");
    assert.strictEqual(r.savings_estimate, 0);
  });

  await test("an unrelated finding with a share-like category but different wording is left exactly as stored", () => {
    const f: Finding = { category: "Tenant Allocation Discrepancy", description: "The statement applies a tenant share of 10%. (new engine wording)", potential_savings: 12700, severity: "high" };
    const row = { free_findings: [f], paid_findings: [], savings_estimate: 12700 };
    assert.strictEqual(containLegacyAudit(row), row);
  });

  console.log(`\nlegacy-share-containment: ${passed} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
