/** "Where to look" index (src/lib/source-index.ts). Run: npx tsx src/lib/__tests__/source-index.test.ts */
import assert from "node:assert";
import { buildSourceIndex } from "../source-index";
import { applyInputOverrides } from "../input-overrides";
import { shareFinding } from "../../services/share-math";
import type { Finding } from "../../services/audit-logic";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const F = (category: string, ev: Finding["sourceEvidence"]): Finding => ({ category, description: "d", potential_savings: 0, severity: "medium", sourceEvidence: ev });

test("groups by document, pages in order, unrecorded pages last; quotes kept verbatim (whitespace normalised)", () => {
  const idx = buildSourceIndex(
    [
      F("A", [{ document: "Lease.pdf", page: 3, extractedText: "Section 3.5   Audit  Rights" }, { document: "Statement.pdf", page: null, extractedText: "Total $1.00" }]),
      F("B", [{ document: "Lease.pdf", page: 1, extractedText: "Premises" }, { document: "Lease.pdf", page: null, extractedText: "No page" }]),
    ],
    [{ category: "roof repair", total_expense: 1, tenant_share_percent: 1, tenant_charge: 0.01, reason: "Excluded Expense", sourceEvidence: { document: "Statement.pdf", page: 2, extractedText: "Roof Repair $24,500.00" } }],
  );
  assert.deepStrictEqual(idx.map((d) => d.document), ["Lease.pdf", "Statement.pdf"]);
  assert.deepStrictEqual(idx[0].pages.map((p) => p.page), [1, 3, null]);
  assert.strictEqual(idx[0].pages[1].quotes[0].quote, "Section 3.5 Audit Rights");
  assert.deepStrictEqual(idx[1].pages.map((p) => p.page), [2, null]);
  assert.strictEqual(idx[1].pages[0].quotes[0].item, "Excluded expense: roof repair");
});

test("empty, malformed and duplicate evidence is ignored; invalid page numbers become 'not recorded'", () => {
  const idx = buildSourceIndex(
    [
      F("A", [{ document: "L", page: 0, extractedText: "x" }, { document: "L", page: 2.5, extractedText: "y" }, { document: "L", page: 1, extractedText: "   " }]),
      F("A", [{ document: "L", page: 0, extractedText: "x" }]),
      { category: "C", description: "d", potential_savings: 0, severity: "low" },
      null as unknown as Finding,
    ],
    [],
  );
  assert.strictEqual(idx.length, 1);
  assert.deepStrictEqual(idx[0].pages.map((p) => [p.page, p.quotes.map((q) => q.quote)]), [[null, ["x", "y"]]]);
  assert.deepStrictEqual(buildSourceIndex([], []), []);
});

test("page references survive the corrected view (corrections never touch evidence)", () => {
  const f = {
    ...shareFinding({ kind: "share", billedShare: 10, expectedShare: 8.08, expectedBasis: "stated", pool: 661437.2, tenantCharge: 66143.72 }, { expectedSentence: "" }),
    sourceEvidence: [{ document: "Lease.pdf", page: 2, extractedText: "shall be 8.08%" }],
  } as Finding;
  const row = { free_findings: [f], paid_findings: [], savings_estimate: 12700 };
  const out = applyInputOverrides(row, { version: 1, values: { "share.expectedShare": { value: 9, original: 8.08, at: "t" } } });
  const idx = buildSourceIndex(out.free_findings as Finding[], []);
  assert.deepStrictEqual(idx[0].pages[0], { page: 2, quotes: [{ item: "Tenant Allocation Discrepancy", quote: "shall be 8.08%" }] });
});

console.log(`\nsource-index: ${passed} passed, 0 failed`);
