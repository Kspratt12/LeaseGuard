/**
 * Standalone pipeline test: runs extractFields + runAudit with text fixtures
 * to trace exactly where findings disappear.
 *
 * Usage: npx tsx scripts/test-pipeline.ts
 */

import * as fs from "fs";
import * as path from "path";

// Use dynamic import to handle the path alias resolution
async function main() {
  // Read test fixtures
  const fixturesDir = path.resolve(
    __dirname,
    "../src/services/__tests__/fixtures",
  );
  const leaseText = fs.readFileSync(
    path.join(fixturesDir, "lease-high-confidence.txt"),
    "utf-8",
  );
  const reconText = fs.readFileSync(
    path.join(fixturesDir, "recon-high-confidence.txt"),
    "utf-8",
  );

  console.log("=== STEP 1: Raw text loaded ===");
  console.log(`Lease text length: ${leaseText.length}`);
  console.log(`Recon text length: ${reconText.length}`);

  // Import extractFields
  const { extractFields } = await import(
    "../src/services/document-validator"
  );

  // Step 2: Extract fields
  const leaseFields = extractFields(leaseText);
  const reconFields = extractFields(reconText);

  console.log("\n=== STEP 2: Extracted lease fields ===");
  console.log(JSON.stringify(leaseFields, null, 2));

  console.log("\n=== STEP 3: Extracted recon fields ===");
  console.log(JSON.stringify(reconFields, null, 2));

  // Step 3: Build DocumentValidationResult
  const validation = {
    leaseClassification: {
      type: "lease" as const,
      confidence: 0.9,
      tier: "high_confidence" as const,
      matchedKeywords: ["lease", "tenant", "landlord"],
    },
    reconClassification: {
      type: "reconciliation" as const,
      confidence: 0.9,
      tier: "high_confidence" as const,
      matchedKeywords: ["reconciliation", "cam", "operating expenses"],
    },
    leaseText,
    reconText,
    leaseFields,
    reconFields,
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

  console.log("\n=== STEP 4: Running audit engine ===");

  const { runAudit } = await import("../src/services/audit-logic");
  const result = await runAudit(validation);

  console.log("\n=== STEP 5: Audit result ===");
  console.log(`savings_estimate: $${result.savings_estimate}`);
  console.log(`estimated_overcharge: $${result.estimated_overcharge}`);
  console.log(`free_findings (${result.free_findings.length}):`);
  for (const f of result.free_findings) {
    console.log(
      `  [${f.severity}] ${f.category}: $${f.potential_savings}${f.insufficientData ? " (insufficient)" : ""}`,
    );
    console.log(`    ${f.description.slice(0, 120)}...`);
  }
  console.log(`paid_findings (${result.paid_findings.length}):`);
  for (const f of result.paid_findings) {
    console.log(
      `  [${f.severity}] ${f.category}: $${f.potential_savings}${f.insufficientData ? " (insufficient)" : ""}`,
    );
    console.log(`    ${f.description.slice(0, 120)}...`);
  }
  console.log(`overcharge_breakdown (${result.overcharge_breakdown.length}):`);
  for (const ob of result.overcharge_breakdown) {
    console.log(
      `  ${ob.category}: total=$${ob.total_expense}, tenant_charge=$${ob.tenant_charge}`,
    );
  }

  // Summary
  const totalFindings =
    result.free_findings.length + result.paid_findings.length;
  const hasSubstantive =
    result.free_findings.some((f) => !f.insufficientData) ||
    result.paid_findings.some((f) => !f.insufficientData);

  console.log("\n=== SUMMARY ===");
  console.log(`Total findings: ${totalFindings}`);
  console.log(`Has substantive findings: ${hasSubstantive}`);
  console.log(`Savings estimate: $${result.savings_estimate}`);
  console.log(`Estimated overcharge: $${result.estimated_overcharge}`);
  console.log(`Confidence: ${result.confidence} (${result.confidenceScore})`);
  console.log(`Audit mode: ${result.auditMode}`);

  if (totalFindings === 0) {
    console.log("\n*** BUG: No findings generated! ***");
  }
  if (result.savings_estimate === 0 && result.estimated_overcharge === 0) {
    console.log("\n*** BUG: Zero savings despite findings! ***");
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
