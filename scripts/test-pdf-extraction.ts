/**
 * Diagnostic test: create PDFs matching user's described content
 * and run them through the full extraction pipeline.
 *
 * Usage: npx tsx scripts/test-pdf-extraction.ts
 */

import { PDFDocument, StandardFonts } from "pdf-lib";

// ── Create test PDFs ─────────────────────────────────────────────────

async function createLeasePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]); // US Letter

  let y = 740;
  const write = (text: string, f = font, size = 11) => {
    page.drawText(text, { x: 50, y, font: f, size });
    y -= size + 6;
  };

  write("COMMERCIAL LEASE AGREEMENT", boldFont, 16);
  y -= 10;
  write("This Lease Agreement is entered into as of January 15, 2024,");
  write("by and between GREENFIELD PROPERTIES LLC (\"Landlord\")");
  write("and SUMMIT RETAIL GROUP INC. (\"Tenant\").");
  y -= 10;
  write("SECTION 1 - PREMISES", boldFont, 13);
  write("Landlord leases to Tenant the premises at Suite 240,");
  write("500 Commerce Drive, Springfield, IL 62704 (the \"Premises\"),");
  write("consisting of approximately 4,200 rentable square feet within");
  write("the Building containing approximately 52,000 rentable square");
  write("feet of leasable area.");
  y -= 10;
  write("SECTION 2 - OPERATING EXPENSES AND CAM CHARGES", boldFont, 13);
  y -= 4;
  write("Pro Rata Share: Tenant's pro-rata share shall be 8.5%.");
  y -= 4;
  write("CAM Cap: Controllable operating expenses shall not exceed");
  write("10% annually over the prior year's actual expenses.");
  y -= 4;
  write("Administrative Fee Cap: 5% of CAM charges.");
  y -= 4;
  write("Management Fee Cap: 4% of operating expenses.");
  y -= 10;
  write("SECTION 3 - EXCLUDED EXPENSES", boldFont, 13);
  write("The following shall not be included in Operating Expenses:");
  write("  (a) Capital improvements or capital expenditures;");
  write("  (b) Structural repairs to the roof, foundation, or walls;");
  write("  (c) Depreciation or amortization of the Building;");
  write("  (d) Leasing commissions or brokerage fees;");
  write("  (e) Environmental remediation costs;");
  write("  (f) Debt service or mortgage payments.");

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function createReconPdf(year: number, total: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);

  let y = 740;
  const write = (text: string, f = font, size = 11) => {
    page.drawText(text, { x: 50, y, font: f, size });
    y -= size + 6;
  };

  write("GREENFIELD PROPERTIES LLC", boldFont, 14);
  write(`CAM Reconciliation - ${year}`, boldFont, 14);
  y -= 6;
  write("Tenant: Summit Retail Group Inc.");
  write("Suite: 240");
  write(`For the Year Ending December 31, ${year}`);
  y -= 10;
  write("OPERATING EXPENSE SUMMARY", boldFont, 12);
  y -= 6;

  // Line items with amounts matching user's described content
  const items: [string, number][] =
    year === 2024
      ? [
          ["Maintenance", 30000],
          ["Utilities", 12000],
          ["Insurance", 9000],
          ["Landscaping", 11525],
          ["Administrative Fee", 6500],
        ]
      : [
          ["Maintenance", 32000],
          ["Utilities", 13000],
          ["Insurance", 9500],
          ["Landscaping", 12000],
          ["Administrative Fee", 7000],
        ];

  for (const [cat, amt] of items) {
    const amtStr = `$${amt.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const padding = " ".repeat(Math.max(2, 45 - cat.length - amtStr.length));
    write(`${cat}${padding}${amtStr}`);
  }

  y -= 6;
  write("----------------------------------------------------");
  const totalStr = `$${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  write(`Total CAM Charges${" ".repeat(Math.max(2, 45 - 17 - totalStr.length))}${totalStr}`, boldFont);
  y -= 10;
  write(`Reconciliation Year: ${year}`);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

// ── Run extraction pipeline ──────────────────────────────────────────

async function main() {
  console.log("=== LeaseGuard Extraction Pipeline Diagnostic ===\n");

  // Create test PDFs
  console.log("Creating test PDFs...");
  const leaseBuf = await createLeasePdf();
  const recon2024Buf = await createReconPdf(2024, 69025);
  const recon2025Buf = await createReconPdf(2025, 73500);
  console.log(`  Lease PDF: ${leaseBuf.length} bytes`);
  console.log(`  Recon 2024 PDF: ${recon2024Buf.length} bytes`);
  console.log(`  Recon 2025 PDF: ${recon2025Buf.length} bytes`);

  // Import extraction functions
  const { extractTextFromPdf, extractFields, normalizeNumber } = await import(
    "../src/services/document-validator"
  );

  // ── Step 1: Extract text ───────────────────────────────────────────
  console.log("\n--- STEP 1: PDF Text Extraction ---\n");

  const leaseExtraction = await extractTextFromPdf(leaseBuf);
  console.log(`Lease: ${leaseExtraction.text.length} chars via ${leaseExtraction.method}`);
  console.log(`Lease text (first 1000 chars):\n---\n${leaseExtraction.text.substring(0, 1000)}\n---\n`);

  const recon2024Extraction = await extractTextFromPdf(recon2024Buf);
  console.log(`Recon 2024: ${recon2024Extraction.text.length} chars via ${recon2024Extraction.method}`);
  console.log(`Recon 2024 text (first 1000 chars):\n---\n${recon2024Extraction.text.substring(0, 1000)}\n---\n`);

  const recon2025Extraction = await extractTextFromPdf(recon2025Buf);
  console.log(`Recon 2025: ${recon2025Extraction.text.length} chars via ${recon2025Extraction.method}`);
  console.log(`Recon 2025 text (first 1000 chars):\n---\n${recon2025Extraction.text.substring(0, 1000)}\n---\n`);

  // ── Step 2: Extract fields ─────────────────────────────────────────
  console.log("\n--- STEP 2: Field Extraction (regex) ---\n");

  const leaseFields = extractFields(leaseExtraction.text);
  console.log("LEASE FIELDS:");
  console.log(`  CAM Cap:           ${leaseFields.camCapPercentage ?? "NULL"}`);
  console.log(`  Admin Fee:         ${leaseFields.adminFeePercentage ?? "NULL"}`);
  console.log(`  Management Fee:    ${leaseFields.managementFee ?? "NULL"}`);
  console.log(`  Pro Rata Share:    ${leaseFields.proRataShare ?? "NULL"}`);
  console.log(`  Tenant SqFt:       ${leaseFields.tenantPremisesSqFt ?? "NULL"}`);
  console.log(`  Building SqFt:     ${leaseFields.buildingTotalSqFt ?? "NULL"}`);
  console.log(`  Excluded Terms:    [${leaseFields.excludedTerms.join(", ")}]`);
  console.log(`  Line Items:        ${leaseFields.lineItems.length}`);

  const reconFields2024 = extractFields(recon2024Extraction.text);
  console.log("\nRECON 2024 FIELDS:");
  console.log(`  Total CAM:         ${reconFields2024.totalCamCharges ?? "NULL"}`);
  console.log(`  Recon Total:       ${reconFields2024.reconciliationTotal ?? "NULL"}`);
  console.log(`  Recon Year:        ${reconFields2024.reconciliationYear ?? "NULL"}`);
  console.log(`  Pro Rata Share:    ${reconFields2024.proRataShare ?? "NULL"}`);
  console.log(`  Admin Fee:         ${reconFields2024.adminFeePercentage ?? "NULL"}`);
  console.log(`  Management Fee:    ${reconFields2024.managementFee ?? "NULL"}`);
  console.log(`  Prior Year Total:  ${reconFields2024.priorYearTotal ?? "NULL"}`);
  console.log(`  Derived Total:     ${reconFields2024.derivedTotal}`);
  console.log(`  Line Items:        ${reconFields2024.lineItems.length}`);
  if (reconFields2024.lineItems.length > 0) {
    console.log("  Line items detail:");
    for (const li of reconFields2024.lineItems) {
      console.log(`    ${li.category}: ${li.amount}`);
    }
  }
  console.log(`  Expense Categories: [${reconFields2024.expenseCategories.join(", ")}]`);

  const reconFields2025 = extractFields(recon2025Extraction.text);
  console.log("\nRECON 2025 FIELDS:");
  console.log(`  Total CAM:         ${reconFields2025.totalCamCharges ?? "NULL"}`);
  console.log(`  Recon Total:       ${reconFields2025.reconciliationTotal ?? "NULL"}`);
  console.log(`  Recon Year:        ${reconFields2025.reconciliationYear ?? "NULL"}`);
  console.log(`  Line Items:        ${reconFields2025.lineItems.length}`);
  if (reconFields2025.lineItems.length > 0) {
    console.log("  Line items detail:");
    for (const li of reconFields2025.lineItems) {
      console.log(`    ${li.category}: ${li.amount}`);
    }
  }

  // ── Step 3: Validate findings would be generated ───────────────────
  console.log("\n--- STEP 3: Findings Assessment ---\n");

  const reconTotal = reconFields2024.totalCamCharges
    ? normalizeNumber(reconFields2024.totalCamCharges)
    : reconFields2024.reconciliationTotal
      ? normalizeNumber(reconFields2024.reconciliationTotal)
      : null;

  console.log(`Recon total (numeric): ${reconTotal}`);
  console.log(`CAM cap found: ${leaseFields.camCapPercentage ?? "NULL"}`);
  console.log(`Pro rata found: ${leaseFields.proRataShare ?? "NULL"}`);

  if (leaseFields.camCapPercentage && reconTotal) {
    console.log("PASS: WOULD GENERATE: CAM Cap finding");
  } else {
    console.log("FAIL: WOULD NOT generate CAM Cap finding");
    if (!leaseFields.camCapPercentage) console.log("  Reason: no CAM cap extracted from lease");
    if (!reconTotal) console.log("  Reason: no recon total extracted");
  }

  if (leaseFields.adminFeePercentage) {
    console.log("PASS: WOULD GENERATE: Admin Fee finding");
  } else {
    console.log("FAIL: WOULD NOT generate Admin Fee finding");
  }

  if (reconFields2024.reconciliationYear) {
    console.log(`PASS: Year detected: ${reconFields2024.reconciliationYear}`);
  } else {
    console.log("FAIL: No year detected — multi-year comparison WOULD FAIL");
  }

  // Multi-year check
  const yr2024 = reconFields2024.reconciliationYear;
  const tot2024 = reconFields2024.totalCamCharges
    ? normalizeNumber(reconFields2024.totalCamCharges)
    : reconFields2024.reconciliationTotal
      ? normalizeNumber(reconFields2024.reconciliationTotal)
      : null;
  const yr2025 = reconFields2025.reconciliationYear;
  const tot2025 = reconFields2025.totalCamCharges
    ? normalizeNumber(reconFields2025.totalCamCharges)
    : reconFields2025.reconciliationTotal
      ? normalizeNumber(reconFields2025.reconciliationTotal)
      : null;

  console.log(`\nMulti-year data: 2024 → year=${yr2024}, total=${tot2024}; 2025 → year=${yr2025}, total=${tot2025}`);
  if (yr2024 && tot2024 && yr2025 && tot2025) {
    const increase = ((tot2025 - tot2024) / tot2024) * 100;
    console.log(`PASS: Multi-year comparison possible — ${increase.toFixed(1)}% increase`);
  } else {
    console.log("FAIL: Multi-year comparison would fail");
  }

  console.log("\n=== Diagnostic Complete ===");
}

main().catch(console.error);
