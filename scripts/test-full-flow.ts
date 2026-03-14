/**
 * Full end-to-end flow test: Creates PDFs from fixture text, then runs them
 * through the EXACT same code path as the browser upload flow.
 *
 * This reveals any difference between:
 *   - test-pipeline.ts (raw text → extractFields → runAudit)
 *   - browser flow (PDF buffers → validateDocuments → runAudit)
 *
 * Usage: npx tsx scripts/test-full-flow.ts
 */

import * as fs from "fs";
import * as path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function createPdfFromText(text: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontSize = 10;
  const margin = 50;
  const lineHeight = fontSize * 1.4;

  // Split text into lines
  const rawLines = text.split("\n");

  // Paginate
  let page = doc.addPage([612, 792]); // Letter
  let y = 792 - margin;

  for (const rawLine of rawLines) {
    if (y < margin + lineHeight) {
      page = doc.addPage([612, 792]);
      y = 792 - margin;
    }
    const line = rawLine.replace(/\r/g, "");
    page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
    y -= lineHeight;
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function main() {
  const fixturesDir = path.resolve(__dirname, "../src/services/__tests__/fixtures");
  const leaseText = fs.readFileSync(path.join(fixturesDir, "lease-high-confidence.txt"), "utf-8");
  const reconText = fs.readFileSync(path.join(fixturesDir, "recon-high-confidence.txt"), "utf-8");

  console.log("=== STEP 1: Creating PDFs from fixture text ===");
  const leasePdf = await createPdfFromText(leaseText);
  const reconPdf = await createPdfFromText(reconText);
  console.log(`Lease PDF: ${leasePdf.length} bytes`);
  console.log(`Recon PDF: ${reconPdf.length} bytes`);

  // === STEP 2: Run through validateDocuments (same as browser flow) ===
  console.log("\n=== STEP 2: Running validateDocuments (browser path) ===");
  const { validateDocuments } = await import("../src/services/document-validator");

  const validation = await validateDocuments(leasePdf, reconPdf);

  console.log(`\n--- Validation Result ---`);
  console.log(`canProceed: ${validation.canProceed}`);
  console.log(`auditMode: ${validation.auditMode}`);
  console.log(`confidence: ${validation.confidence} (${validation.confidenceScore}/100)`);
  console.log(`leaseClassification: ${validation.leaseClassification.type} (${validation.leaseClassification.tier})`);
  console.log(`reconClassification: ${validation.reconClassification.type} (${validation.reconClassification.tier})`);
  console.log(`wasSwapped: ${validation.wasSwapped}`);
  console.log(`leaseExtractionMethod: ${validation.leaseExtractionMethod}`);
  console.log(`reconExtractionMethod: ${validation.reconExtractionMethod}`);
  console.log(`userMessage: ${validation.userMessage}`);
  console.log(`issues: ${JSON.stringify(validation.issues)}`);

  console.log(`\n--- Extracted Lease Fields (browser path) ---`);
  console.log(`CAM Cap: ${validation.leaseFields.camCapPercentage ?? "NULL"}`);
  console.log(`Admin Fee: ${validation.leaseFields.adminFeePercentage ?? "NULL"}`);
  console.log(`Management Fee: ${validation.leaseFields.managementFee ?? "NULL"}`);
  console.log(`Pro-Rata Share: ${validation.leaseFields.proRataShare ?? "NULL"}`);
  console.log(`Tenant SqFt: ${validation.leaseFields.tenantPremisesSqFt ?? "NULL"}`);
  console.log(`Building SqFt: ${validation.leaseFields.buildingTotalSqFt ?? "NULL"}`);
  console.log(`Excluded Terms: [${validation.leaseFields.excludedTerms.join(", ")}]`);
  console.log(`Stated Share: ${validation.leaseFields.statedTenantSharePercent ?? "NULL"}`);

  console.log(`\n--- Extracted Recon Fields (browser path) ---`);
  console.log(`Total CAM: ${validation.reconFields.totalCamCharges ?? "NULL"}`);
  console.log(`Recon Total: ${validation.reconFields.reconciliationTotal ?? "NULL"}`);
  console.log(`Derived Total: ${validation.reconFields.derivedTotal}`);
  console.log(`Pro-Rata Share: ${validation.reconFields.proRataShare ?? "NULL"}`);
  console.log(`Admin Fee: ${validation.reconFields.adminFeePercentage ?? "NULL"}`);
  console.log(`Management Fee: ${validation.reconFields.managementFee ?? "NULL"}`);
  console.log(`Prior Year Total: ${validation.reconFields.priorYearTotal ?? "NULL"}`);
  console.log(`Recon Year: ${validation.reconFields.reconciliationYear ?? "NULL"}`);
  console.log(`Line Items: ${validation.reconFields.lineItems.length}`);
  console.log(`Expense Categories: ${validation.reconFields.expenseCategories.length}`);

  // === Compare text extraction ===
  console.log(`\n--- Text Extraction Comparison ---`);
  console.log(`Original lease text length: ${leaseText.length}`);
  console.log(`Extracted lease text length: ${validation.leaseText.length}`);
  console.log(`Original recon text length: ${reconText.length}`);
  console.log(`Extracted recon text length: ${validation.reconText.length}`);

  // Show first 500 chars of extracted text
  console.log(`\nExtracted lease text preview:`);
  console.log(validation.leaseText.substring(0, 500).replace(/[\n\r]+/g, " | "));
  console.log(`\nExtracted recon text preview:`);
  console.log(validation.reconText.substring(0, 500).replace(/[\n\r]+/g, " | "));

  if (!validation.canProceed) {
    console.log("\n*** AUDIT CANNOT PROCEED — validation rejected ***");
    console.log(`Reason: ${validation.userMessage}`);
    return;
  }

  // === STEP 3: Run audit (same as browser flow) ===
  console.log("\n=== STEP 3: Running runAudit (browser path) ===");
  const { runAudit } = await import("../src/services/audit-logic");
  const result = await runAudit(validation);

  console.log(`\n--- Audit Result (browser path) ---`);
  console.log(`savings_estimate: $${result.savings_estimate}`);
  console.log(`estimated_overcharge: $${result.estimated_overcharge}`);
  console.log(`confidence: ${result.confidence} (${result.confidenceScore})`);
  console.log(`auditMode: ${result.auditMode}`);
  console.log(`free_findings (${result.free_findings.length}):`);
  for (const f of result.free_findings) {
    console.log(`  [${f.severity}] ${f.category}: $${f.potential_savings}${f.insufficientData ? " (insufficient)" : ""}`);
  }
  console.log(`paid_findings (${result.paid_findings.length}):`);
  for (const f of result.paid_findings) {
    console.log(`  [${f.severity}] ${f.category}: $${f.potential_savings}${f.insufficientData ? " (insufficient)" : ""}`);
  }
  console.log(`overcharge_breakdown (${result.overcharge_breakdown.length}):`);
  for (const ob of result.overcharge_breakdown) {
    console.log(`  ${ob.category}: total=$${ob.total_expense}, tenant_charge=$${ob.tenant_charge}`);
  }

  // === STEP 4: Compare with direct text pipeline ===
  console.log("\n=== STEP 4: Running direct text pipeline (test-pipeline path) ===");
  const { extractFields } = await import("../src/services/document-validator");
  const directLeaseFields = extractFields(leaseText);
  const directReconFields = extractFields(reconText);

  const directValidation = {
    leaseClassification: { type: "lease" as const, confidence: 0.9, tier: "high_confidence" as const, matchedKeywords: [] },
    reconClassification: { type: "reconciliation" as const, confidence: 0.9, tier: "high_confidence" as const, matchedKeywords: [] },
    leaseText,
    reconText,
    leaseFields: directLeaseFields,
    reconFields: directReconFields,
    wasSwapped: false,
    leaseExtractionMethod: "pdf_text" as const,
    reconExtractionMethod: "pdf_text" as const,
    issues: [] as Array<{ field: string; message: string }>,
    confidence: "high" as const,
    confidenceScore: 85,
    canProceed: true,
    auditMode: "full" as const,
    userMessage: null,
  };

  const directResult = await runAudit(directValidation);

  console.log(`\n--- Direct Text Result ---`);
  console.log(`savings_estimate: $${directResult.savings_estimate}`);
  console.log(`free_findings: ${directResult.free_findings.length}`);
  console.log(`paid_findings: ${directResult.paid_findings.length}`);

  // === FINAL COMPARISON ===
  console.log("\n=== COMPARISON ===");
  console.log(`Browser path: ${result.free_findings.length} free + ${result.paid_findings.length} paid = ${result.free_findings.length + result.paid_findings.length} total, $${result.savings_estimate} savings`);
  console.log(`Direct path:  ${directResult.free_findings.length} free + ${directResult.paid_findings.length} paid = ${directResult.free_findings.length + directResult.paid_findings.length} total, $${directResult.savings_estimate} savings`);

  if (result.savings_estimate !== directResult.savings_estimate) {
    console.log("\n*** MISMATCH DETECTED: Browser and direct paths produce different results ***");

    // Detail the differences
    console.log("\nField differences:");
    const leaseFieldKeys = ["camCapPercentage", "adminFeePercentage", "managementFee", "proRataShare", "tenantPremisesSqFt", "buildingTotalSqFt", "statedTenantSharePercent"] as const;
    for (const key of leaseFieldKeys) {
      const browserVal = validation.leaseFields[key];
      const directVal = directLeaseFields[key];
      if (browserVal !== directVal) {
        console.log(`  lease.${key}: browser="${browserVal}" vs direct="${directVal}"`);
      }
    }

    const reconFieldKeys = ["totalCamCharges", "reconciliationTotal", "proRataShare", "adminFeePercentage", "managementFee", "priorYearTotal", "reconciliationYear"] as const;
    for (const key of reconFieldKeys) {
      const browserVal = validation.reconFields[key];
      const directVal = directReconFields[key];
      if (browserVal !== directVal) {
        console.log(`  recon.${key}: browser="${browserVal}" vs direct="${directVal}"`);
      }
    }
  } else {
    console.log("\n✓ Both paths produce identical results");
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
