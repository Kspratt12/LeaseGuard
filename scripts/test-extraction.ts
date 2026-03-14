/**
 * Targeted extraction test: exercises extractFields with various
 * text formats to identify where dollar amount detection fails.
 *
 * Usage: npx tsx scripts/test-extraction.ts
 */

import * as fs from "fs";
import * as path from "path";

async function main() {
  const { extractFields, normalizeNumber } = await import(
    "../src/services/document-validator"
  );

  // --- Test 1: Standard fixture text (baseline) ---
  console.log("=== TEST 1: Standard fixture text ===");
  const fixturesDir = path.resolve(
    __dirname,
    "../src/services/__tests__/fixtures",
  );
  const reconText = fs.readFileSync(
    path.join(fixturesDir, "recon-high-confidence.txt"),
    "utf-8",
  );
  const fields1 = extractFields(reconText);
  console.log(`totalCamCharges: ${fields1.totalCamCharges}`);
  console.log(`reconciliationTotal: ${fields1.reconciliationTotal}`);
  console.log(`managementFee: ${fields1.managementFee}`);
  console.log(`lineItems: ${fields1.lineItems.length}`);
  console.log(`priorYearTotal: ${JSON.stringify(fields1.priorYearTotal)}`);

  // --- Test 2: PDF-like text (amounts without $ on next line) ---
  console.log("\n=== TEST 2: Amounts on next line ===");
  const reconText2 = `
CAM Reconciliation Statement
Calendar Year 2024
Tenant's Pro-Rata Share: 8.08%

Operating Expenses
Property Tax          192340.00
Insurance              51200.00
Maintenance            67800.00
Roof Repair            24500.00
Management Fee (18%)  100897.20

Total Building Expenses
661437.20

Total CAM charges for your suite
53444.13
`;
  const fields2 = extractFields(reconText2);
  console.log(`totalCamCharges: ${fields2.totalCamCharges}`);
  console.log(`reconciliationTotal: ${fields2.reconciliationTotal}`);
  console.log(`managementFee: ${fields2.managementFee}`);
  console.log(`lineItems: ${fields2.lineItems.length}`);

  // --- Test 3: PDF-like text (no $ signs, no commas) ---
  console.log("\n=== TEST 3: No $ signs, no commas ===");
  const reconText3 = `
Annual CAM Reconciliation
Calendar Year 2024
Tenant Share: 8.08%

Operating Expenses:
Property Tax                    192340
Building Insurance               51200
Common Area Maintenance          67800
Roof Repair                      24500
Management Fee (18%)            100897

Total Operating Expenses        560540
Management Fee                  100897
Total Building Expenses         661437
Tenant's Share (8.08%)           53444
`;
  const fields3 = extractFields(reconText3);
  console.log(`totalCamCharges: ${fields3.totalCamCharges}`);
  console.log(`reconciliationTotal: ${fields3.reconciliationTotal}`);
  console.log(`managementFee: ${fields3.managementFee}`);
  console.log(`lineItems: ${fields3.lineItems.length}`);
  for (const li of fields3.lineItems) {
    console.log(`  ${li.category}: ${li.amount}`);
  }

  // --- Test 4: PDF OCR-like text (extra spaces, line noise) ---
  console.log("\n=== TEST 4: OCR-style text ===");
  const reconText4 = `
GREENFIELD PROPERTIES LLC
ANNUAL CAM RECONCILIATION STATEMENT
Calendar Year 2024

Tenant: Summit Retail Group Inc.
Suite: 240

Tenant's Pro-Rata Share: 8.08%

OPERATING EXPENSE SUMMARY

Category                                    Actual
Property Tax                           192,340.00
Building Insurance                      51,200.00
Common Area Maintenance                 67,800.00
Roof Repair                             24,500.00
Management Fee (18%)                   100,897.20

Total Building Expenses                661,437.20

Tenant's Share (8.08%)                  53,444.13
`;
  const fields4 = extractFields(reconText4);
  console.log(`totalCamCharges: ${fields4.totalCamCharges}`);
  console.log(`reconciliationTotal: ${fields4.reconciliationTotal}`);
  console.log(`managementFee: ${fields4.managementFee}`);
  console.log(`lineItems: ${fields4.lineItems.length}`);

  // --- Test 5: dollarCapture bare comma bug ---
  console.log("\n=== TEST 5: dollarCapture bare comma bug ===");
  const leaseText = fs.readFileSync(
    path.join(fixturesDir, "lease-high-confidence.txt"),
    "utf-8",
  );
  const leaseFields = extractFields(leaseText);
  console.log(`priorYearTotal: ${JSON.stringify(leaseFields.priorYearTotal)}`);
  if (leaseFields.priorYearTotal && leaseFields.priorYearTotal.trim() === ",") {
    console.log("*** BUG CONFIRMED: priorYearTotal is bare comma ***");
    const normalized = normalizeNumber(leaseFields.priorYearTotal);
    console.log(`normalizeNumber(",") = ${normalized} (NaN = ${isNaN(normalized)})`);
  }

  // --- Test 6: Medium confidence fixtures ---
  console.log("\n=== TEST 6: Medium confidence fixtures ===");
  const leaseMed = fs.readFileSync(
    path.join(fixturesDir, "lease-medium-confidence.txt"),
    "utf-8",
  );
  const reconMed = fs.readFileSync(
    path.join(fixturesDir, "recon-medium-confidence.txt"),
    "utf-8",
  );
  const leaseFieldsMed = extractFields(leaseMed);
  const reconFieldsMed = extractFields(reconMed);
  console.log("Lease fields:");
  console.log(`  camCap: ${leaseFieldsMed.camCapPercentage}`);
  console.log(`  adminFee: ${leaseFieldsMed.adminFeePercentage}`);
  console.log(`  mgmtFee: ${leaseFieldsMed.managementFee}`);
  console.log(`  proRata: ${leaseFieldsMed.proRataShare}`);
  console.log(`  tenantSqFt: ${leaseFieldsMed.tenantPremisesSqFt}`);
  console.log(`  buildingSqFt: ${leaseFieldsMed.buildingTotalSqFt}`);
  console.log(`  excludedTerms: [${leaseFieldsMed.excludedTerms.join(", ")}]`);
  console.log("Recon fields:");
  console.log(`  totalCam: ${reconFieldsMed.totalCamCharges}`);
  console.log(`  reconTotal: ${reconFieldsMed.reconciliationTotal}`);
  console.log(`  mgmtFee: ${reconFieldsMed.managementFee}`);
  console.log(`  lineItems: ${reconFieldsMed.lineItems.length}`);
  console.log(`  expenseCategories: [${reconFieldsMed.expenseCategories.join(", ")}]`);

  // Run audit with medium confidence
  const { runAudit } = await import("../src/services/audit-logic");
  const validationMed = {
    leaseClassification: { type: "lease" as const, confidence: 0.7, tier: "high_confidence" as const, matchedKeywords: [] },
    reconClassification: { type: "reconciliation" as const, confidence: 0.7, tier: "high_confidence" as const, matchedKeywords: [] },
    leaseText: leaseMed,
    reconText: reconMed,
    leaseFields: leaseFieldsMed,
    reconFields: reconFieldsMed,
    wasSwapped: false,
    leaseExtractionMethod: "pdf_text" as const,
    reconExtractionMethod: "pdf_text" as const,
    issues: [] as Array<{ field: string; message: string }>,
    confidence: "medium" as const,
    confidenceScore: 70,
    canProceed: true,
    auditMode: "full" as const,
    userMessage: null,
  };
  const resultMed = await runAudit(validationMed);
  console.log("\nMedium confidence audit results:");
  console.log(`  savings: $${resultMed.savings_estimate}`);
  console.log(`  overcharge: $${resultMed.estimated_overcharge}`);
  console.log(`  free findings: ${resultMed.free_findings.length}`);
  console.log(`  paid findings: ${resultMed.paid_findings.length}`);
  for (const f of [...resultMed.free_findings, ...resultMed.paid_findings]) {
    console.log(`    [${f.severity}] ${f.category}: $${f.potential_savings}${f.insufficientData ? " (insufficient)" : ""}`);
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
