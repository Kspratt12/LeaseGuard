/** Run: npx tsx src/lib/__tests__/cam-calculator.test.ts */
import assert from "node:assert";
import { calculateCam, fmtMoney, type CamInput } from "../cam-calculator";

const base: CamInput = {
  totalExpenses: 560540, feePercent: 18, feeAlreadyIncluded: false,
  shareMode: "percent", sharePercent: 8.08, tenantSqFt: null, buildingSqFt: null, statementSharePercent: null,
  estimatedPayments: 40883.2, billedBalance: 12560.93, priorYearTenantTotal: null, capPercent: null,
};

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
function ok(i: CamInput) {
  const o = calculateCam(i);
  assert.ok(o.ok, "expected ok");
  return o as Extract<ReturnType<typeof calculateCam>, { ok: true }>;
}

// Fixture: the fictional statement used across the repo's tests
// ($560,540 expenses + 18% fee = $661,437.20; 8.08% share = $53,444.13; payments $40,883.20; due $12,560.93)
test("known statement fixture: fee, pool, share and balance match the printed figures", () => {
  const { result } = ok(base);
  assert.strictEqual(result.feeAmount, 100897.2);
  assert.strictEqual(result.pool, 661437.2);
  assert.strictEqual(result.tenantShare, 53444.13);
  assert.strictEqual(result.expectedBalance, 12560.93);
  assert.strictEqual(result.comparison.status, "matches");
});

test("a statement balance $200 higher than the arithmetic is reported as a difference, not an overcharge", () => {
  const { result } = ok({ ...base, billedBalance: 12760.93 });
  assert.deepStrictEqual(result.comparison, { status: "statement_higher", difference: 200 });
  assert.ok(!JSON.stringify(result).toLowerCase().includes("overcharg"));
});

test("a statement balance lower than the arithmetic is reported as lower", () => {
  const { result } = ok({ ...base, billedBalance: 12000 });
  assert.strictEqual(result.comparison.status, "statement_lower");
});

test("differences under $1 count as matching (statement rounding)", () => {
  assert.strictEqual(ok({ ...base, billedBalance: 12561.4 }).result.comparison.status, "matches");
});

test("square-footage share: 4,200 / 52,000 sq ft and the statement's rounded 8.08% are flagged as rounding", () => {
  const o = ok({ ...base, shareMode: "sqft", sharePercent: null, tenantSqFt: 4200, buildingSqFt: 52000, statementSharePercent: 8.08 });
  assert.strictEqual(o.result.tenantShare, 53423.77);
  assert.strictEqual(o.result.expectedBalance, 12540.57);
  assert.ok(o.warnings.some((w) => /rounded version/.test(w)));
  assert.deepStrictEqual(o.result.comparison, { status: "statement_higher", difference: 20.36 });
});

test("a statement share far from the square-footage math prompts a check, not a conclusion", () => {
  const o = ok({ ...base, shareMode: "sqft", sharePercent: null, tenantSqFt: 4200, buildingSqFt: 52000, statementSharePercent: 9.5 });
  assert.ok(o.warnings.some((w) => /differs from the square-footage math/.test(w)));
});

test("fee already included in the total is not added twice", () => {
  const o = ok({ ...base, totalExpenses: 110000, feePercent: 10, feeAlreadyIncluded: true, estimatedPayments: null, billedBalance: null });
  assert.strictEqual(o.result.pool, 110000);
  assert.strictEqual(o.result.feeAmount, 10000);
  assert.strictEqual(o.result.expectedBalance, null);
});

test("no fee: pool equals expenses; results rounded to cents", () => {
  const o = ok({ ...base, totalExpenses: 1000.1, feePercent: null, sharePercent: 33.33, estimatedPayments: 300, billedBalance: null });
  assert.strictEqual(o.result.pool, 1000.1);
  assert.strictEqual(o.result.tenantShare, 333.33);
  assert.strictEqual(o.result.expectedBalance, 33.33);
});

test("credit result when payments exceed the share", () => {
  const o = ok({ ...base, estimatedPayments: 60000, billedBalance: null });
  assert.ok((o.result.expectedBalance ?? 0) < 0);
  assert.ok(o.result.steps.some((s) => /Credit/.test(s.label)));
});

test("optional cap check: above, within and not checked", () => {
  const above = ok({ ...base, priorYearTenantTotal: 50000, capPercent: 5 }).result.cap;
  assert.deepStrictEqual(above, { status: "above_cap", allowedMax: 52500, difference: 944.13 });
  const within = ok({ ...base, priorYearTenantTotal: 60000, capPercent: 5 }).result.cap;
  assert.strictEqual(within.status, "within_cap");
  assert.strictEqual(ok(base).result.cap.status, "not_checked");
});

test("missing inputs are named, not guessed", () => {
  const o = calculateCam({ ...base, totalExpenses: null, sharePercent: null });
  assert.ok(!o.ok && o.missing.includes("total operating expenses") && o.missing.includes("your pro-rata share"));
  const sq = calculateCam({ ...base, shareMode: "sqft", sharePercent: null, tenantSqFt: 4200, buildingSqFt: null });
  assert.ok(!sq.ok && sq.missing.includes("the building square footage"));
});

test("invalid inputs are rejected with clear messages", () => {
  const bad = (patch: Partial<CamInput>) => {
    const o = calculateCam({ ...base, ...patch });
    assert.ok(!o.ok && o.errors.length > 0, JSON.stringify(patch));
  };
  bad({ totalExpenses: -1 });
  bad({ sharePercent: 0 });
  bad({ sharePercent: 101 });
  bad({ feePercent: 150 });
  bad({ estimatedPayments: -5 });
  bad({ totalExpenses: Number.NaN });
  bad({ shareMode: "sqft", sharePercent: null, tenantSqFt: 6000, buildingSqFt: 5000 });
  bad({ shareMode: "sqft", sharePercent: null, tenantSqFt: 0, buildingSqFt: 5000 });
});

test("unusual inputs warn: share above 50%, payments far above the share", () => {
  assert.ok(ok({ ...base, sharePercent: 60 }).warnings.some((w) => /above 50%/.test(w)));
  assert.ok(ok({ ...base, estimatedPayments: 500000, billedBalance: null }).warnings.some((w) => /more than double/.test(w)));
});

test("every step shows its formula", () => {
  for (const s of ok(base).result.steps) assert.ok(s.label && s.formula && s.value);
  assert.strictEqual(fmtMoney(-12.5), "-$12.50");
});

console.log(`\ncam-calculator: ${passed} passed, 0 failed`);
