/**
 * Known-answer tests for the CAM cap and base-year calculator (src/lib/cap-calculator.ts).
 * Run: npx tsx src/lib/__tests__/cap-calculator.test.ts
 *
 * Fixture (fictional): base year 2021 capped expenses $100,000; 2022 $103,000; 2023 $112,000; 2024 $115,000; cap 5%.
 * The same figures give a different answer under each method, which is why the method must be the tenant's choice.
 */
import assert from "node:assert";
import { calculateBaseYear, calculateCap, type CapInput } from "../cap-calculator";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const YEARS = [
  { year: 2021, capped: 100000, uncapped: 40000 },
  { year: 2022, capped: 103000, uncapped: 41000 },
  { year: 2023, capped: 112000, uncapped: 45000 },
  { year: 2024, capped: 115000, uncapped: 47000 },
];
const base: CapInput = { method: "non-cumulative", capPercent: 5, priorBasis: "capped", years: YEARS, amountsAre: "tenant", sharePercent: null };
const run = (over: Partial<CapInput>) => {
  const o = calculateCap({ ...base, ...over });
  assert.ok(o.ok, JSON.stringify(o));
  return o.result;
};
const allowed = (r: ReturnType<typeof run>) => r.rows.map((x) => x.allowedCapped);
const above = (r: ReturnType<typeof run>) => r.rows.map((x) => x.aboveCap);

test("non-cumulative, measured against the prior year's ALLOWED amount", () => {
  const r = run({});
  // 2022: 100,000 x 1.05 = 105,000 (actual 103,000 is within). 2023: 103,000 x 1.05 = 108,150 -> 3,850 above.
  // 2024: allowed for 2023 was 108,150, x 1.05 = 113,557.50 -> 1,442.50 above.
  assert.deepStrictEqual(allowed(r), [null, 105000, 108150, 113557.5]);
  assert.deepStrictEqual(above(r), [0, 0, 3850, 1442.5]);
  assert.strictEqual(r.totalAboveCap, 5292.5);
});

test("non-cumulative, measured against the prior year's ACTUAL expenses", () => {
  const r = run({ priorBasis: "actual" });
  // 2024: 112,000 x 1.05 = 117,600 -> within.
  assert.deepStrictEqual(allowed(r), [null, 105000, 108150, 117600]);
  assert.deepStrictEqual(above(r), [0, 0, 3850, 0]);
  assert.strictEqual(r.totalAboveCap, 3850);
});

test("cumulative, compounding: base x 1.05^n (unused room carries forward)", () => {
  const r = run({ method: "cumulative-compounded" });
  assert.deepStrictEqual(allowed(r), [null, 105000, 110250, 115762.5]);
  assert.deepStrictEqual(above(r), [0, 0, 1750, 0]);
  assert.strictEqual(r.totalAboveCap, 1750);
});

test("cumulative, non-compounding: base x (1 + 5% x n)", () => {
  const r = run({ method: "cumulative-simple" });
  assert.deepStrictEqual(allowed(r), [null, 105000, 110000, 115000]);
  assert.deepStrictEqual(above(r), [0, 0, 2000, 0]);
});

test("the four readings of one 5% cap differ: $5,292.50 / $3,850 / $1,750 / $2,000", () => {
  const totals = [run({}), run({ priorBasis: "actual" }), run({ method: "cumulative-compounded" }), run({ method: "cumulative-simple" })].map((r) => r.totalAboveCap);
  assert.deepStrictEqual(totals, [5292.5, 3850, 1750, 2000]);
});

test("compounding is computed from the base each year, so cents do not drift over 10 years", () => {
  const years = Array.from({ length: 10 }, (_, i) => ({ year: 2015 + i, capped: 123456.78, uncapped: null }));
  const r = run({ method: "cumulative-compounded", capPercent: 3.5, years });
  assert.strictEqual(r.rows[9].allowedCapped, Math.round(123456.78 * Math.pow(1.035, 9) * 100) / 100);
});

test("building amounts are converted to the tenant's share only for the amount above the cap", () => {
  const r = run({ amountsAre: "building", sharePercent: 8.08 });
  assert.strictEqual(r.rows[2].tenantAboveCap, 311.08); // 3,850 x 8.08% = 311.08
  assert.strictEqual(r.rows[3].tenantAboveCap, 116.55); // 1,442.50 x 8.08% = 116.554 -> 116.55
  assert.ok(r.assumptions.some((a) => /8\.08%/.test(a)));
});

test("expenses outside the cap are carried, never limited", () => {
  const r = run({});
  assert.deepStrictEqual(r.rows.map((x) => x.uncapped), [40000, 41000, 45000, 47000]);
  assert.ok(r.notes.some((n) => /not limited/.test(n)));
});

test("every result states the method, the base year, the expense classification and the amendment assumption", () => {
  const a = run({ method: "cumulative-simple" }).assumptions.join(" ");
  for (const s of ["Cumulative, non-compounding", "base year is 2021", "does not decide which expenses are controllable", "amendment"]) assert.ok(a.includes(s), s);
});

test("a missing year is refused, not interpolated", () => {
  const o = calculateCap({ ...base, years: [YEARS[0], YEARS[2], YEARS[3]] });
  assert.ok(!o.ok);
  assert.ok(o.errors.some((e) => /consecutive/.test(e)));
});

test("missing inputs are listed; a $0 base year and out-of-range values are refused", () => {
  const m = calculateCap({ ...base, capPercent: null, years: [YEARS[0]] });
  assert.ok(!m.ok && m.missing.includes("the cap percentage") && m.missing.some((x) => /two years/.test(x)));
  const z = calculateCap({ ...base, years: [{ year: 2021, capped: 0, uncapped: null }, YEARS[1]] });
  assert.ok(!z.ok && z.errors.some((e) => /\$0/.test(e)));
  const bad = calculateCap({ ...base, capPercent: 150 });
  assert.ok(!bad.ok);
  const share = calculateCap({ ...base, amountsAre: "building", sharePercent: null });
  assert.ok(!share.ok && share.missing.some((x) => /pro-rata/.test(x)));
  const neg = calculateCap({ ...base, years: [YEARS[0], { year: 2022, capped: -5, uncapped: null }] });
  assert.ok(!neg.ok);
});

test("no wording calls a result an overcharge", () => {
  const r = run({});
  const text = [...r.assumptions, ...r.notes, ...r.rows.map((x) => x.formula)].join(" ");
  assert.ok(!/overcharg|\bowed\b|recover/i.test(text));
});

// ─────────── base year / expense stop ───────────
test("base year: share x max(0, current - base)", () => {
  const o = calculateBaseYear({ mode: "base-year", currentExpenses: 661437.2, baseYearExpenses: 600000, stopAmount: null, stopPerSqFt: null, buildingSqFt: null, sharePercent: 8.08 });
  assert.ok(o.ok);
  assert.strictEqual(o.increaseOverBase, 61437.2);
  assert.strictEqual(o.tenantAmount, 4964.13); // 61,437.20 x 8.08% = 4,964.126
});

test("expense stop per square foot: stop x building area is the threshold", () => {
  const o = calculateBaseYear({ mode: "expense-stop-psf", currentExpenses: 661437.2, baseYearExpenses: null, stopAmount: null, stopPerSqFt: 11.5, buildingSqFt: 52000, sharePercent: 8.08 });
  assert.ok(o.ok);
  // 11.50 x 52,000 = 598,000; increase 63,437.20; x 8.08% = 5,125.73
  assert.strictEqual(o.increaseOverBase, 63437.2);
  assert.strictEqual(o.tenantAmount, 5125.73);
});

test("expenses at or below the base pass nothing through, and say so", () => {
  const o = calculateBaseYear({ mode: "expense-stop-total", currentExpenses: 500000, baseYearExpenses: null, stopAmount: 520000, stopPerSqFt: null, buildingSqFt: null, sharePercent: 10 });
  assert.ok(o.ok);
  assert.strictEqual(o.tenantAmount, 0);
  assert.ok(/at or below the base/.test(o.assumptions[0]));
});

test("base year states its gross-up and same-categories assumptions; missing inputs are listed", () => {
  const o = calculateBaseYear({ mode: "base-year", currentExpenses: 100, baseYearExpenses: 90, stopAmount: null, stopPerSqFt: null, buildingSqFt: null, sharePercent: 10 });
  assert.ok(o.ok && o.assumptions.some((a) => /grossed up/.test(a)) && o.assumptions.some((a) => /same categories/.test(a)));
  const m = calculateBaseYear({ mode: "expense-stop-psf", currentExpenses: 100, baseYearExpenses: null, stopAmount: null, stopPerSqFt: null, buildingSqFt: null, sharePercent: null });
  assert.ok(!m.ok && m.missing.length === 3);
});

console.log(`\ncap-calculator: ${passed} passed, 0 failed`);
