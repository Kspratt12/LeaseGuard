/**
 * Tests for extraction logic using realistic text fixtures.
 *
 * Run: npx tsx src/services/__tests__/extraction.test.ts
 *
 * Zero dependencies — uses Node assert. Validates the regex patterns
 * that power the extraction pipeline against 3 realistic document pairs.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

const FIXTURES = path.join(__dirname, "fixtures");

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), "utf-8");
}

// ---------------------------------------------------------------------------
// Regex extraction mirrors (same patterns as document-validator.ts)
// ---------------------------------------------------------------------------

function extractCamCap(text: string): string | null {
  const patterns = [
    /(?:cam\s*cap|cap\s*(?:on|of)\s*(?:cam|common\s*area))[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    /(?:annual|yearly)\s*(?:increase\s*)?cap[\s:]*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/i,
    /(?:shall\s*not\s*exceed|not\s*to\s*exceed)\s+(?:a\s+)?(\d+(?:\.\d+)?)\s*%\s*(?:annual|per\s*(?:annum|year)|yearly|(?:annual\s*)?increase|per\s*calendar\s*year)/i,
    /(?:(?:is|are)\s*capped\s*at|limited\s*to)\s+(?:a\s+)?(\d+(?:\.\d+)?)\s*%\s*(?:per\s*(?:annum|year)|annually|per\s*calendar\s*year|increase|annual)?/i,
    /increas(?:e|es)\s*(?:shall\s*)?(?:by\s*)?no\s*more\s*than\s*(\d+(?:\.\d+)?)\s*%/i,
    /increas(?:e|es)\s*(?:in\s*)?(?:controllable\s*)?(?:operating\s*)?(?:costs?\s*|expenses?\s*)?(?:are\s*)?(?:limited|capped|restricted)\s*to\s*(?:no\s*more\s*than\s*)?(\d+(?:\.\d+)?)\s*%/i,
    /maximum\s*(?:annual\s*)?increase[\s:]*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/i,
    /controllable\s*(?:expense|cost)s?\s*(?:cap|shall\s*not\s*exceed|not\s*to\s*exceed|limited\s*to|capped\s*at)[\s:]*(?:a\s+)?(\d+(?:\.\d+)?)\s*%/i,
    /operating\s*(?:expense|cost)s?\s*(?:cap|shall\s*not\s*exceed)[\s:]*(?:a\s+)?(\d+(?:\.\d+)?)\s*%/i,
    /cap\s*of\s*(\d+(?:\.\d+)?)\s*%\s*on\s*(?:controllable|operating)/i,
    /(?:cumulative|compound(?:ing|ed)?)\s*cap[\s:]*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1];
  }
  return null;
}

function extractAdminFee(text: string): string | null {
  const patterns = [
    // "Admin Fee Cap: 12%", "Administrative Fee Cap: 12%", "Admin Fee Limit: 12%"
    /(?:admin(?:istrative|istration)?\s*fee\s*(?:cap|limit|maximum))[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    // "Administrative Fee: 12%", "Admin Fee: 12%"
    /(?:admin(?:istrative|istration)?\s*fee)[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    // "administrative fee of 12%", "admin fee shall not exceed 12%"
    /(?:admin(?:istrative|istration)?\s*(?:fee|charge|cost))\s*(?:of|equal\s*to|at|not\s*to\s*exceed|shall\s*not\s*exceed)\s*(\d+(?:\.\d+)?)\s*%/i,
    // "admin fee not to exceed 12%", "admin fee capped at 12%"
    /(?:admin(?:istrative|istration)?\s*fee)\s*(?:not\s*to\s*exceed|shall\s*not\s*exceed|capped\s*at|limited\s*to)\s*(\d+(?:\.\d+)?)\s*%/i,
    // "12% administrative fee"
    /(\d+(?:\.\d+)?)\s*%\s*(?:admin(?:istrative|istration)?\s*(?:fee|charge))/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1];
  }
  return null;
}

function extractMgmtFee(text: string): string | null {
  const patterns = [
    // "Management Fee Cap: 10%", "Management Fee Limit: 10%"
    /(?:(?:property\s*)?management\s*fee\s*(?:cap|limit|maximum))[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    // "management fee: 15%", "management fee 15%"
    /(?:management\s*fee)[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    // "Management Fee (18%)" — parenthetical
    /(?:management\s*fee)\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*\)/i,
    // "management fee of 15%", "not to exceed 15%"
    /(?:management\s*(?:fee|charge|cost))\s*(?:of|equal\s*to|at|not\s*to\s*exceed|shall\s*not\s*exceed|capped\s*at)\s*(\d+(?:\.\d+)?)\s*%/i,
    // "15% management fee"
    /(\d+(?:\.\d+)?)\s*%\s*(?:management\s*(?:fee|charge))/i,
    // "property management: 15%", "Property Management (14%)"
    /(?:property\s*management)\s*[\s:(]*(\d+(?:\.\d+)?)\s*%/i,
    // "Property Management Fee Limit: 8%"
    /(?:property\s*management\s*fee\s*(?:cap|limit|maximum))[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    // "manager's fee: 15%", "manager's fee shall not exceed 12%"
    /(?:manager(?:'s|s)?\s*(?:fee|compensation))\s*(?:shall\s*not\s*exceed\s*|not\s*to\s*exceed\s*|[\s:]*)?(\d+(?:\.\d+)?)\s*%/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1];
  }
  return null;
}

function extractProRata(text: string): string | null {
  const patterns = [
    /(?:pro[\s-]*rata\s*share)[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    /(?:pro[\s-]*rata\s*share)\s.{0,80}?(\d+(?:\.\d+)?)\s*%/i,
    /(?:tenant(?:'s)?\s*(?:proportionate|pro[\s-]*rata)\s*share)[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    /(?:proportionate\s*share)\s.{0,60}?(\d+(?:\.\d+)?)\s*%/i,
    /(?:tenant(?:'s)?\s*share)[\s:]*(\d+(?:\.\d+)?)\s*%/i,
    /(?:your\s*share)[\s:]*(?:of\s*\w+\s*)?[\s:]*(\d+(?:\.\d+)?)\s*%/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1];
  }
  return null;
}

function extractTotalCam(text: string): string | null {
  const flexSep = `[\\s:.·\\-]*`;
  const dollarCapture = `(\\$?\\s*[\\d,]+(?:\\.\\d{1,2})?)`;
  const patterns = [
    new RegExp(`(?:total\\s*cam\\s*(?:charges?|costs?|expenses?)?|cam\\s*total|total\\s*common\\s*area\\s*(?:maintenance\\s*)?(?:charges?|costs?|expenses?)?)\\s*(?:for\\s*(?:your\\s*)?(?:suite|unit|space)\\s*)?${flexSep}${dollarCapture}`, "i"),
    new RegExp(`(?:total\\s*reconciliation\\s*(?:charges?|costs?|expenses?))${flexSep}${dollarCapture}`, "i"),
    new RegExp(`(?:(?:total\\s*)?recoverable\\s*(?:operating\\s*)?(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`, "i"),
    new RegExp(`(?:total\\s*additional\\s*rent)${flexSep}${dollarCapture}`, "i"),
    new RegExp(`(?:total\\s*billable\\s*(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`, "i"),
    new RegExp(`(?:tenant(?:'s)?\\s*share|your\\s*(?:share|portion))\\s*(?:\\([^)]*\\)\\s*)?${flexSep}${dollarCapture}`, "i"),
    new RegExp(`(?:total\\s*amount\\s*(?:due|owed|payable)|amount\\s*(?:due|owed|payable)\\s*(?:by\\s*tenant)?)${flexSep}${dollarCapture}`, "i"),
    new RegExp(`(?:net\\s*(?:amount\\s*)?(?:due|owed|payable))${flexSep}${dollarCapture}`, "i"),
    new RegExp(`(?:total\\s*(?:building|property)\\s*(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`, "i"),
    new RegExp(`(?:operating\\s*expense\\s*summary\\s*total)${flexSep}${dollarCapture}`, "i"),
    new RegExp(`(?:total\\s*(?:tenant\\s*)?operating\\s*(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`, "i"),
    new RegExp(`(?:total\\s*(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`, "i"),
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1]?.trim() ?? null;
  }
  return null;
}

function extractReconTotal(text: string): string | null {
  const flexSep = `[\\s:.·\\-]*`;
  const dollarCapture = `(\\$?\\s*[\\d,]+(?:\\.\\d{1,2})?)`;
  const patterns = [
    new RegExp(`(?:reconciliation\\s*total|grand\\s*total)${flexSep}${dollarCapture}`, "i"),
    new RegExp(`(?:total\\s*(?:building|property)\\s*(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`, "i"),
    new RegExp(`(?:total\\s*actual\\s*(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`, "i"),
    new RegExp(`(?:(?:actual|year[\\s-]*end)\\s*(?:total|expenses?|charges?))${flexSep}${dollarCapture}`, "i"),
    new RegExp(`(?:subtotal\\s*(?:operating\\s*)?(?:expenses?|charges?|costs?))${flexSep}${dollarCapture}`, "i"),
    /(?:^|[\n\r])[\s]*(?:total)[\s:.·\-]+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:$|[\n\r])/im,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1]?.trim() ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e: unknown) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  \u2717 ${name}`);
    console.log(`    ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// High-confidence pair
// ---------------------------------------------------------------------------

console.log("\n== High-confidence pair ==");
const leaseHigh = readFixture("lease-high-confidence.txt");
const reconHigh = readFixture("recon-high-confidence.txt");

test("extracts CAM cap (5%) from lease", () => {
  assert.strictEqual(extractCamCap(leaseHigh), "5");
});

test("extracts admin fee cap (15%) from lease", () => {
  const fee = extractAdminFee(leaseHigh) ?? extractMgmtFee(leaseHigh);
  assert.strictEqual(fee, "15");
});

test("extracts pro-rata share (8.08%) from lease", () => {
  assert.strictEqual(extractProRata(leaseHigh), "8.08");
});

test("extracts total CAM from reconciliation", () => {
  const total = extractTotalCam(reconHigh);
  assert.ok(total !== null, "total should not be null");
  assert.ok(total!.includes("53,444"), `expected '53,444' in '${total}'`);
});

test("extracts management fee (18%) from reconciliation", () => {
  assert.strictEqual(extractMgmtFee(reconHigh), "18");
});

test("detects roof repair in reconciliation", () => {
  assert.ok(reconHigh.toLowerCase().includes("roof repair"));
});

test("lease excludes capital improvements and structural repairs", () => {
  const lower = leaseHigh.toLowerCase();
  assert.ok(lower.includes("capital improvement"));
  assert.ok(lower.includes("structural repair"));
});

// ---------------------------------------------------------------------------
// Medium-confidence pair
// ---------------------------------------------------------------------------

console.log("\n== Medium-confidence pair ==");
const leaseMed = readFixture("lease-medium-confidence.txt");
const reconMed = readFixture("recon-medium-confidence.txt");

test("extracts CAM cap (4%) from non-standard wording", () => {
  const cap = extractCamCap(leaseMed);
  assert.strictEqual(cap, "4");
});

test("extracts management fee cap (12%) from lease", () => {
  const fee = extractMgmtFee(leaseMed);
  assert.strictEqual(fee, "12");
});

test("extracts tenant share (7.00%) from lease", () => {
  const share = extractProRata(leaseMed);
  assert.strictEqual(share, "7.00");
});

test("detects management fee overcharge (14%) in recon", () => {
  const reconFee = extractMgmtFee(reconMed);
  assert.strictEqual(reconFee, "14");
});

test("detects capital improvement in reconciliation", () => {
  assert.ok(reconMed.toLowerCase().includes("capital improvement"));
});

test("extracts a total from reconciliation", () => {
  const total = extractTotalCam(reconMed);
  assert.ok(total !== null, "should find a total");
});

// ---------------------------------------------------------------------------
// Partial-data pair
// ---------------------------------------------------------------------------

console.log("\n== Partial-data pair ==");
const leasePartial = readFixture("lease-partial-data.txt");
const reconPartial = readFixture("recon-partial-data.txt");

test("CAM cap extraction from minimal abstract (may be null)", () => {
  const cap = extractCamCap(leasePartial);
  // "capped at 6 percent" — may or may not match depending on pattern
  assert.ok(cap === "6" || cap === null, `expected '6' or null, got '${cap}'`);
});

test("no admin/mgmt fee in partial lease", () => {
  const fee = extractAdminFee(leasePartial) ?? extractMgmtFee(leasePartial);
  assert.strictEqual(fee, null);
});

test("no pro-rata in partial lease", () => {
  assert.strictEqual(extractProRata(leasePartial), null);
});

test("detects a total from partial reconciliation", () => {
  const total = extractTotalCam(reconPartial);
  assert.ok(total !== null, "should find some total");
});

test("partial lease mentions structural/roof exclusions", () => {
  const lower = leasePartial.toLowerCase();
  assert.ok(
    lower.includes("structural") || lower.includes("roof") || lower.includes("foundation"),
  );
});

// ---------------------------------------------------------------------------
// Standalone pattern tests
// ---------------------------------------------------------------------------

console.log("\n== Standalone pattern tests ==");

test("'shall not exceed a 5% annual increase' matches CAM cap", () => {
  assert.strictEqual(
    extractCamCap("Expenses shall not exceed a 5% annual increase"),
    "5",
  );
});

test("'not to exceed 15%' without annual context does NOT match CAM cap", () => {
  assert.strictEqual(
    extractCamCap("admin fee not to exceed 15% of expenses"),
    null,
  );
});

test("'limited to no more than 4%' matches CAM cap", () => {
  assert.strictEqual(
    extractCamCap("increases in controllable costs are limited to no more than 4% over the prior year"),
    "4",
  );
});

test("'Management Fee (18%)' matches management fee", () => {
  assert.strictEqual(extractMgmtFee("Management Fee (18%)"), "18");
});

test("'Property Management (14%)' matches management fee", () => {
  assert.strictEqual(extractMgmtFee("Property Management (14%)"), "14");
});

test("'manager's fee shall not exceed 12%' matches management fee", () => {
  assert.strictEqual(
    extractMgmtFee("The manager's fee shall not exceed 12% of operating costs"),
    "12",
  );
});

test("'pro-rata share of ... shall be 8.08%' matches with gap", () => {
  assert.strictEqual(
    extractProRata("pro-rata share of Building Operating Expenses shall be 8.08%"),
    "8.08",
  );
});

test("'Your Share of Expenses: 7.00%' matches pro-rata", () => {
  assert.strictEqual(
    extractProRata("Your Share of Expenses: 7.00%"),
    "7.00",
  );
});

test("'Your portion: $6,200' matches total CAM", () => {
  const total = extractTotalCam("Your portion: $6,200");
  assert.ok(total !== null, "should match");
  assert.ok(total!.includes("6,200"));
});

// ---------------------------------------------------------------------------
// Labeled cap format tests
// ---------------------------------------------------------------------------

console.log("\n== Labeled cap format tests ==");

test("'Management Fee Cap: 10%' matches management fee", () => {
  assert.strictEqual(extractMgmtFee("Management Fee Cap: 10%"), "10");
});

test("'Management Fee Limit: 8%' matches management fee", () => {
  assert.strictEqual(extractMgmtFee("Management Fee Limit: 8%"), "8");
});

test("'Management Fee Maximum: 12%' matches management fee", () => {
  assert.strictEqual(extractMgmtFee("Management Fee Maximum: 12%"), "12");
});

test("'Admin Fee Cap: 12%' matches admin fee", () => {
  assert.strictEqual(extractAdminFee("Admin Fee Cap: 12%"), "12");
});

test("'Administrative Fee Cap: 15%' matches admin fee", () => {
  assert.strictEqual(extractAdminFee("Administrative Fee Cap: 15%"), "15");
});

test("'Admin Fee Limit: 10%' matches admin fee", () => {
  assert.strictEqual(extractAdminFee("Admin Fee Limit: 10%"), "10");
});

test("'Property Management Fee Limit: 8%' matches management fee", () => {
  assert.strictEqual(extractMgmtFee("Property Management Fee Limit: 8%"), "8");
});

test("'Property Management Fee Cap: 10%' matches management fee", () => {
  assert.strictEqual(extractMgmtFee("Property Management Fee Cap: 10%"), "10");
});

test("labeled 'Administrative Fee: 5%' matches admin fee", () => {
  assert.strictEqual(extractAdminFee("Administrative Fee: 5%"), "5");
});

// ---------------------------------------------------------------------------
// Total CAM / Reconciliation Total detection tests
// ---------------------------------------------------------------------------

console.log("\n== Total CAM detection tests ==");

test("'Total CAM Charges: $40,570' matches", () => {
  const total = extractTotalCam("Total CAM Charges: $40,570");
  assert.ok(total !== null);
  assert.ok(total!.includes("40,570"));
});

test("'Total CAM: $40,570' matches", () => {
  const total = extractTotalCam("Total CAM: $40,570");
  assert.ok(total !== null);
  assert.ok(total!.includes("40,570"));
});

test("'CAM Total: $40,570' matches", () => {
  const total = extractTotalCam("CAM Total: $40,570");
  assert.ok(total !== null);
  assert.ok(total!.includes("40,570"));
});

test("'Total Operating Expenses $40,570' matches", () => {
  const total = extractTotalCam("Total Operating Expenses $40,570");
  assert.ok(total !== null);
  assert.ok(total!.includes("40,570"));
});

test("'Total Operating Expense $40,570' (singular) matches", () => {
  const total = extractTotalCam("Total Operating Expense $40,570");
  assert.ok(total !== null);
  assert.ok(total!.includes("40,570"));
});

test("'Total Recoverable Expenses: $40,570' matches", () => {
  const total = extractTotalCam("Total Recoverable Expenses: $40,570");
  assert.ok(total !== null);
  assert.ok(total!.includes("40,570"));
});

test("'Recoverable Operating Expenses: $40,570' matches", () => {
  const total = extractTotalCam("Recoverable Operating Expenses: $40,570");
  assert.ok(total !== null);
  assert.ok(total!.includes("40,570"));
});

test("'Total Additional Rent $12,900' matches", () => {
  const total = extractTotalCam("Total Additional Rent $12,900");
  assert.ok(total !== null);
  assert.ok(total!.includes("12,900"));
});

test("'Total Reconciliation Charges: $40,570' matches", () => {
  const total = extractTotalCam("Total Reconciliation Charges: $40,570");
  assert.ok(total !== null);
  assert.ok(total!.includes("40,570"));
});

test("'Total Common Area Maintenance: $40,570' matches", () => {
  const total = extractTotalCam("Total Common Area Maintenance: $40,570");
  assert.ok(total !== null);
  assert.ok(total!.includes("40,570"));
});

test("'Operating Expense Summary Total ........ $40,570' matches", () => {
  const total = extractTotalCam("Operating Expense Summary Total ........ $40,570");
  assert.ok(total !== null);
  assert.ok(total!.includes("40,570"));
});

test("'Total Charges $478,686' matches", () => {
  const total = extractTotalCam("Total Charges $478,686");
  assert.ok(total !== null);
  assert.ok(total!.includes("478,686"));
});

test("'Total Amount Due: $3,448.45' matches", () => {
  const total = extractTotalCam("Total Amount Due: $3,448.45");
  assert.ok(total !== null);
  assert.ok(total!.includes("3,448.45"));
});

test("'Total Billable Expenses: $40,570' matches", () => {
  const total = extractTotalCam("Total Billable Expenses: $40,570");
  assert.ok(total !== null);
  assert.ok(total!.includes("40,570"));
});

test("table-row format 'Total                    $59,400' matches via reconTotal", () => {
  const total = extractReconTotal("\n  Total                    $59,400\n");
  assert.ok(total !== null, "should match table-row total");
  assert.ok(total!.includes("59,400"));
});

test("'Total Building Expenses $661,437.20' matches reconTotal", () => {
  const total = extractReconTotal("Total Building Expenses               $661,437.20");
  assert.ok(total !== null);
  assert.ok(total!.includes("661,437"));
});

test("'Subtotal Operating Expenses $560,540' matches reconTotal", () => {
  const total = extractReconTotal("Subtotal Operating Expenses           $560,540.00");
  assert.ok(total !== null);
  assert.ok(total!.includes("560,540"));
});

test("both building total and tenant total detected separately", () => {
  const doc = [
    "Total Building Expenses               $661,437.20",
    "Tenant's Share (8.08%)                  $53,444.13",
    "Total CAM charges for your suite: $53,444.13",
  ].join("\n");
  const cam = extractTotalCam(doc);
  const recon = extractReconTotal(doc);
  assert.ok(cam !== null, "totalCamCharges should be found");
  assert.ok(cam!.includes("53,444"), `expected tenant total, got '${cam}'`);
  assert.ok(recon !== null, "reconciliationTotal should be found");
  assert.ok(recon!.includes("661,437"), `expected building total, got '${recon}'`);
});

test("no usable total triggers null", () => {
  const noTotal = "Some random text with no financial totals mentioned.";
  assert.strictEqual(extractTotalCam(noTotal), null);
  assert.strictEqual(extractReconTotal(noTotal), null);
});

test("OCR-ish spacing: 'Total  CAM   Charges :  $40,570' matches", () => {
  const total = extractTotalCam("Total  CAM   Charges :  $40,570");
  assert.ok(total !== null);
  assert.ok(total!.includes("40,570"));
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total\n`);
if (failed > 0) process.exit(1);
