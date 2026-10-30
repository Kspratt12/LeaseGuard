/**
 * Money shown to customers must add up: a total is the exact sum of the amounts listed under it, and display rounding
 * is never presented as an exact sum.
 * Run: npx tsx src/lib/__tests__/money-consistency.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { formatMoney } from "../format";
import { totalSavings } from "../../services/savings-math";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log("  ✓", name);
}

t("$1,359 + $1,979.60 is $3,338.60 and is never shown as $3,339", () => {
  const total = totalSavings([{ potential_savings: 1359 }], 1979.6);
  assert.equal(total, 3338.6);
  assert.equal(formatMoney(total), "$3,338.60");
  assert.notEqual(formatMoney(total), "$3,339");
});

t("floating point sums are settled to the cent", () => {
  assert.equal(totalSavings([{ potential_savings: 0.1 }, { potential_savings: 0.2 }], 0), 0.3);
  assert.equal(formatMoney(totalSavings([{ potential_savings: 1979.6 }, { potential_savings: 1359 }], 0.05)), "$3,338.65");
});

t("whole-dollar amounts stay whole; amounts with cents always show two decimals", () => {
  assert.equal(formatMoney(1359), "$1,359");
  assert.equal(formatMoney(1979.6), "$1,979.60");
  assert.equal(formatMoney(0.5), "$0.50");
  assert.equal(formatMoney(1234567.891), "$1,234,567.89");
  assert.equal(formatMoney(0), "$0");
  assert.equal(formatMoney(null), "$0");
  assert.equal(formatMoney(NaN), "$0");
});

t("the formatter and the totals agree with each other for many random amounts", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 500; i++) {
    const a = Math.round(rnd() * 500000) / 100;
    const b = Math.round(rnd() * 500000) / 100;
    const total = totalSavings([{ potential_savings: a }], b);
    const cents = Math.round(a * 100) + Math.round(b * 100);
    assert.equal(Math.round(total * 100), cents, `${a} + ${b}`);
  }
});

t("no customer-facing screen formats a dollar amount with a bare toLocaleString() (it prints $1,979.6)", () => {
  const SRC = path.join(__dirname, "../..");
  const walk = (d: string, out: string[] = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "__tests__" && e.name !== "admin") walk(f, out); }
      else if (/\.tsx?$/.test(e.name)) out.push(f);
    }
    return out;
  };
  const bad = walk(SRC)
    .filter((f) => !/upload[\\/]route\.ts$/.test(f)) // a server log line
    // square footage is fine; a literal "$" directly before the formatted number is the dollar case
    // (in .ts template strings that is "$${...}", in .tsx markup it is "${...}")
    .filter((f) => (/\.tsx$/.test(f) ? /\$\{[^}]*\.toLocaleString\(\)\}/ : /\$\$\{[^}]*\.toLocaleString\(\)\}/).test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(SRC, f));
  assert.deepEqual(bad, [], "use formatMoney() for dollar amounts");
});

t("the prices shown on the website are exactly the amounts the checkout charges", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TIERS } = require("../payments") as typeof import("../payments");
  const pricing = fs.readFileSync(path.join(__dirname, "../../components/home/pricing.tsx"), "utf8");
  const shown = [...pricing.matchAll(/price:\s*"(\$[\d,]+)"/g)].map((m) => m[1]);
  assert.deepEqual(shown, [formatMoney(TIERS.single.amount / 100), formatMoney(TIERS.multi.amount / 100)]);
  assert.equal(TIERS.single.amount, 4900);
  assert.equal(TIERS.multi.amount, 14900);
});

console.log(`money-consistency: ${n} passed, 0 failed`);
