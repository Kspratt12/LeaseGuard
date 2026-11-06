/**
 * Customer-facing readiness fixes (from the first-time-customer review): narrow-screen results table, headline total
 * reconciliation, dashboard currency display, pricing clarity and social-preview titles. Calculations, rounding, stored amounts,
 * prices and eligibility are NOT touched and are pinned here. Fictional data only, no database, no AI, no network.
 *
 * Run: npx tsx src/services/__tests__/readiness-fixes.test.ts
 */
delete process.env.ANTHROPIC_API_KEY;

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
// @ts-expect-error the react-dom type package is not installed; the module itself is
import { renderToStaticMarkup } from "react-dom/server";
import { formatMoney } from "../../lib/format";
import { lockedIncludedOf } from "../../lib/quantification";
import { AuditHeadline, ExcludedBreakdown } from "../../components/audit-headline";
import { Pricing } from "../../components/home/pricing";

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  process.stdout.write(`  ✓ ${name}\n`);
}
const SRC = path.join(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8").replace(/\r\n/g, "\n");
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");

const rows = [
  { category: "roof repair", total_expense: 24500, tenant_share_percent: 8.08, tenant_charge: 1979.6, reason: "Excluded Expense" },
  { category: "capital improvement", total_expense: 10000, tenant_share_percent: 8.08, tenant_charge: 808, reason: "Excluded Expense" },
] as never;

(async () => {
  // ── 3. dashboard currency ──
  await t("DASHBOARD: the account page formats the total with the results page's formatter (3338.6 reads $3,338.60)", () => {
    assert.equal(formatMoney(3338.6), "$3,338.60");
    assert.equal(formatMoney(1359), "$1,359");
    const a = read("app/account/page.tsx");
    assert.match(a, /formatMoney\(a\.savings_estimate\)/);
    assert.ok(!/a\.savings_estimate\.toLocaleString/.test(a), "the unpadded toLocaleString is still used");
  });

  // ── 1. narrow-screen results table ──
  await t("NARROW SCREENS: every row's Tenant charge, Total expense, Tenant share and Reason is in a stacked card below sm; the wide table is kept for sm and up", () => {
    const html = renderToStaticMarkup(React.createElement(ExcludedBreakdown, { rows })) as string;
    assert.match(html, /data-testid="breakdown-stacked"/);
    assert.match(html, /<ul[^>]*class="[^"]*sm:hidden/);
    assert.match(html, /<div[^>]*class="[^"]*hidden sm:block[^"]*"[^>]*role="region"/);
    const stacked = html.slice(html.indexOf('data-testid="breakdown-stacked"'), html.indexOf("</ul>"));
    const s = text(stacked);
    for (const must of ["Tenant charge", "$1,979.60", "$24,500.00", "8.08%", "Excluded Expense", "$808.00", "$10,000.00", "roof repair", "capital improvement"]) assert.ok(s.includes(must), "stacked view is missing: " + must);
    assert.equal((stacked.match(/<li /g) || []).length, 2, "one card per row");
    assert.ok(/min-w-\[480px\]/.test(html), "the desktop table is unchanged");
  });

  // ── 2. headline reconciliation ──
  await t("HEADLINE: the note is derived from the audit's own locked findings, shown only while locked, and never hardcoded", () => {
    const paid = [
      { potential_savings: 1359 },
      { potential_savings: 0, quantified: false },
      { potential_savings: 500, insufficientData: true },
    ];
    assert.deepEqual(lockedIncludedOf(paid, false), { amount: 1359, count: 1 });
    assert.deepEqual(lockedIncludedOf([...paid, { potential_savings: 41.5 }], false), { amount: 1400.5, count: 2 });
    assert.equal(lockedIncludedOf(paid, true), null, "no note once unlocked");
    assert.equal(lockedIncludedOf([], false), null);
    assert.equal(lockedIncludedOf(null, false), null);
    assert.equal(lockedIncludedOf([{ potential_savings: 0 }], false), null, "nothing counted, nothing claimed");
    const p = read("app/audit/[id]/page.tsx");
    assert.match(p, /lockedIncludedOf\(paidFindings, unlocked\)/);
    assert.ok(!/1,359|3,338|1359|3338/.test(p), "the reviewed audit's values must not be hardcoded");
  });
  await t("HEADLINE: the sentence renders beside the total in both total-bearing layouts, and is absent when there is no note", () => {
    const base = { unavailable: false, savingsEstimate: 3338.6, breakdown: rows };
    const note = "Includes $1,359 from 1 finding under Additional Findings, itemised when you unlock the report.";
    const withRows = renderToStaticMarkup(React.createElement(AuditHeadline, { ...base, hasOvercharge: true, includedNote: note })) as string;
    const noRows = renderToStaticMarkup(React.createElement(AuditHeadline, { ...base, hasOvercharge: false, breakdown: [], includedNote: note })) as string;
    for (const h of [withRows, noRows]) { assert.match(h, /data-testid="headline-includes"/); assert.ok(text(h).includes(note)); assert.ok(h.indexOf("3,338.60") < h.indexOf("headline-includes"), "the note comes after the total"); }
    for (const h of [renderToStaticMarkup(React.createElement(AuditHeadline, { ...base, hasOvercharge: true })) as string, renderToStaticMarkup(React.createElement(AuditHeadline, { ...base, hasOvercharge: true, includedNote: null })) as string]) assert.ok(!/headline-includes/.test(h));
    assert.ok(text(withRows).includes("$3,338.60"), "the total itself is unchanged");
  });

  // ── 4. pricing clarity ──
  await t("PRICING: 'choose one' is gone; the lead-in says the price depends on the years uploaded; prices, notes and the single CTA are right", () => {
    const html = renderToStaticMarkup(React.createElement(Pricing)) as string;
    const s = text(html);
    assert.ok(s.includes("Your price depends on how many years you upload:"));
    assert.ok(!/choose one|Choose this/i.test(s));
    assert.ok(s.includes("$49") && s.includes("$149") && /one-time/.test(s));
    assert.ok(s.includes("Applies automatically when you upload a single year of statements."));
    assert.ok(s.includes("Applies automatically when your statements cover two to five distinct years."));
    assert.equal((s.match(/Start free preview/g) || []).length, 1, "one discoverable free-preview button in the pricing section");
    assert.match(html, /href="\/upload"/);
  });

  // ── 5. social-preview titles ──
  await t("SOCIAL PREVIEW: the Open Graph and Twitter titles equal the page title; no image is claimed that does not exist", () => {
    const l = read("app/layout.tsx");
    const titles = [...l.matchAll(/^\s*title: "([^"]+)",/gm)].map((m) => m[1]);
    assert.equal(titles.length, 3, "page, openGraph and twitter titles");
    assert.equal(new Set(titles).size, 1, "all three titles are identical: " + titles.join(" | "));
    assert.equal(titles[0], "LeaseGuard | CAM Audit Tool for Commercial Tenants");
    assert.ok(!/images:|og:image/.test(l), "an image must only be declared once a suitable owned asset exists");
  });

  // ── pricing, calculations and structured data are untouched ──
  await t("UNCHANGED: money formatting rules, the pricing disclosure and the structured-data prices", () => {
    assert.equal(formatMoney(0.5), "$0.50");
    assert.equal(formatMoney(24500), "$24,500");
    const home = read("app/page.tsx");
    assert.match(home, /"price": ?"?49|price: ?"?49|49/);
    const p = read("components/home/pricing.tsx");
    assert.match(p, /price: "\$49"/);
    assert.match(p, /price: "\$149"/);
  });

  process.stdout.write(`readiness-fixes: ${n} passed, 0 failed\n`);
  process.exit(0);
})().catch((e) => { process.stdout.write(String(e instanceof Error ? e.stack : e) + "\n"); process.exit(1); });
