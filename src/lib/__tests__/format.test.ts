/** Run: npx tsx src/lib/__tests__/format.test.ts */
import assert from "node:assert";
import { formatUsdFromCents, formatYears } from "../format";

// The checkout button once rendered "Unlock Full Report – 49" (no dollar sign).
assert.strictEqual(formatUsdFromCents(4900), "$49");
assert.strictEqual(formatUsdFromCents(14900), "$149");
assert.strictEqual(formatUsdFromCents(123456), "$1,234.56");
assert.strictEqual(formatUsdFromCents(14950), "$149.50");
assert.strictEqual(formatUsdFromCents(0), "$0");
for (const bad of [null, undefined, -1, Number.NaN]) assert.strictEqual(formatUsdFromCents(bad as number), null);
assert.strictEqual(formatYears(1), "1 year");
assert.strictEqual(formatYears(3), "3 years");
for (const bad of [null, undefined, 0, 1.5]) assert.strictEqual(formatYears(bad as number), null);
console.log("format: 13 assertions passed");
