/** The fictional marketing example must reconcile: every figure shown comes from one set of inputs. Run: npx tsx src/lib/__tests__/sample-data.test.ts */
import assert from "node:assert/strict";
import { SAMPLE_ROWS, SAMPLE_TOTAL, SAMPLE_TOTAL_LABEL, money } from "../../components/home/sample-data";

let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("  ✓", name);
};

t("management fee: 18% of $560,540.00 is $100,897.20; 15% is $84,081.00; share of the $16,816.20 excess is $1,358.75", () => {
  const fee = SAMPLE_ROWS.find((r) => r.id === "fee")!;
  assert.match(fee.statement, /\$100,897\.20/);
  assert.equal(fee.variance, "$1,358.75");
  assert.match(fee.calc, /\$84,081\.00/);
  assert.match(fee.calc, /\$16,816\.20/);
});

t("roof repair: 8.08% of $24,500.00 is $1,979.60", () => {
  assert.equal(SAMPLE_ROWS.find((r) => r.id === "roof")!.variance, "$1,979.60");
});

t("the headline total is exactly the sum of the review rows, and rows that match or lack data add nothing", () => {
  const sum = SAMPLE_ROWS.filter((r) => r.status === "review").reduce((a, r) => a + Math.round(parseFloat(r.variance.replace(/[$,]/g, "")) * 100), 0);
  assert.equal(sum, SAMPLE_TOTAL);
  assert.equal(SAMPLE_TOTAL_LABEL, "$3,338.35");
  assert.equal(money(0), "$0.00");
});

t("every row names its lease and statement source", () => {
  for (const r of SAMPLE_ROWS) {
    assert.match(r.leaseRef, /Lease p\. \d/);
    assert.match(r.statementRef, /Statement p\. \d/);
  }
});

console.log(`sample-data: ${n} passed, 0 failed`);
