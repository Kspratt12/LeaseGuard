/**
 * Pro-rata share: known-answer tests for the consolidated share check (src/services/share-math.ts and section 3 of
 * src/services/audit-logic.ts).
 *
 * Run: npx tsx src/services/__tests__/share-allocation.test.ts
 *
 * Regression: with the statement billing 10.00% against a lease share of 8.08%, four overlapping checks each added an
 * amount (free "Tenant Allocation Discrepancy" $1,272, paid "Pro-Rata Share Mismatch" $1,270, paid "CAM Allocation
 * Discrepancy" $1,272, paid "Tenant Allocation Discrepancy" $1,272), a $5,086 headline for one discrepancy, and each was
 * the TENANT's charge x the percentage-point gap. The statement's own arithmetic gives $661,437.20 x 1.92 = $12,699.59.
 *
 * All documents are fictional fixtures. The AI step is disabled, so nothing leaves the machine.
 */
delete process.env.ANTHROPIC_API_KEY;

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  computeShareMisallocation,
  findSharePool,
  parsePercent,
  resolveExpectedShare,
  shareMismatchThreshold,
} from "../share-math";

const FIX = path.join(__dirname, "fixtures");
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

const LEASE = fs.readFileSync(path.join(FIX, "lease-high-confidence.txt"), "utf-8");
const RECON = fs.readFileSync(path.join(FIX, "recon-high-confidence.txt"), "utf-8");

/** The fixture statement re-billed at another share, with the tenant charge recomputed from the same $661,437.20 pool. */
function reconAtShare(share: string, charge: string) {
  return RECON.replace("Tenant's Pro-Rata Share: 8.08%", `Tenant's Pro-Rata Share: ${share}%`)
    .replace("Tenant's Share (8.08%)                                 $53,444.13", `Tenant's Share (${share}%)                                $${charge}`)
    .replace("Total CAM charges for your suite: $53,444.13", `Total CAM charges for your suite: $${charge}`);
}

const SHARE_CATS = /allocation|pro-?rata|share/i;

async function main() {
  // ---------------- pure arithmetic ----------------
  await test("parsePercent accepts '8.08', '8.08%' and rejects junk, 0 and 100+", () => {
    assert.strictEqual(parsePercent("8.08"), 8.08);
    assert.strictEqual(parsePercent(" 8.08% "), 8.08);
    assert.strictEqual(parsePercent("abc"), null);
    assert.strictEqual(parsePercent("0"), null);
    assert.strictEqual(parsePercent("100"), null);
    assert.strictEqual(parsePercent(null), null);
  });

  await test("expected share: a stated percentage is preferred; square footage only when none is stated", () => {
    const both = resolveExpectedShare({ statedPercent: "8.08", tenantSqFt: 4200, buildingSqFt: 52000 });
    assert.deepStrictEqual([both.value, both.basis, both.conflict], [8.08, "stated", false]);
    const sq = resolveExpectedShare({ statedPercent: null, tenantSqFt: 4200, buildingSqFt: 52000 });
    assert.strictEqual(sq.basis, "square-footage");
    assert.ok(Math.abs(sq.value! - 8.076923) < 1e-5);
    const none = resolveExpectedShare({ statedPercent: null, tenantSqFt: null, buildingSqFt: 52000 });
    assert.deepStrictEqual([none.value, none.basis], [null, null]);
  });

  await test("expected share: a stated share that disagrees with the square footage is a conflict, not a choice", () => {
    const c = resolveExpectedShare({ statedPercent: "9.50", tenantSqFt: 4200, buildingSqFt: 52000 });
    assert.strictEqual(c.value, null);
    assert.strictEqual(c.conflict, true);
    assert.strictEqual(c.stated, 9.5);
  });

  await test("mismatch threshold: exact for a stated share, half a point for square footage", () => {
    assert.strictEqual(shareMismatchThreshold("stated"), 0.01);
    assert.strictEqual(shareMismatchThreshold("square-footage"), 0.5);
  });

  await test("pool search finds the amount the statement applied its share to (pool x share = charge)", () => {
    const p = findSharePool({ statementText: reconAtShare("10.00", "66,143.72"), billedShare: 10, candidateCharges: [66143.72, 560540] });
    assert.ok(p);
    assert.strictEqual(p!.pool, 661437.2);
    assert.strictEqual(p!.tenantCharge, 66143.72);
    assert.ok(/Total Building Expenses/.test(p!.poolLine ?? ""), `pool line: ${p!.poolLine}`);
  });

  await test("pool search returns null when no figure on the statement explains the charge", () => {
    const text = "Tenant share 10.00%\nAmount due $12,560.93\nOperating expenses $77,777.00";
    assert.strictEqual(findSharePool({ statementText: text, billedShare: 10, candidateCharges: [12560.93] }), null);
  });

  await test("misallocation = charge billed - pool x expected share (to the cent); never negative", () => {
    // 661,437.20 x 8.08% = 53,444.1258 -> 53,444.13 (the figure the original statement prints); 66,143.72 - 53,444.13 = 12,699.59
    assert.strictEqual(computeShareMisallocation({ pool: 661437.2, tenantCharge: 66143.72, billedShare: 10, expectedShare: 8.08 }), 12699.59);
    assert.strictEqual(computeShareMisallocation({ pool: 661437.2, tenantCharge: 46300.6, billedShare: 7, expectedShare: 8.08 }), 0);
    assert.strictEqual(computeShareMisallocation({ pool: 661437.2, tenantCharge: 53444.13, billedShare: 8.08, expectedShare: 8.08 }), 0);
    assert.strictEqual(computeShareMisallocation({ pool: null, tenantCharge: 66143.72, billedShare: 10, expectedShare: 8.08 }), 0);
    assert.strictEqual(computeShareMisallocation({ pool: 661437.2, tenantCharge: null, billedShare: 10, expectedShare: 8.08 }), 0);
  });

  await test("a statement that prints a rounded share still matches, and the amount uses the charge actually billed", () => {
    // True share 4,200/41,000 = 10.2439%; printed "10.24%". Pool $500,000 -> charge $51,219.51 (pool x true share).
    // pool x printed share = $51,200.00, $19.51 off: inside the tolerance for a 2-decimal share (0.5 x 0.01 / 10.24 = 0.049%).
    const text = "Total Operating Expenses $500,000.00\nYour share (10.24%) $51,219.51";
    const p = findSharePool({ statementText: text, billedShare: 10.24, billedShareDecimals: 2, candidateCharges: [51219.51] });
    assert.ok(p && p.pool === 500000);
    // expected 8.00%: 500,000 x 8% = 40,000; 51,219.51 - 40,000 = 11,219.51 (not 500,000 x 2.24% = 11,200)
    assert.strictEqual(computeShareMisallocation({ pool: 500000, tenantCharge: 51219.51, billedShare: 10.24, expectedShare: 8 }), 11219.51);
  });

  await test("pool search: budget/payment lines are never pools; two matching pools is ambiguous; a whole-number share is not matched", () => {
    const budget = "Total Budget $661,437.20\nTenant charge $66,143.72";
    assert.strictEqual(findSharePool({ statementText: budget, billedShare: 10, candidateCharges: [66143.72] }), null);
    const two = "Total Operating Expenses $661,437.20\nTotal Recoverable Expenses $661,440.00\nTenant charge $66,143.72";
    assert.strictEqual(findSharePool({ statementText: two, billedShare: 10, candidateCharges: [66143.72] }), null, "ambiguous");
    const whole = "Total Operating Expenses $661,437.20\nTenant charge $66,143.72";
    assert.strictEqual(findSharePool({ statementText: whole, billedShare: 10, billedShareDecimals: 0, candidateCharges: [66143.72] }), null);
    assert.ok(findSharePool({ statementText: whole, billedShare: 10, billedShareDecimals: 2, candidateCharges: [66143.72] }));
  });

  await test("invalid and extreme shares: zero, negative, 100% and non-numbers are rejected", () => {
    for (const bad of ["0", "-5", "100", "150", "", "n/a"]) assert.strictEqual(parsePercent(bad), null, bad);
    assert.strictEqual(parsePercent("99.99"), 99.99);
    assert.strictEqual(findSharePool({ statementText: "Total $100.00", billedShare: 0, candidateCharges: [1] }), null);
  });

  // ---------------- full pipeline (regex extraction only) ----------------
  const { validateDocuments } = await import("../document-validator");
  const { runAudit } = await import("../audit-logic");
  const { buildDisputeLetter } = await import("../dispute-letter");
  const leasePdf = await textToPdf(LEASE);
  const run = async (reconText: string, leaseText = LEASE) => {
    const v = await validateDocuments(leaseText === LEASE ? leasePdf : await textToPdf(leaseText), await textToPdf(reconText));
    const r = await runAudit(v);
    const all = [...r.free_findings, ...r.paid_findings];
    return { r, all, share: all.filter((f) => SHARE_CATS.test(f.category)) };
  };

  const over = await run(reconAtShare("10.00", "66,143.72"));
  await test("overbilled 10.00% vs lease 8.08%: exactly ONE share finding carries an amount, and it is $12,700", () => {
    const withAmount = over.share.filter((f) => f.potential_savings > 0);
    assert.strictEqual(withAmount.length, 1, over.share.map((f) => `${f.category}:${f.potential_savings}`).join(", "));
    assert.strictEqual(withAmount[0].category, "Tenant Allocation Discrepancy");
    assert.strictEqual(withAmount[0].potential_savings, 12700);
    assert.strictEqual(over.share.length, 1, "no second finding for the same discrepancy");
  });
  await test("overbilled: the finding carries a structured identity and its inputs, and the inputs reproduce the amount", () => {
    const f = over.share[0];
    assert.strictEqual(f.checkId, "pro-rata-share");
    assert.deepStrictEqual(f.calc, { kind: "share", billedShare: 10, expectedShare: 8.08, expectedBasis: "stated", pool: 661437.2, tenantCharge: 66143.72 });
    const c = f.calc as { pool: number; tenantCharge: number; billedShare: number; expectedShare: number };
    assert.strictEqual(Math.round(computeShareMisallocation(c)), f.potential_savings);
  });
  await test("overbilled: the description shows inputs, pool, formula, exact result and rounding, and stays qualified", () => {
    const d = over.share[0].description;
    for (const s of ["10%", "8.08%", "$661,437.20", "$66,143.72", "$53,444.13", "$66,143.72 - $53,444.13 = $12,699.59", "rounded to $12,700", "not a confirmed overcharge"]) {
      assert.ok(d.includes(s), `missing "${s}" in: ${d}`);
    }
    assert.ok(!/overbilled|recoverable|you are owed/i.test(d));
  });
  await test("overbilled: evidence quotes the lease share, the billed share and the pool line", () => {
    const ev = over.share[0].sourceEvidence ?? [];
    assert.ok(ev.some((e) => /8\.08%/.test(e.extractedText) && /lease/i.test(e.document)), "lease share");
    assert.ok(ev.some((e) => /10\.00%/.test(e.extractedText)), "billed share");
    assert.ok(ev.some((e) => /661,437\.20/.test(e.extractedText) && e.findingCategory === "Amount the Share Was Applied To"), "pool");
  });
  await test("overbilled: the headline includes the share amount once", () => {
    const counted = over.all.filter((f) => !f.insufficientData && f.quantified !== false).reduce((s, f) => s + f.potential_savings, 0);
    assert.strictEqual(over.r.savings_estimate, Math.round((counted + over.r.estimated_overcharge) * 100) / 100);
    assert.ok(over.r.savings_estimate >= 12700 && over.r.savings_estimate < 12700 * 2);
  });
  await test("overbilled: the letter lists the share item once, as an adjustment, and its total equals the headline", () => {
    const l = buildDisputeLetter({ findings: over.all, overchargeBreakdown: over.r.overcharge_breakdown, leaseClausesSummary: over.r.leaseClausesSummary });
    const items = l.items.filter((i) => SHARE_CATS.test(i.title));
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].kind, "adjustment");
    assert.strictEqual(items[0].amount, 12700);
    assert.strictEqual(l.total, over.r.savings_estimate);
  });

  const under = await run(reconAtShare("7.00", "46,300.60"));
  await test("underbilled 7.00% vs 8.08%: a low note with $0, never savings and never raised in the letter", () => {
    assert.strictEqual(under.share.length, 1);
    const f = under.share[0];
    assert.strictEqual(f.category, "Pro-Rata Share Below Lease Share");
    assert.strictEqual(f.potential_savings, 0);
    assert.strictEqual(f.severity, "low");
    const l = buildDisputeLetter({ findings: under.all, overchargeBreakdown: under.r.overcharge_breakdown, leaseClausesSummary: under.r.leaseClausesSummary });
    assert.ok(!l.items.some((i) => SHARE_CATS.test(i.title)), "underbilling is not raised with the landlord");
  });

  const same = await run(RECON);
  await test("billed share equals the lease share: no share finding at all", () => {
    assert.strictEqual(same.share.length, 0, same.share.map((f) => f.category).join(", "));
  });

  // No figure on the statement equals pool x share: remove the building totals so the charge cannot be explained.
  const noPool = await run(
    reconAtShare("10.00", "66,143.72")
      .replace(/Subtotal Operating Expenses.*\n/, "")
      .replace(/Total Building Expenses.*\n/, ""),
  );
  await test("overbilled but the pool is not shown: the discrepancy is raised as a question with no amount", () => {
    assert.strictEqual(noPool.share.length, 1);
    const f = noPool.share[0];
    assert.strictEqual(f.potential_savings, 0);
    assert.strictEqual(f.severity, "high");
    assert.ok(/no dollar amount is calculated/i.test(f.description));
    const l = buildDisputeLetter({ findings: noPool.all, overchargeBreakdown: noPool.r.overcharge_breakdown, leaseClausesSummary: noPool.r.leaseClausesSummary });
    const items = l.items.filter((i) => SHARE_CATS.test(i.title));
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].kind, "clarify");
    assert.strictEqual(items[0].amount, null);
    assert.ok(/Please explain how my share was determined/.test(items[0].explanation), "first-person wording for the landlord");
  });

  const conflictLease = LEASE.replace("Building Operating Expenses shall be 8.08%", "Building Operating Expenses shall be 9.50%");
  const conflict = await run(reconAtShare("10.00", "66,143.72"), conflictLease);
  await test("lease states 9.50% but its square footage gives 8.08%: no expected share is assumed and no amount is counted", () => {
    const f = conflict.share.find((x) => x.category === "Pro-Rata Share Review");
    assert.ok(f, conflict.share.map((x) => x.category).join(", "));
    assert.strictEqual(f!.potential_savings, 0);
    assert.ok(/9\.5%/.test(f!.description) && /8\.0769%/.test(f!.description));
    assert.ok(!conflict.share.some((x) => x.potential_savings > 0));
  });

  console.log(`\nshare-allocation: ${passed} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
