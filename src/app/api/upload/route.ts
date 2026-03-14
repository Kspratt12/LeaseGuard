import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "invoices";

/** Hard timeout for the entire processing pipeline (4 minutes). */
const PROCESSING_TIMEOUT_MS = 4 * 60 * 1000;

/** Per-step timeout (2 minutes). */
const STEP_TIMEOUT_MS = 2 * 60 * 1000;

/** Race a promise against a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout: ${label} exceeded ${ms / 1000}s`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Extra reconciliation buffers for multi-year comparison. */
interface ExtraRecon {
  buffer: Buffer;
  name: string;
}

/**
 * Background processing: validate, audit, generate PDF, upload report, update DB.
 * Runs after the response has been sent to the client.
 */
async function processAudit(
  auditId: string,
  leaseBuffer: Buffer,
  reconBuffer: Buffer,
  supabase: SupabaseClient,
  docNames?: { leaseDocName?: string; reconDocName?: string },
  extraRecons?: ExtraRecon[],
) {
  try {
    console.log(`[process:${auditId}] Setting status to processing...`);
    await supabase
      .from("audits")
      .update({ status: "processing" })
      .eq("id", auditId);

    // Lazy-load heavy processing modules
    console.log(`[process:${auditId}] Loading processing modules...`);
    const { validateDocuments } = await import("@/services/document-validator");
    const { runAudit } = await import("@/services/audit-logic");
    const { generateReportPdf } = await import("@/services/report-pdf");
    console.log(`[process:${auditId}] Processing modules loaded OK`);

    // Step 1: Validate documents
    console.log(`[process:${auditId}] Validating documents...`);
    const validation = await withTimeout(
      validateDocuments(leaseBuffer, reconBuffer),
      STEP_TIMEOUT_MS,
      "document validation",
    );

    if (validation.issues.length > 0) {
      console.log(
        `[process:${auditId}] Validation issues:`,
        JSON.stringify(validation.issues),
      );
    }
    if (validation.wasSwapped) {
      console.log(`[process:${auditId}] Documents were auto-swapped.`);
    }
    console.log(
      `[process:${auditId}] Confidence: ${validation.confidence} (${validation.confidenceScore}/100), mode: ${validation.auditMode}`,
    );
    console.log(
      `[process:${auditId}] Lease tier: ${validation.leaseClassification.tier}, Recon tier: ${validation.reconClassification.tier}`,
    );
    console.log(
      `[process:${auditId}] Extraction methods — lease: ${validation.leaseExtractionMethod}, recon: ${validation.reconExtractionMethod}`,
    );

    // === COMPREHENSIVE DEBUG LOGGING ===
    // 1. Files being used
    console.log(`[process:${auditId}] === FILES ===`);
    console.log(`[process:${auditId}] Lease: "${docNames?.leaseDocName ?? "unknown"}" (${leaseBuffer.length} bytes)`);
    console.log(`[process:${auditId}] Recon: "${docNames?.reconDocName ?? "unknown"}" (${reconBuffer.length} bytes)`);
    if (extraRecons && extraRecons.length > 0) {
      for (const er of extraRecons) {
        console.log(`[process:${auditId}] Extra recon: "${er.name}" (${er.buffer.length} bytes)`);
      }
    }

    // 2-3. Extracted text previews
    console.log(`[process:${auditId}] === EXTRACTED TEXT ===`);
    console.log(`[process:${auditId}] Lease text length: ${validation.leaseText.length} chars`);
    console.log(`[process:${auditId}] Lease text preview: ${validation.leaseText.substring(0, 300).replace(/[\n\r]+/g, " | ")}`);
    console.log(`[process:${auditId}] Recon text length: ${validation.reconText.length} chars`);
    console.log(`[process:${auditId}] Recon text preview: ${validation.reconText.substring(0, 300).replace(/[\n\r]+/g, " | ")}`);

    // 4-9. Parsed lease clauses
    console.log(`[process:${auditId}] === LEASE FIELDS ===`);
    console.log(`[process:${auditId}] CAM Cap: ${validation.leaseFields.camCapPercentage ?? "NULL"}`);
    console.log(`[process:${auditId}] Admin Fee: ${validation.leaseFields.adminFeePercentage ?? "NULL"}`);
    console.log(`[process:${auditId}] Management Fee: ${validation.leaseFields.managementFee ?? "NULL"}`);
    console.log(`[process:${auditId}] Pro-Rata Share: ${validation.leaseFields.proRataShare ?? "NULL"}`);
    console.log(`[process:${auditId}] Tenant SqFt: ${validation.leaseFields.tenantPremisesSqFt ?? "NULL"}`);
    console.log(`[process:${auditId}] Building SqFt: ${validation.leaseFields.buildingTotalSqFt ?? "NULL"}`);
    console.log(`[process:${auditId}] Excluded Terms: [${validation.leaseFields.excludedTerms.join(", ")}]`);
    console.log(`[process:${auditId}] Stated Tenant Share: ${validation.leaseFields.statedTenantSharePercent ?? "NULL"}`);

    // 10-11. Parsed CAM data
    console.log(`[process:${auditId}] === RECON FIELDS ===`);
    console.log(`[process:${auditId}] Total CAM Charges: ${validation.reconFields.totalCamCharges ?? "NULL"}`);
    console.log(`[process:${auditId}] Reconciliation Total: ${validation.reconFields.reconciliationTotal ?? "NULL"}`);
    console.log(`[process:${auditId}] Derived Total: ${validation.reconFields.derivedTotal}`);
    console.log(`[process:${auditId}] Prior Year Total: ${validation.reconFields.priorYearTotal ?? "NULL"}`);
    console.log(`[process:${auditId}] Recon Year: ${validation.reconFields.reconciliationYear ?? "NULL"}`);
    console.log(`[process:${auditId}] Pro-Rata Share: ${validation.reconFields.proRataShare ?? "NULL"}`);
    console.log(`[process:${auditId}] Admin Fee: ${validation.reconFields.adminFeePercentage ?? "NULL"}`);
    console.log(`[process:${auditId}] Management Fee: ${validation.reconFields.managementFee ?? "NULL"}`);
    console.log(`[process:${auditId}] Line Items (${validation.reconFields.lineItems.length}):`);
    for (const li of validation.reconFields.lineItems.slice(0, 20)) {
      console.log(`[process:${auditId}]   ${li.category}: $${li.amount}`);
    }
    console.log(`[process:${auditId}] Expense Categories: [${validation.reconFields.expenseCategories.join(", ")}]`);

    // If totals not found, log diagnostic info
    if (!validation.reconFields.totalCamCharges && !validation.reconFields.reconciliationTotal) {
      const reconPreview = validation.reconText.substring(0, 500).replace(/\n/g, "\\n");
      console.log(`[process:${auditId}] WARNING: No totals found. Recon text preview: ${reconPreview}`);
      const totalLines = validation.reconText
        .split(/[\n\r]+/)
        .filter((line: string) => /total/i.test(line))
        .map((line: string) => line.trim().substring(0, 120));
      console.log(`[process:${auditId}] Lines containing "total": ${JSON.stringify(totalLines)}`);
    }

    // Step 2: If validation fails, stop
    if (!validation.canProceed) {
      console.log(
        `[process:${auditId}] Validation failed: ${validation.userMessage}`,
      );
      await supabase
        .from("audits")
        .update({
          status: "error",
          error_message: validation.userMessage,
        })
        .eq("id", auditId);
      return;
    }

    // Step 2b: Build multi-year reconciliation data if extra recons provided
    const { extractTextFromPdf, extractFields, normalizeNumber } = await import(
      "@/services/document-validator"
    );
    const { extractReconFieldsWithAI } = await import(
      "@/services/ai-extraction"
    );

    let multiYearReconciliations:
      | Array<{
          year: number;
          total: number;
          lineItems: Array<{ category: string; amount: string; rawLine: string }>;
          docName?: string;
        }>
      | undefined;

    // Include the primary reconciliation in multi-year data
    const primaryReconFields = validation.reconFields;
    const primaryYear = primaryReconFields.reconciliationYear;
    const primaryTotal = primaryReconFields.totalCamCharges
      ? normalizeNumber(primaryReconFields.totalCamCharges)
      : primaryReconFields.reconciliationTotal
        ? normalizeNumber(primaryReconFields.reconciliationTotal)
        : null;

    if (extraRecons && extraRecons.length > 0) {
      console.log(
        `[process:${auditId}] Processing ${extraRecons.length} extra reconciliation(s) for multi-year comparison...`,
      );
      const yearEntries: Array<{
        year: number;
        total: number;
        lineItems: Array<{ category: string; amount: string; rawLine: string }>;
        docName?: string;
      }> = [];

      // Add primary recon if it has year + total
      if (primaryYear != null && primaryTotal != null && primaryTotal > 0) {
        yearEntries.push({
          year: primaryYear,
          total: primaryTotal,
          lineItems: primaryReconFields.lineItems,
          docName: docNames?.reconDocName,
        });
      }

      // Process each extra recon
      for (const extra of extraRecons) {
        try {
          const extraction = await extractTextFromPdf(extra.buffer);
          console.log(`[process:${auditId}] Extra recon "${extra.name}": extracted ${extraction.text.length} chars via ${extraction.method}`);
          console.log(`[process:${auditId}] Extra recon "${extra.name}" text preview: ${extraction.text.substring(0, 200).replace(/[\n\r]+/g, " | ")}`);

          let fields = extractFields(extraction.text);

          // Supplement with AI extraction for extra recons too
          try {
            const aiFields = await extractReconFieldsWithAI(extraction.text);
            if (aiFields) {
              console.log(`[process:${auditId}] Extra recon "${extra.name}" AI extraction successful`);
              // Merge AI fields: AI takes priority for missing regex fields
              fields = {
                ...fields,
                totalCamCharges: (aiFields.totalCamCharges?.replace(/^\$\s*/, "") ?? null) || fields.totalCamCharges,
                reconciliationTotal: (aiFields.reconciliationTotal?.replace(/^\$\s*/, "") ?? null) || fields.reconciliationTotal,
                reconciliationYear: aiFields.reconciliationYear ?? fields.reconciliationYear,
              };
            }
          } catch (aiErr) {
            console.warn(`[process:${auditId}] Extra recon "${extra.name}" AI extraction failed:`, aiErr);
          }

          const yr = fields.reconciliationYear;
          const tot = fields.totalCamCharges
            ? normalizeNumber(fields.totalCamCharges)
            : fields.reconciliationTotal
              ? normalizeNumber(fields.reconciliationTotal)
              : null;

          console.log(`[process:${auditId}] Extra recon "${extra.name}" fields: year=${yr}, totalCam=${fields.totalCamCharges ?? "NULL"}, reconTotal=${fields.reconciliationTotal ?? "NULL"}, lineItems=${fields.lineItems.length}`);

          if (yr != null && tot != null && tot > 0) {
            yearEntries.push({
              year: yr,
              total: tot,
              lineItems: fields.lineItems,
              docName: extra.name,
            });
            console.log(
              `[process:${auditId}] Extra recon "${extra.name}": year=${yr}, total=$${tot.toLocaleString()}, lineItems=${fields.lineItems.length}`,
            );
          } else {
            console.log(
              `[process:${auditId}] Extra recon "${extra.name}": FAILED to extract — year=${yr}, total=${tot}`,
            );
            // Log lines containing "total" or year patterns for diagnosis
            const totalLines = extraction.text
              .split(/[\n\r]+/)
              .filter((line: string) => /total|20\d{2}|reconciliation/i.test(line))
              .map((line: string) => line.trim().substring(0, 120));
            if (totalLines.length > 0) {
              console.log(`[process:${auditId}] Extra recon diagnostic lines: ${JSON.stringify(totalLines.slice(0, 10))}`);
            }
          }
        } catch (err) {
          console.warn(
            `[process:${auditId}] Failed to process extra recon "${extra.name}":`,
            err,
          );
        }
      }

      if (yearEntries.length >= 2) {
        multiYearReconciliations = yearEntries;
        console.log(
          `[process:${auditId}] Multi-year comparison enabled with ${yearEntries.length} years`,
        );
      }
    }

    // Step 3: Run audit
    console.log(`[process:${auditId}] Running audit...`);
    const multiYearUploadedButFailed =
      extraRecons != null &&
      extraRecons.length > 0 &&
      (multiYearReconciliations == null || multiYearReconciliations.length < 2);
    const result = await withTimeout(
      runAudit(validation, {
        leaseDocName: docNames?.leaseDocName,
        reconDocName: docNames?.reconDocName,
        multiYearReconciliations,
        multiYearUploadedButFailed,
      }),
      STEP_TIMEOUT_MS,
      "audit analysis",
    );
    // 13-16. Discrepancy detection output, findings, savings
    console.log(`[process:${auditId}] === AUDIT RESULTS ===`);
    console.log(`[process:${auditId}] Savings estimate: $${result.savings_estimate}`);
    console.log(`[process:${auditId}] Estimated overcharge: $${result.estimated_overcharge}`);
    console.log(`[process:${auditId}] Confidence: ${result.confidence} (${result.confidenceScore}/100)`);
    console.log(`[process:${auditId}] Audit mode: ${result.auditMode}`);
    console.log(`[process:${auditId}] Free findings (${result.free_findings.length}):`);
    for (const f of result.free_findings) {
      console.log(`[process:${auditId}]   [${f.severity}] ${f.category}: $${f.potential_savings}${f.insufficientData ? " (insufficient)" : ""}`);
    }
    console.log(`[process:${auditId}] Paid findings (${result.paid_findings.length}):`);
    for (const f of result.paid_findings) {
      console.log(`[process:${auditId}]   [${f.severity}] ${f.category}: $${f.potential_savings}${f.insufficientData ? " (insufficient)" : ""}`);
    }
    if (result.overcharge_breakdown.length > 0) {
      console.log(`[process:${auditId}] Overcharge breakdown:`);
      for (const ob of result.overcharge_breakdown) {
        console.log(`[process:${auditId}]   ${ob.category}: total=$${ob.total_expense}, tenant_charge=$${ob.tenant_charge}`);
      }
    }
    if (result.validationWarning) {
      console.log(`[process:${auditId}] Validation warning: ${result.validationWarning}`);
    }

    // Step 4: Generate PDF report
    console.log(`[process:${auditId}] Generating PDF report...`);
    const pdfBuffer = await withTimeout(
      generateReportPdf({
        auditId,
        createdAt: new Date().toISOString(),
        savingsEstimate: result.savings_estimate,
        freeFindings: result.free_findings,
        paidFindings: result.paid_findings,
        isPaid: false,
        confidence: result.confidence,
        confidenceScore: result.confidenceScore,
        validationWarning: result.validationWarning,
        estimatedOvercharge: result.estimated_overcharge,
        overchargeBreakdown: result.overcharge_breakdown,
        leaseClausesSummary: result.leaseClausesSummary,
      }),
      STEP_TIMEOUT_MS,
      "PDF generation",
    );
    console.log(`[process:${auditId}] PDF report generated (${pdfBuffer.length} bytes)`);

    // Step 5: Upload report
    console.log(`[process:${auditId}] Uploading report to storage...`);
    const reportPath = `${auditId}/report.pdf`;
    const { error: reportUploadErr } = await withTimeout(
      supabase.storage.from(BUCKET).upload(reportPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      }),
      STEP_TIMEOUT_MS,
      "report upload",
    );
    if (reportUploadErr) {
      throw new Error(`Report upload failed: ${reportUploadErr.message}`);
    }
    console.log(`[process:${auditId}] Report uploaded OK`);

    // 17. Final payload stored to DB
    // Step 6: Update audit record with results.
    // Split into core fields (must succeed) and analytics fields (best-effort)
    // so a missing optional column cannot block the audit from completing.
    console.log(`[process:${auditId}] === STORING TO DB ===`);
    console.log(`[process:${auditId}] savings_estimate: $${result.savings_estimate}`);
    console.log(`[process:${auditId}] free_findings count: ${result.free_findings.length}`);
    console.log(`[process:${auditId}] paid_findings count: ${result.paid_findings.length}`);
    console.log(`[process:${auditId}] estimated_overcharge: $${result.estimated_overcharge}`);
    console.log(`[process:${auditId}] overcharge_breakdown count: ${result.overcharge_breakdown.length}`);

    const coreUpdate = {
      status: "completed" as const,
      savings_estimate: result.savings_estimate,
      free_findings: result.free_findings,
      paid_findings: result.paid_findings,
      report_pdf_url: reportPath,
      error_message: null,
      estimated_overcharge: result.estimated_overcharge,
      overcharge_breakdown: result.overcharge_breakdown,
    };

    const { error: coreErr } = await supabase
      .from("audits")
      .update(coreUpdate)
      .eq("id", auditId);

    if (coreErr) {
      console.error(`[process:${auditId}] Core update failed:`, coreErr.message);
      throw new Error(`Core DB update failed: ${coreErr.message}`);
    }
    console.log(`[process:${auditId}] Core fields written OK`);

    // Analytics / metadata fields — best-effort (missing columns won't block audit)
    const analyticsUpdate = {
      confidence: result.confidence,
      confidence_score: result.confidenceScore,
      validation_warning: result.validationWarning,
      was_swapped: result.wasSwapped,
      audit_mode: result.auditMode,
      lease_extraction_method: result.leaseExtractionMethod,
      recon_extraction_method: result.reconExtractionMethod,
      lease_clauses_summary: result.leaseClausesSummary,
    };

    const { error: analyticsErr } = await supabase
      .from("audits")
      .update(analyticsUpdate)
      .eq("id", auditId);

    if (analyticsErr) {
      console.warn(
        `[process:${auditId}] Analytics update failed (non-fatal):`,
        analyticsErr.message,
      );
    } else {
      console.log(`[process:${auditId}] Analytics fields written OK`);
    }

    console.log(`[process:${auditId}] ✓ Audit record updated — status: completed`);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown processing error";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[process:${auditId}] Processing error:`, message);
    if (stack) console.error(`[process:${auditId}] Stack trace:`, stack);

    try {
      await supabase
        .from("audits")
        .update({
          status: "error",
          error_message: message,
        })
        .eq("id", auditId);
      console.log(`[process:${auditId}] Audit record updated — status: error`);
    } catch (dbErr) {
      console.error(`[process:${auditId}] CRITICAL: Failed to set error status:`, dbErr);
    }
  }
}

export async function POST(req: NextRequest) {
  let auditId: string | undefined;

  try {
    // --- Parse form data ---
    console.log("[upload] Parsing form data...");
    let form: FormData;
    try {
      form = await req.formData();
    } catch (formErr) {
      console.error("[upload] Failed to parse form data:", formErr);
      return NextResponse.json(
        { success: false, error: "Invalid form data. Please upload valid PDF files." },
        { status: 400 },
      );
    }
    console.log("[upload] Form data parsed OK");

    const lease = form.get("lease") as File | null;
    const recon = form.get("recon") as File | null;

    if (!lease || !recon) {
      return NextResponse.json(
        { success: false, error: "Both lease and reconciliation PDFs are required." },
        { status: 400 },
      );
    }

    if (lease.type !== "application/pdf" || recon.type !== "application/pdf") {
      return NextResponse.json(
        { success: false, error: "Only PDF files are accepted." },
        { status: 400 },
      );
    }

    // --- Collect extra reconciliation files for multi-year comparison ---
    const extraReconFiles: ExtraRecon[] = [];
    const extraReconEntries = form.getAll("extraRecons");
    for (const entry of extraReconEntries) {
      if (entry instanceof File && entry.type === "application/pdf") {
        extraReconFiles.push({
          buffer: Buffer.from(await entry.arrayBuffer()),
          name: entry.name,
        });
      }
    }
    if (extraReconFiles.length > 0) {
      console.log(`[upload] ${extraReconFiles.length} extra reconciliation file(s) detected for multi-year comparison`);
    }

    // --- Read file buffers ---
    console.log("[upload] Reading file buffers...");
    const leaseBuffer = Buffer.from(await lease.arrayBuffer());
    const reconBuffer = Buffer.from(await recon.arrayBuffer());
    console.log(
      `[upload] Buffers ready — lease: ${leaseBuffer.length} bytes, recon: ${reconBuffer.length} bytes`,
    );

    const supabase = createServiceClient();
    auditId = randomUUID();

    // --- Upload lease PDF ---
    console.log(`[upload:${auditId}] Uploading lease to storage...`);
    const leasePath = `${auditId}/lease.pdf`;
    const { error: leaseErr } = await supabase.storage
      .from(BUCKET)
      .upload(leasePath, leaseBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (leaseErr) {
      console.error(`[upload:${auditId}] Lease storage upload failed:`, leaseErr.message);
      return NextResponse.json(
        { success: false, error: "Lease file upload failed. Please try again." },
        { status: 500 },
      );
    }
    console.log(`[upload:${auditId}] Lease uploaded OK`);

    // --- Upload recon PDF ---
    console.log(`[upload:${auditId}] Uploading recon to storage...`);
    const reconPath = `${auditId}/recon.pdf`;
    const { error: reconErr } = await supabase.storage
      .from(BUCKET)
      .upload(reconPath, reconBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (reconErr) {
      console.error(`[upload:${auditId}] Recon storage upload failed:`, reconErr.message);
      return NextResponse.json(
        { success: false, error: "Reconciliation file upload failed. Please try again." },
        { status: 500 },
      );
    }
    console.log(`[upload:${auditId}] Recon uploaded OK`);

    // --- Build public URLs ---
    const { data: leaseUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(leasePath);
    const { data: reconUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(reconPath);

    // --- Create audit row ---
    console.log(`[upload:${auditId}] Inserting audit row...`);
    const { error: dbErr } = await supabase.from("audits").insert({
      id: auditId,
      lease_url: leaseUrlData.publicUrl,
      recon_url: reconUrlData.publicUrl,
      status: "pending",
    });

    if (dbErr) {
      console.error(`[upload:${auditId}] Database insert failed:`, dbErr.message);
      return NextResponse.json(
        { success: false, error: "Failed to create audit record. Please try again." },
        { status: 500 },
      );
    }
    console.log(`[upload:${auditId}] Audit row created OK`);

    // --- Return immediately, process in background ---
    // The client will poll GET /api/audit/[id] to track progress.
    console.log(`[upload:${auditId}] Returning response, starting background processing...`);

    // Use after() to keep the serverless function alive until processing
    // completes. Without this, Vercel may terminate the function after
    // the response is sent, leaving the audit stuck in "processing".
    const capturedAuditId = auditId;
    const capturedLeaseDocName = lease.name;
    const capturedReconDocName = recon.name;
    const capturedExtraRecons = extraReconFiles.length > 0 ? extraReconFiles : undefined;

    after(async () => {
      try {
        await withTimeout(
          processAudit(
            capturedAuditId,
            leaseBuffer,
            reconBuffer,
            supabase,
            { leaseDocName: capturedLeaseDocName, reconDocName: capturedReconDocName },
            capturedExtraRecons,
          ),
          PROCESSING_TIMEOUT_MS,
          "overall processing",
        );
      } catch (err) {
        // Safety net: if the overall timeout fires and processAudit's own
        // catch didn't run, force the row to error.
        console.error(`[process:${capturedAuditId}] Overall timeout/error:`, err);
        try {
          await supabase
            .from("audits")
            .update({
              status: "error",
              error_message: err instanceof Error ? err.message : "Processing timed out",
            })
            .eq("id", capturedAuditId);
        } catch { /* best-effort */ }
      }
    });

    return NextResponse.json({ success: true, id: capturedAuditId });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err);
    const stack =
      err instanceof Error ? err.stack : undefined;
    console.error("[upload] Unhandled route error:", message);
    if (stack) console.error("[upload] Stack trace:", stack);

    return NextResponse.json(
      { success: false, error: "Something went wrong processing your documents. Please try again." },
      { status: 500 },
    );
  }
}
